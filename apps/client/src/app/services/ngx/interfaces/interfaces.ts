import { NgxSignalDirection } from '@prisma/client';

/**
 * Client-side mirrors of the NGX API response shapes.
 *
 * The server-side declarations live under `apps/api` and are not importable
 * from the client, so they are restated here. Every field is kept nullable
 * exactly where the API leaves it nullable: the analytics store fills up one
 * trading day at a time, so partially populated rows are the normal case
 * rather than an error.
 */

export type NgxAsiTrendSource = 'DAILY_CHANGE' | 'MOVING_AVERAGE' | 'NONE';

export type NgxMarketRegime = 'BEARISH' | 'BULLISH' | 'NEUTRAL' | 'UNKNOWN';

export type NgxSignalRationaleValue = boolean | number | string | null;

export interface NgxSignalRegimeRationale {
  advDecRatio: number | null;
  asiTrendPercent: number | null;
  asiTrendSource: NgxAsiTrendSource;
  demoted: boolean;
  originalDirection: NgxSignalDirection | null;
  regime: NgxMarketRegime;
}

export interface NgxSignalRationale {
  inputs: Record<string, NgxSignalRationaleValue>;
  observations: number;
  regime?: NgxSignalRegimeRationale;
  rule: string;
  summary: string;
  thresholds: Record<string, number>;
}

export interface NgxSignalItem {
  date: string;
  direction: NgxSignalDirection;
  rationale: NgxSignalRationale | null;
  /**
   * Signed and bounded to [-1, 1]. Positive is evidence in favour of buying,
   * negative is evidence against. It is not a probability or a forecast.
   */
  score: number;
  symbol: string;
  type: string;
}

export interface NgxSignalsResponse {
  signals: NgxSignalItem[];
}

export interface NgxSignalHistoryResponse {
  signals: NgxSignalItem[];
  symbol: string;
}

export interface NgxPeriodPerformance {
  endDate: string;
  endPrice: number;
  marketCap: number | null;
  performancePercent: number | null;
  sector: string | null;
  startDate: string;
  startPrice: number;
  symbol: string;
  volume: number | null;
}

export interface NgxMoversResponse {
  days: number;
  gainers: NgxPeriodPerformance[];
  losers: NgxPeriodPerformance[];
}

export interface NgxSectorPerformance {
  advancers: number;
  companyCount: number;
  decliners: number;
  performancePercent: number | null;
  sector: string;
  totalMarketCap: number | null;
  totalVolume: number | null;
  unchanged: number;
}

export interface NgxSectorsResponse {
  days: number;
  sectors: NgxSectorPerformance[];
}

export interface NgxBreadthPoint {
  advDecRatio: number | null;
  advancers: number | null;
  asi: number | null;
  asiChangePercent: number | null;
  date: string;
  decliners: number | null;
  unchanged: number | null;
  valueTraded: number | null;
  volume: number | null;
}

export interface NgxBreadthResponse {
  breadth: NgxBreadthPoint[];
}

export interface NgxSymbolHistoryPoint {
  date: string;
  marketCap: number | null;
  price: number;
  volume: number | null;
}

export interface NgxSymbolHistoryResponse {
  high: number | null;
  historicalData: NgxSymbolHistoryPoint[];
  low: number | null;
  performancePercent: number | null;
  symbol: string;
}
