import type { ClosedTrade } from '@/types';

/**
 * Excursion figures for one closed trade, expressed as price moves.
 *
 * Everything here deliberately stays in price space - no leverage, no fees.
 * `profit_ratio` is a return on stake and therefore already scaled by leverage,
 * so comparing it against a raw price excursion would overstate capture on
 * levered trades. Comparing move against move keeps the ratio honest.
 */
export interface TradeExcursion {
  tradeId: number;
  pair: string;
  isShort: boolean;
  /** Best move in the trade's favour, as a ratio of the open rate. Never negative. */
  mfe: number;
  /** Worst move against the trade, as a ratio of the open rate. Never negative. */
  mae: number;
  /** Move actually realised at exit, as a ratio of the open rate. May be negative. */
  realized: number;
  /** realized / mfe. Null when the price never moved in the trade's favour. */
  capture: number | null;
  exitReason?: string;
  closeTimestamp: number;
}

export interface ExcursionSummary {
  trades: TradeExcursion[];
  /** Sum(realized) / Sum(mfe) over trades that had a favourable excursion. */
  captureRatio: number | null;
  /** Middle per-trade capture - resistant to one huge trade dominating. */
  medianCapture: number | null;
  /**
   * Share of the available favourable move that was NOT realised, i.e.
   * 1 - captureRatio, floored at 0. Reads directly as "x% was given back";
   * summing the raw moves instead produces a number with no useful unit.
   */
  givenBackShare: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  /** Trades with a usable excursion. */
  analyzed: number;
  /** Closed trades that had to be skipped - missing or nonsensical rates. */
  skipped: number;
  winners: number;
  losers: number;
}

function isUsableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Derive the excursion figures for a single closed trade.
 * Returns null when the bot did not record usable rates for it.
 */
export function tradeExcursion(trade: ClosedTrade): TradeExcursion | null {
  const open = trade.open_rate;
  const close = trade.close_rate;
  const max = trade.max_rate;
  const min = trade.min_rate;

  if (!isUsableRate(open) || !isUsableRate(close) || !isUsableRate(max) || !isUsableRate(min)) {
    return null;
  }

  const isShort = trade.is_short === true;
  // A short profits when price falls, so its favourable extreme is min_rate.
  const mfe = Math.max(0, (isShort ? open - min : max - open) / open);
  const mae = Math.max(0, (isShort ? max - open : open - min) / open);
  const realized = (isShort ? open - close : close - open) / open;

  return {
    tradeId: trade.trade_id,
    pair: trade.pair,
    isShort,
    mfe,
    mae,
    realized,
    capture: mfe > 0 ? realized / mfe : null,
    exitReason: trade.exit_reason,
    closeTimestamp: trade.close_timestamp,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Aggregate excursion statistics over a set of closed trades.
 *
 * The headline `captureRatio` is sum-weighted rather than an average of
 * per-trade ratios: a trade that ran 20% in your favour matters more to the
 * account than one that ran 0.2%, and averaging ratios would weight them alike.
 */
export function summarizeExcursions(trades: ClosedTrade[]): ExcursionSummary {
  const analyzed: TradeExcursion[] = [];
  let skipped = 0;

  for (const trade of trades) {
    const excursion = tradeExcursion(trade);
    if (excursion) {
      analyzed.push(excursion);
    } else {
      skipped += 1;
    }
  }

  const withUpside = analyzed.filter((t) => t.mfe > 0);
  const mfeSum = withUpside.reduce((acc, t) => acc + t.mfe, 0);
  const realizedSum = withUpside.reduce((acc, t) => acc + t.realized, 0);

  return {
    trades: analyzed,
    captureRatio: mfeSum > 0 ? realizedSum / mfeSum : null,
    medianCapture: median(withUpside.map((t) => t.capture as number)),
    givenBackShare: mfeSum > 0 ? Math.max(0, 1 - realizedSum / mfeSum) : null,
    avgMfe: analyzed.length ? analyzed.reduce((a, t) => a + t.mfe, 0) / analyzed.length : null,
    avgMae: analyzed.length ? analyzed.reduce((a, t) => a + t.mae, 0) / analyzed.length : null,
    analyzed: analyzed.length,
    skipped,
    winners: analyzed.filter((t) => t.realized > 0).length,
    losers: analyzed.filter((t) => t.realized <= 0).length,
  };
}
