import { describe, it, expect } from 'vitest';
import {
  underwaterSeries,
  exitReasonStats,
  directionStats,
  durationStats,
  entryHourStats,
} from '@/utils/tradeAnalytics';
import type { ClosedTrade } from '@/types';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01 00:00 UTC

function makeTrade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    trade_id: 1,
    pair: 'BTC/USDT',
    profit_abs: 10,
    profit_ratio: 0.01,
    open_rate: 100,
    close_rate: 101,
    max_rate: 102,
    min_rate: 99,
    is_short: false,
    exit_reason: 'roi',
    open_timestamp: T0,
    close_timestamp: T0 + 2 * HOUR,
    ...overrides,
  } as ClosedTrade;
}

describe('tradeAnalytics.ts', () => {
  describe('underwaterSeries', () => {
    it('tracks the running peak and the deepest excursion below it', () => {
      const series = underwaterSeries([
        makeTrade({ profit_abs: 10, close_timestamp: T0 + 1 * HOUR }),
        makeTrade({ profit_abs: -4, close_timestamp: T0 + 2 * HOUR }),
        makeTrade({ profit_abs: -8, close_timestamp: T0 + 3 * HOUR }),
        makeTrade({ profit_abs: 20, close_timestamp: T0 + 4 * HOUR }),
        makeTrade({ profit_abs: -5, close_timestamp: T0 + 5 * HOUR }),
      ]);
      // Peak 10 -> trough -2 => max drawdown -12; new peak 18; then -5.
      expect(series.points.map((p) => p.drawdown)).toEqual([0, -4, -12, 0, -5]);
      expect(series.maxDrawdown).toEqual(-12);
      expect(series.maxDrawdownStart).toEqual(T0 + 1 * HOUR);
      expect(series.maxDrawdownEnd).toEqual(T0 + 3 * HOUR);
      expect(series.finalProfit).toEqual(13);
    });

    it('sorts by close time regardless of input order', () => {
      const series = underwaterSeries([
        makeTrade({ profit_abs: -5, close_timestamp: T0 + 2 * HOUR }),
        makeTrade({ profit_abs: 10, close_timestamp: T0 + 1 * HOUR }),
      ]);
      expect(series.points.map((p) => p.cumulative)).toEqual([10, 5]);
    });

    it('handles an empty set without NaN', () => {
      const series = underwaterSeries([]);
      expect(series.points).toEqual([]);
      expect(series.maxDrawdown).toEqual(0);
      expect(series.finalProfit).toEqual(0);
    });
  });

  describe('exitReasonStats', () => {
    it('groups by reason, ordered by count, with win rate and net profit', () => {
      const stats = exitReasonStats([
        makeTrade({ exit_reason: 'roi', profit_abs: 10 }),
        makeTrade({ exit_reason: 'roi', profit_abs: -2 }),
        makeTrade({ exit_reason: 'roi', profit_abs: 4 }),
        makeTrade({ exit_reason: 'stop_loss', profit_abs: -7 }),
      ]);
      expect(stats.map((s) => s.key)).toEqual(['roi', 'stop_loss']);
      expect(stats[0].count).toEqual(3);
      expect(stats[0].winRate).toBeCloseTo(2 / 3);
      expect(stats[0].netAbs).toEqual(12);
      expect(stats[1].winRate).toEqual(0);
    });

    it('labels a missing reason as unknown instead of dropping it', () => {
      const stats = exitReasonStats([makeTrade({ exit_reason: undefined })]);
      expect(stats[0].key).toEqual('unknown');
    });

    it('weights group capture by move size, like the headline', () => {
      const stats = exitReasonStats([
        // mfe 2% (102 on 100), realised 1%.
        makeTrade({ exit_reason: 'roi' }),
        // mfe 10%, realised 8%.
        makeTrade({ exit_reason: 'roi', max_rate: 110, close_rate: 108 }),
      ]);
      expect(stats[0].capture).toBeCloseTo((0.01 + 0.08) / (0.02 + 0.1));
    });
  });

  describe('directionStats', () => {
    it('splits by is_short and keeps both groups', () => {
      const stats = directionStats([
        makeTrade({ is_short: false, profit_abs: 5 }),
        makeTrade({ is_short: true, profit_abs: -3 }),
        makeTrade({ is_short: true, profit_abs: 6 }),
      ]);
      const long = stats.find((s) => s.key === 'long')!;
      const short = stats.find((s) => s.key === 'short')!;
      expect(long.count).toEqual(1);
      expect(short.count).toEqual(2);
      expect(short.netAbs).toEqual(3);
      expect(short.winRate).toEqual(0.5);
    });
  });

  describe('durationStats', () => {
    it('assigns trades to fixed buckets and keeps empty bins', () => {
      const stats = durationStats([
        makeTrade({ open_timestamp: T0, close_timestamp: T0 + 0.5 * HOUR }), // <1h
        makeTrade({ open_timestamp: T0, close_timestamp: T0 + 30 * HOUR }), // 1-3d
        makeTrade({ open_timestamp: T0, close_timestamp: T0 + 100 * HOUR }), // >3d
      ]);
      expect(stats.map((s) => s.key)).toEqual([
        'lt1h',
        '1to4h',
        '4to12h',
        '12to24h',
        '1to3d',
        'gt3d',
      ]);
      expect(stats.map((s) => s.count)).toEqual([1, 0, 0, 0, 1, 1]);
    });

    it('puts a boundary value in the upper bucket (1h is 1-4h)', () => {
      const stats = durationStats([
        makeTrade({ open_timestamp: T0, close_timestamp: T0 + 1 * HOUR }),
      ]);
      expect(stats.find((s) => s.key === '1to4h')!.count).toEqual(1);
      expect(stats.find((s) => s.key === 'lt1h')!.count).toEqual(0);
    });
  });

  describe('entryHourStats', () => {
    it('bins by UTC opening hour across a full 24-bin axis', () => {
      const stats = entryHourStats([
        makeTrade({ open_timestamp: Date.UTC(2026, 0, 1, 9, 30) }),
        makeTrade({ open_timestamp: Date.UTC(2026, 0, 2, 9, 5) }),
        makeTrade({ open_timestamp: Date.UTC(2026, 0, 1, 23, 59) }),
      ]);
      expect(stats).toHaveLength(24);
      expect(stats[9].count).toEqual(2);
      expect(stats[23].count).toEqual(1);
      expect(stats[0].count).toEqual(0);
    });
  });
});
