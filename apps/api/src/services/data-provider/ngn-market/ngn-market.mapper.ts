import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse
} from '@ghostfolio/common/interfaces';

import {
  AssetClass,
  AssetSubClass,
  DataSource,
  SymbolProfile
} from '@prisma/client';
import { format, isValid, parseISO } from 'date-fns';

import {
  NgnMarketChartResponse,
  NgnMarketCompanyDetail,
  NgnMarketCompanyListItem,
  NgnMarketForexCurrentResponse
} from './interfaces/interfaces';

export const NGN_MARKET_CURRENCY = 'NGN';
export const NGN_MARKET_COUNTRY_CODE = 'NG';

/**
 * NGN Market quotes currency pairs as <FOREIGN>NGN (for example USDNGN), which
 * is how Ghostfolio names the pairs it derives from DEFAULT_CURRENCY.
 */
export function isNgnCurrencyPair(symbol: string): boolean {
  return /^[A-Z]{3}NGN$/.test(symbol);
}

export function getForeignCurrencyOfPair(symbol: string): string {
  return symbol.substring(0, 3);
}

/**
 * Timestamps arrive either as an ISO date string or as an epoch number whose
 * unit is not documented. Normalize defensively rather than assume.
 */
export function normalizeChartDate(value: unknown): string | null {
  if (typeof value === 'number') {
    // Epoch values below ~1e12 are seconds, above are milliseconds
    const date = new Date(value < 1e12 ? value * 1000 : value);

    return isValid(date) ? format(date, DATE_FORMAT) : null;
  }

  if (typeof value === 'string') {
    const date = parseISO(value);

    return isValid(date) ? format(date, DATE_FORMAT) : null;
  }

  return null;
}

/**
 * Accepts every documented chart shape: compact [timestamp, close] and
 * [timestamp, open, high, low, close, volume] tuples, and detailed objects.
 * Only `close` is guaranteed non-null, so points without one are skipped —
 * writing them as zero would poison performance calculations.
 */
export function parseChartResponse(response: NgnMarketChartResponse): {
  [date: string]: DataProviderHistoricalResponse;
} {
  const result: { [date: string]: DataProviderHistoricalResponse } = {};

  if (!Array.isArray(response?.data)) {
    return result;
  }

  for (const point of response.data) {
    let date: string | null = null;
    let marketPrice: number | null = null;

    if (Array.isArray(point)) {
      date = normalizeChartDate(point[0]);

      // [timestamp, close] or [timestamp, open, high, low, close, volume]
      marketPrice = point.length >= 6 ? point[4] : point[1];
    } else if (point && typeof point === 'object') {
      date = normalizeChartDate(point.date ?? point.timestamp);
      marketPrice = point.close;
    }

    if (date && typeof marketPrice === 'number' && isFinite(marketPrice)) {
      result[date] = { marketPrice };
    }
  }

  return result;
}

/**
 * The chart endpoint silently narrows the requested range to the plan's
 * allowance instead of erroring, so the response has to be compared against
 * what was asked for.
 */
export function isRangeClamped({
  requestedFrom,
  statisticsStartDate
}: {
  requestedFrom: Date;
  statisticsStartDate?: string | null;
}): boolean {
  if (!statisticsStartDate) {
    return false;
  }

  const actualFrom = parseISO(statisticsStartDate);

  return isValid(actualFrom) && actualFrom.getTime() > requestedFrom.getTime();
}

export function toQuote({
  company,
  dataProviderInfo
}: {
  company: Pick<NgnMarketCompanyListItem, 'price' | 'symbol'> &
    Partial<NgnMarketCompanyDetail>;
  dataProviderInfo: DataProviderInfo;
}): DataProviderResponse {
  const marketPrice = company.price ?? company.current_price ?? 0;

  return {
    dataProviderInfo,
    currency: NGN_MARKET_CURRENCY,
    dataSource: DataSource.NGN_MARKET,
    marketPrice,
    // NGN Market refreshes at most every 20 minutes during NGX hours, so a
    // quote is never live in the sense Ghostfolio means by 'open'
    marketState: 'delayed'
  };
}

export function toAssetProfile({
  company,
  symbol
}: {
  company: NgnMarketCompanyDetail;
  symbol: string;
}): Partial<SymbolProfile> {
  const response: Partial<SymbolProfile> = {
    symbol,
    assetClass: AssetClass.EQUITY,
    assetSubClass: AssetSubClass.STOCK,
    currency: NGN_MARKET_CURRENCY,
    dataSource: DataSource.NGN_MARKET,
    name: company.name ?? symbol
  };

  response.countries = [{ code: NGN_MARKET_COUNTRY_CODE, weight: 1 }];

  if (company.sector) {
    response.sectors = [{ name: company.sector, weight: 1 }];
  }

  if (company.international_sec_id) {
    response.isin = company.international_sec_id;
  }

  if (company.website) {
    response.url = company.website;
  }

  return response;
}

/**
 * Verified against the live API on 2026-09-09: `rate` is the amount of NGN
 * that one unit of the foreign currency buys (USD rate = 1369.63), which is
 * exactly what Ghostfolio's USDNGN pair means. `inverse_rate` is the
 * reciprocal (0.00073).
 *
 * Note that SKILL.md describes these two fields the other way round. The live
 * response is authoritative here — trusting the doc inverted every NGN
 * conversion by a factor of ~1.9 million.
 */
export function toNgnPerUnitRates(response: NgnMarketForexCurrentResponse): {
  [currency: string]: number;
} {
  const rates: { [currency: string]: number } = {};

  if (!Array.isArray(response?.rates)) {
    return rates;
  }

  for (const { currency, inverse_rate, rate } of response.rates) {
    if (!currency) {
      continue;
    }

    let ngnPerUnit: number | null = null;

    if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
      ngnPerUnit = rate;
    } else if (
      typeof inverse_rate === 'number' &&
      isFinite(inverse_rate) &&
      inverse_rate !== 0
    ) {
      ngnPerUnit = 1 / inverse_rate;
    }

    if (ngnPerUnit !== null && isFinite(ngnPerUnit)) {
      rates[currency.toUpperCase()] = ngnPerUnit;
    }
  }

  return rates;
}

/**
 * Paginated endpoints on this API are documented only as returning
 * "CompanyListItem[]", but the account/logs endpoint wraps its page as
 * `{logs[], pagination{}}` — so a bare array is not safe to assume. Accept
 * either, and return null (rather than an empty array) when neither is
 * present, so the caller can log a real failure instead of silently
 * behaving as though the exchange had no listings.
 */
export function extractListPayload<T>(data: unknown): T[] | null {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === 'object') {
    for (const key of ['data', 'items', 'results', 'companies']) {
      const value = (data as Record<string, unknown>)[key];

      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }

  return null;
}
