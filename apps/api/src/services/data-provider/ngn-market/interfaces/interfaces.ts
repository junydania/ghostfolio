export interface NgnMarketResponse<T> {
  data: T;
  error?: {
    code: string;
    current_plan?: string;
    message: string;
    required_plan?: string;
  };
  meta?: {
    calls_limit?: number;
    calls_remaining?: number;
    calls_used?: number;
    plan?: string;
    reset_at?: string;
  };
  success: boolean;
}

export interface NgnMarketCompanyListItem {
  change7dPercent: number | null;
  change52wPercent: number | null;
  day_high: number | null;
  day_low: number | null;
  high52wk: number | null;
  id: string;
  last_updated: string | null;
  logo_url: string | null;
  low52wk: number | null;
  market_cap: number | null;
  name: string;
  prev_close: number | null;
  price: number | null;
  price_change: number | null;
  price_change_percent: number | null;
  sector: string | null;
  shares_outstanding: number | null;
  sub_sector: string | null;
  symbol: string;
  volume: number | null;
  website: string | null;
}

export interface NgnMarketCompanyDetail extends NgnMarketCompanyListItem {
  about: string | null;
  address: string | null;
  current_price: number | null;
  date_listed: string | null;
  international_sec_id: string | null;
  market_classification: string | null;
  open_price: number | null;
}

export interface NgnMarketIdentifier {
  id: string;
  international_sec_id: string | null;
  logo_url: string | null;
  name: string;
  symbol: string;
}

export interface NgnMarketChartPoint {
  close: number | null;
  date?: string;
  timestamp?: number | string;
}

export interface NgnMarketChartResponse {
  count: number;
  data: NgnMarketChartPoint[] | (number | null)[][];
  format: string;
  statistics?: {
    end_date: string | null;
    start_date: string | null;
  };
  symbol: string;
}

export interface NgnMarketForexRate {
  currency: string;
  daily_change: number | null;
  daily_change_percent: number | null;
  inverse_rate: number | null;
  last_updated: string | null;
  rate: number | null;
}

export interface NgnMarketForexCurrentResponse {
  date: string | null;
  rates: NgnMarketForexRate[];
  target: string;
}

export interface NgnMarketForexHistoryPoint {
  currency?: string;
  date: string;
  rate: number | null;
}
