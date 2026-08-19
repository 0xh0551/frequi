import type { ClosedTrade } from '@/types';
import { tradeExcursion } from '@/utils/mfe';

/**
 * Behavioural statistics for one group of closed trades (an exit reason, a
 * direction, a duration bucket, an hour of day). All groups share this shape
 * so one chart/table component can render any of them.
 */
export interface GroupStat {
  key: string;
  label: string;
  count: number;
  /** Wins / count, using realised profit in stake currency. */
  winRate: number;
  /** Net realised profit for the group, stake currency. */
  netAbs: number;
  /** Mean profit_ratio per trade - already leveraged, matches the trade list. */
  avgRatio: number;
  /**
   * Sum-weighted MFE capture for the group (price space, see utils/mfe.ts).
   * Null when no trade in the group had a favourable excursion.
   */
  capture: number | null;
  /** Mean holding time in hours. Null when timestamps are unusable. */
  avgDurationH: number | null;
}

export interface UnderwaterPoint {
  timestamp: number;
  /** Cumulative realised profit up to and including this close. */
  cumulative: number;
  /** Distance below the running peak - zero at a fresh peak, negative below. */
  drawdown: number;
}

export interface UnderwaterSeries {
  points: UnderwaterPoint[];
  maxDrawdown: number;
  /** Close timestamps bounding the deepest excursion below a peak. */
  maxDrawdownStart: number | null;
  maxDrawdownEnd: number | null;
  finalProfit: number;
}

function usableProfit(trade: ClosedTrade): number | null {
  const profit = trade.profit_abs;
  return typeof profit === 'number' && Number.isFinite(profit) ? profit : null;
}

/**
 * Realised-profit drawdown over time.
 *
 * Built from closed trades only, in stake currency. An absolute unit is
 * deliberate: expressing drawdown relative to a near-zero realised peak turns
 * the early history into meaningless triple-digit percentages.
 */
export function underwaterSeries(trades: ClosedTrade[]): UnderwaterSeries {
  const closed = trades
    .filter((t) => usableProfit(t) !== null && Number.isFinite(t.close_timestamp))
    .sort((a, b) => a.close_timestamp - b.close_timestamp);

  const points: UnderwaterPoint[] = [];
  let cumulative = 0;
  let peak = 0;
  let peakTs: number | null = null;
  let maxDrawdown = 0;
  let maxStart: number | null = null;
  let maxEnd: number | null = null;

  for (const trade of closed) {
    cumulative += usableProfit(trade) as number;
    if (cumulative >= peak) {
      peak = cumulative;
      peakTs = trade.close_timestamp;
    }
    const drawdown = cumulative - peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxStart = peakTs;
      maxEnd = trade.close_timestamp;
    }
    points.push({ timestamp: trade.close_timestamp, cumulative, drawdown });
  }

  return {
    points,
    maxDrawdown,
    maxDrawdownStart: maxStart,
    maxDrawdownEnd: maxEnd,
    finalProfit: cumulative,
  };
}

interface GroupAccumulator {
  label: string;
  trades: ClosedTrade[];
}

function buildStats(groups: Map<string, GroupAccumulator>, keepEmpty = false): GroupStat[] {
  const stats: GroupStat[] = [];
  for (const [key, group] of groups) {
    if (group.trades.length === 0) {
      // A time axis (hours, duration buckets) must keep its empty bins - a
      // gap is information there, while an unseen exit reason is just noise.
      if (keepEmpty) {
        stats.push({
          key,
          label: group.label,
          count: 0,
          winRate: 0,
          netAbs: 0,
          avgRatio: 0,
          capture: null,
          avgDurationH: null,
        });
      }
      continue;
    }

    let wins = 0;
    let netAbs = 0;
    let ratioSum = 0;
    let durationSum = 0;
    let durationCount = 0;
    let mfeSum = 0;
    let realizedSum = 0;

    for (const trade of group.trades) {
      const profit = usableProfit(trade) ?? 0;
      if (profit > 0) wins += 1;
      netAbs += profit;
      ratioSum += trade.profit_ratio ?? 0;

      if (Number.isFinite(trade.open_timestamp) && Number.isFinite(trade.close_timestamp)) {
        const hours = (trade.close_timestamp - trade.open_timestamp) / 3_600_000;
        if (hours >= 0) {
          durationSum += hours;
          durationCount += 1;
        }
      }

      const excursion = tradeExcursion(trade);
      if (excursion && excursion.mfe > 0) {
        mfeSum += excursion.mfe;
        realizedSum += excursion.realized;
      }
    }

    stats.push({
      key,
      label: group.label,
      count: group.trades.length,
      winRate: wins / group.trades.length,
      netAbs,
      avgRatio: ratioSum / group.trades.length,
      capture: mfeSum > 0 ? realizedSum / mfeSum : null,
      avgDurationH: durationCount > 0 ? durationSum / durationCount : null,
    });
  }
  return stats;
}

/** Per exit reason, ordered by trade count - the bot's actual exit mix. */
export function exitReasonStats(trades: ClosedTrade[]): GroupStat[] {
  const groups = new Map<string, GroupAccumulator>();
  for (const trade of trades) {
    const key = trade.exit_reason || 'unknown';
    if (!groups.has(key)) groups.set(key, { label: key, trades: [] });
    groups.get(key)!.trades.push(trade);
  }
  return buildStats(groups).sort((a, b) => b.count - a.count);
}

/** Long vs. short. Shorts are attributed via `is_short`, not sign guessing. */
export function directionStats(trades: ClosedTrade[]): GroupStat[] {
  const groups = new Map<string, GroupAccumulator>([
    ['long', { label: 'Long', trades: [] }],
    ['short', { label: 'Short', trades: [] }],
  ]);
  for (const trade of trades) {
    groups.get(trade.is_short ? 'short' : 'long')!.trades.push(trade);
  }
  return buildStats(groups);
}

const DURATION_BUCKETS: { key: string; label: string; maxHours: number }[] = [
  { key: 'lt1h', label: '<1h', maxHours: 1 },
  { key: '1to4h', label: '1-4h', maxHours: 4 },
  { key: '4to12h', label: '4-12h', maxHours: 12 },
  { key: '12to24h', label: '12-24h', maxHours: 24 },
  { key: '1to3d', label: '1-3d', maxHours: 72 },
  { key: 'gt3d', label: '>3d', maxHours: Number.POSITIVE_INFINITY },
];

/** Profitability by holding time. Buckets are fixed so runs stay comparable. */
export function durationStats(trades: ClosedTrade[]): GroupStat[] {
  const groups = new Map<string, GroupAccumulator>(
    DURATION_BUCKETS.map((b) => [b.key, { label: b.label, trades: [] }]),
  );
  for (const trade of trades) {
    if (!Number.isFinite(trade.open_timestamp) || !Number.isFinite(trade.close_timestamp)) {
      continue;
    }
    const hours = (trade.close_timestamp - trade.open_timestamp) / 3_600_000;
    if (hours < 0) continue;
    const bucket = DURATION_BUCKETS.find((b) => hours < b.maxHours)!;
    groups.get(bucket.key)!.trades.push(trade);
  }
  // Ordered by bucket, not by count - the x axis is time, so order is meaning.
  return buildStats(groups, true);
}

/**
 * Profitability by the UTC hour the trade was *opened* - the entry-timing
 * fingerprint. UTC on purpose: exchanges and the bots run in UTC, and a
 * localised axis would shift the pattern depending on who is looking.
 */
export function entryHourStats(trades: ClosedTrade[]): GroupStat[] {
  const groups = new Map<string, GroupAccumulator>();
  for (let hour = 0; hour < 24; hour += 1) {
    groups.set(String(hour), { label: `${String(hour).padStart(2, '0')}`, trades: [] });
  }
  for (const trade of trades) {
    if (!Number.isFinite(trade.open_timestamp)) continue;
    const hour = new Date(trade.open_timestamp).getUTCHours();
    groups.get(String(hour))!.trades.push(trade);
  }
  return buildStats(groups, true);
}
