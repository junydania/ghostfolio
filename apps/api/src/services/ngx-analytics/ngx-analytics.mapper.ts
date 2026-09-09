import {
  NgnMarketCompanyListItem,
  NgnMarketSnapshotResponse
} from '@ghostfolio/api/services/data-provider/ngn-market/interfaces/interfaces';

import { Prisma } from '@prisma/client';

/**
 * NGX trades in Africa/Lagos, which is UTC+1 all year round — Nigeria observes
 * no daylight saving. A fixed offset is therefore exact, and keeps these
 * functions pure and free of a timezone database.
 */
const WAT_OFFSET_IN_MINUTES = 60;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type NgxCompanySnapshotRow = Omit<
  Prisma.NgxCompanySnapshotCreateInput,
  'createdAt' | 'id'
>;

export type NgxMarketSnapshotRow = Omit<
  Prisma.NgxMarketSnapshotCreateInput,
  'createdAt' | 'id'
>;

/**
 * The snapshot tables are keyed by trading date, so every date has to collapse
 * to the same instant regardless of where the server runs: UTC midnight of the
 * Lagos calendar day.
 */
export function toTradingDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isFinite(value.getTime()) ? shiftToLagosCalendarDate(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(value.trim());

  if (dateOnly) {
    const [, year, month, day] = dateOnly;

    // Already a calendar date: shifting it would move it a day
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(value);

  return isFinite(parsed.getTime()) ? shiftToLagosCalendarDate(parsed) : null;
}

/**
 * The trading date the capture belongs to. Preference order is deliberate: the
 * market snapshot states the session it describes, the company feed only
 * carries a `last_updated` timestamp, and the caller's clock is the last
 * resort.
 */
export function resolveTradingDate({
  companies = [],
  fallbackDate,
  snapshot
}: {
  companies?: Pick<NgnMarketCompanyListItem, 'last_updated'>[];
  fallbackDate: Date;
  snapshot?: Pick<NgnMarketSnapshotResponse, 'date' | 'updated_at'> | null;
}): Date {
  const candidates: unknown[] = [
    snapshot?.date,
    snapshot?.updated_at,
    ...companies.map(({ last_updated }) => {
      return last_updated;
    })
  ];

  for (const candidate of candidates) {
    const date = toTradingDate(candidate);

    if (date) {
      return date;
    }
  }

  return toTradingDate(fallbackDate) ?? new Date(NaN);
}

export function toCompanySnapshotRows({
  companies,
  date
}: {
  companies: NgnMarketCompanyListItem[];
  date: Date;
}): NgxCompanySnapshotRow[] {
  const rowBySymbol = new Map<string, NgxCompanySnapshotRow>();

  for (const company of companies ?? []) {
    const symbol = company?.symbol?.trim().toUpperCase();
    const price = toFiniteNumber(company?.price);

    // `price` is the only non-nullable column: a row without one carries no
    // signal and would have to be written as zero, which poisons every
    // downstream return calculation.
    if (!symbol || price === null) {
      continue;
    }

    rowBySymbol.set(symbol, {
      date,
      price,
      symbol,
      change7dPercent: toFiniteNumber(company.change_7d_percent),
      change52wPercent: toFiniteNumber(company.change_52w_percent),
      dayHigh: toFiniteNumber(company.day_high),
      dayLow: toFiniteNumber(company.day_low),
      high52wk: toFiniteNumber(company.high_52wk),
      low52wk: toFiniteNumber(company.low_52wk),
      marketCap: toFiniteNumber(company.market_cap),
      prevClose: toFiniteNumber(company.prev_close),
      priceChangePercent: toFiniteNumber(company.price_change_percent),
      sector: toTrimmedString(company.sector),
      sharesOutstanding: toFiniteNumber(company.shares_outstanding),
      subSector: toTrimmedString(company.sub_sector),
      volume: toFiniteNumber(company.volume)
    });
  }

  return [...rowBySymbol.values()];
}

export function toMarketSnapshotRow({
  date,
  snapshot
}: {
  date: Date;
  snapshot: NgnMarketSnapshotResponse;
}): NgxMarketSnapshotRow {
  return {
    date,
    advancers: toFiniteInteger(snapshot?.breadth?.advancers),
    advDecRatio: toFiniteNumber(snapshot?.breadth?.adv_dec_ratio),
    asi: toFiniteNumber(snapshot?.asi),
    asiChangePercent: toFiniteNumber(snapshot?.asi_change_percent),
    deals: toFiniteInteger(snapshot?.deals),
    decliners: toFiniteInteger(snapshot?.breadth?.decliners),
    marketCapTotal: toFiniteNumber(snapshot?.market_cap?.total),
    turnoverRate: toFiniteNumber(snapshot?.turnover_rate),
    unchanged: toFiniteInteger(snapshot?.breadth?.unchanged),
    valueTraded: toFiniteNumber(snapshot?.value_traded),
    volume: toFiniteNumber(snapshot?.volume),
    ytdAsiChangePercent: toFiniteNumber(snapshot?.ytd_asi_change_percent)
  };
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    return isFinite(parsed) ? parsed : null;
  }

  return null;
}

function shiftToLagosCalendarDate(date: Date) {
  const shifted = new Date(date.getTime() + WAT_OFFSET_IN_MINUTES * 60 * 1000);

  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    )
  );
}

function toFiniteInteger(value: unknown): number | null {
  const parsed = toFiniteNumber(value);

  return parsed === null ? null : Math.round(parsed);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}
