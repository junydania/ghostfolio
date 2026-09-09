/**
 * Signal type identifiers, stored verbatim in `NgxSignal.type`.
 */
export const NGX_SIGNAL_TYPES = {
  FIFTY_TWO_WEEK_POSITION: 'FIFTY_TWO_WEEK_POSITION',
  MOVING_AVERAGE_TREND: 'MOVING_AVERAGE_TREND',
  RELATIVE_STRENGTH: 'RELATIVE_STRENGTH',
  VOLUME_ANOMALY: 'VOLUME_ANOMALY'
} as const;

export const NGX_SIGNAL_TYPE_VALUES: string[] = Object.values(NGX_SIGNAL_TYPES);

/**
 * Calendar days of snapshot history loaded for an evaluation. The hungriest
 * rule needs 31 observations (relative strength over 30 trading days), which is
 * roughly 45 calendar days; 120 leaves room for exchange holidays and gaps in
 * capture without loading a year of rows on every run.
 */
export const NGX_SIGNALS_HISTORY_WINDOW_IN_DAYS = 120;

export const MOVING_AVERAGE_TREND_CONFIG = {
  /**
   * Below the trend by more than this is treated as evidence against buying.
   * Deliberately deeper than the buy threshold: NGX equities are thinly traded
   * and dip below their own average routinely, so a shallow break is noise.
   */
  avoidDeviationPercent: -5,
  buyDeviationPercent: 3,
  /**
   * 20 observations for the average plus 5 to measure its slope. A rule that
   * fired on fewer would be reporting noise as a trend.
   */
  minimumObservations: 25,
  period: 20,
  /** Deviation, in percent, that maps to a full-strength score of 1. */
  scoreFullScaleDeviationPercent: 10,
  slopeLookback: 5
} as const;

export const FIFTY_TWO_WEEK_POSITION_CONFIG = {
  avoidPosition: 0.1,
  buyPosition: 0.9,
  /**
   * The 52-week range must span at least this fraction of the current price.
   * A near-flat range turns the position into a rounding artefact.
   */
  minimumRangeRatio: 0.05,
  watchLowerPosition: 0.15,
  watchUpperPosition: 0.85
} as const;

export const VOLUME_ANOMALY_CONFIG = {
  /** Multiple of trailing average volume that confirms the day's direction. */
  confirmationRatio: 3,
  /**
   * Trailing averages of a few hundred shares make any multiple meaningless,
   * and NGX has plenty of symbols that thin.
   */
  minimumAverageVolume: 10_000,
  /** 20 trailing observations plus the evaluated day. */
  minimumObservations: 21,
  /** Volume ratio that maps to a full-strength score of 1. */
  scoreFullScaleRatio: 5,
  trailingPeriod: 20,
  watchRatio: 2
} as const;

export const RELATIVE_STRENGTH_CONFIG = {
  avoidExcessReturnPercent: -5,
  buyExcessReturnPercent: 5,
  longPeriod: 30,
  /**
   * A median taken over a handful of symbols is not an exchange median. Below
   * this breadth the horizon is dropped rather than reported.
   */
  minimumCrossSectionSize: 20,
  /** Excess return, in percentage points, mapping to a full-strength score. */
  scoreFullScaleExcessReturnPercent: 15,
  shortPeriod: 7
} as const;

export const MARKET_REGIME_CONFIG = {
  asiMovingAveragePeriod: 10,
  bearishAdvDecRatio: 0.67,
  bullishAdvDecRatio: 1.5,
  /**
   * A BUY produced in a broadly falling market is demoted to WATCH and its
   * score halved. The gate is intentionally one-directional: it only ever
   * weakens buy-side evidence, so a wrong regime call costs a missed signal
   * rather than a bad one.
   */
  demotionScoreFactor: 0.5
} as const;

/** Decimal places used for every number written into a rationale. */
export const NGX_SIGNAL_PRECISION = 4;
