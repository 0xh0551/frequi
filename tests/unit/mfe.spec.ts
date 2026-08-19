import { describe, it, expect } from 'vitest';
import { tradeExcursion, summarizeExcursions } from '@/utils/mfe';
import type { ClosedTrade } from '@/types';

function makeTrade(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    trade_id: 1,
    pair: 'BTC/USDT',
    open_rate: 100,
    close_rate: 110,
    max_rate: 120,
    min_rate: 95,
    is_short: false,
    exit_reason: 'roi',
    close_timestamp: 1_700_000_000_000,
    ...overrides,
  } as ClosedTrade;
}

describe('mfe.ts', () => {
  it('measures a long trade against its favourable extreme', () => {
    // Ran to 120 (+20%), exited at 110 (+10%), dipped to 95 (-5%).
    const res = tradeExcursion(makeTrade())!;
    expect(res.mfe).toBeCloseTo(0.2);
    expect(res.mae).toBeCloseTo(0.05);
    expect(res.realized).toBeCloseTo(0.1);
    expect(res.capture).toBeCloseTo(0.5);
  });

  it('flips the extremes for a short trade', () => {
    // Short from 100: profits as price falls, so min_rate is the favourable side.
    const res = tradeExcursion(makeTrade({ is_short: true, close_rate: 98 }))!;
    expect(res.mfe).toBeCloseTo(0.05); // down to 95
    expect(res.mae).toBeCloseTo(0.2); // up to 120
    expect(res.realized).toBeCloseTo(0.02); // exited at 98
    expect(res.capture).toBeCloseTo(0.4);
  });

  it('reports a losing trade as negative capture', () => {
    const res = tradeExcursion(makeTrade({ close_rate: 96 }))!;
    expect(res.realized).toBeCloseTo(-0.04);
    expect(res.capture).toBeCloseTo(-0.2);
  });

  it('leaves capture undefined when price never moved in favour', () => {
    const res = tradeExcursion(makeTrade({ max_rate: 100, close_rate: 96 }))!;
    expect(res.mfe).toEqual(0);
    expect(res.capture).toBeNull();
  });

  it('skips trades without usable rates', () => {
    expect(tradeExcursion(makeTrade({ max_rate: undefined }))).toBeNull();
    expect(tradeExcursion(makeTrade({ open_rate: 0 }))).toBeNull();
    expect(tradeExcursion(makeTrade({ min_rate: Number.NaN }))).toBeNull();
  });

  it('weights the headline ratio by size, not by trade count', () => {
    const summary = summarizeExcursions([
      // Big trade: ran +20%, kept +10%.
      makeTrade({ trade_id: 1 }),
      // Small trade: ran +1%, kept all of it. Averaging ratios would say 75%.
      makeTrade({ trade_id: 2, max_rate: 101, close_rate: 101, min_rate: 100 }),
    ]);
    // (0.10 + 0.01) / (0.20 + 0.01)
    expect(summary.captureRatio).toBeCloseTo(0.11 / 0.21);
    expect(summary.medianCapture).toBeCloseTo(0.75);
    expect(summary.givenBackShare).toBeCloseTo(1 - 0.11 / 0.21);
    expect(summary.analyzed).toEqual(2);
    expect(summary.winners).toEqual(2);
  });

  it('counts unusable trades instead of dropping them silently', () => {
    const summary = summarizeExcursions([makeTrade(), makeTrade({ max_rate: undefined })]);
    expect(summary.analyzed).toEqual(1);
    expect(summary.skipped).toEqual(1);
  });

  it('returns null ratios for an empty set rather than NaN', () => {
    const summary = summarizeExcursions([]);
    expect(summary.captureRatio).toBeNull();
    expect(summary.medianCapture).toBeNull();
    expect(summary.avgMfe).toBeNull();
    expect(summary.givenBackShare).toBeNull();
    expect(summary.analyzed).toEqual(0);
  });
});
