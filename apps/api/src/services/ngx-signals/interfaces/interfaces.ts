import { NgxSignalDirection } from '@prisma/client';

/**
 * The subset of `NgxCompanySnapshot` the rules read.
 *
 * Declared locally instead of reusing the Prisma model type so that every rule
 * stays callable with plain object literals, which keeps the scoring logic
 * unit-testable without a database. Every field the upstream API may omit is
 * optional and nullable, because it frequently is.
 */
export interface NgxCompanySnapshotRow {
  change52wPercent?: number | null;
  change7dPercent?: number | null;
  date: Date;
  dayHigh?: number | null;
  dayLow?: number | null;
  high52wk?: number | null;
  low52wk?: number | null;
  marketCap?: number | null;
  price: number;
  prevClose?: number | null;
  priceChangePercent?: number | null;
  sector?: string | null;
  sharesOutstanding?: number | null;
  subSector?: string | null;
  symbol: string;
  volume?: number | null;
}

/**
 * The subset of `NgxMarketSnapshot` the market regime assessment reads.
 */
export interface NgxMarketSnapshotRow {
  advDecRatio?: number | null;
  advancers?: number | null;
  asi?: number | null;
  asiChangePercent?: number | null;
  date: Date;
  deals?: number | null;
  decliners?: number | null;
  marketCapTotal?: number | null;
  turnoverRate?: number | null;
  unchanged?: number | null;
  valueTraded?: number | null;
  volume?: number | null;
  ytdAsiChangePercent?: number | null;
}

export type NgxMarketRegime = 'BEARISH' | 'BULLISH' | 'NEUTRAL' | 'UNKNOWN';

/**
 * How the ASI trend was derived. `MOVING_AVERAGE` compares the index to its own
 * average over the stored history; `DAILY_CHANGE` is the fallback used before
 * enough market snapshots have accumulated.
 */
export type NgxAsiTrendSource = 'DAILY_CHANGE' | 'MOVING_AVERAGE' | 'NONE';

export interface NgxMarketRegimeAssessment {
  advDecRatio: number | null;
  asi: number | null;
  asiMovingAverage: number | null;
  asiTrendPercent: number | null;
  asiTrendSource: NgxAsiTrendSource;
  observations: number;
  regime: NgxMarketRegime;
}

/**
 * The regime block attached to every rationale, so a reader can always tell
 * whether the broad market was falling when the signal was produced and
 * whether that changed the direction.
 */
export interface NgxSignalRegimeRationale {
  advDecRatio: number | null;
  asiTrendPercent: number | null;
  asiTrendSource: NgxAsiTrendSource;
  demoted: boolean;
  originalDirection: NgxSignalDirection | null;
  regime: NgxMarketRegime;
}

export type NgxSignalRationaleValue = boolean | number | string | null;

/**
 * Everything needed to reconstruct why a signal exists: the values that were
 * compared, the thresholds they were compared against, how much history backed
 * them and the market regime at the time. A signal without this is a bare
 * number and cannot support a buying decision.
 */
export interface NgxSignalRationale {
  inputs: Record<string, NgxSignalRationaleValue>;
  observations: number;
  regime?: NgxSignalRegimeRationale;
  rule: string;
  summary: string;
  thresholds: Record<string, number>;
}

/**
 * A signal before persistence.
 *
 * `score` is signed and bounded to [-1, 1]: positive values are evidence in
 * favour of buying, negative values evidence against. It expresses the
 * strength of the observed evidence, not a probability or a return forecast.
 */
export interface NgxSignalCandidate {
  direction: NgxSignalDirection;
  rationale: NgxSignalRationale;
  score: number;
  symbol: string;
  type: string;
}

export interface NgxExchangeReturnMedians {
  longPeriodMedian: number | null;
  longPeriodSampleSize: number;
  shortPeriodMedian: number | null;
  shortPeriodSampleSize: number;
}

export interface NgxSignalsEvaluationResult {
  createdOrUpdated: number;
  date: Date | null;
  deleted: number;
  regime: NgxMarketRegime;
  symbolsEvaluated: number;
}
