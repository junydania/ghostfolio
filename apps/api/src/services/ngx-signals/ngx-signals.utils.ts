import { DATE_FORMAT } from '@ghostfolio/common/helper';

import { utc } from '@date-fns/utc';
import { format, isValid } from 'date-fns';

import {
  NgxCompanySnapshotRow,
  NgxMarketSnapshotRow
} from './interfaces/interfaces';
import { NGX_SIGNAL_PRECISION } from './ngx-signals.constants';

/**
 * Snapshots are captured once per trading day and stored at UTC midnight.
 * Grouping is done on the UTC calendar day so that the result does not depend
 * on the time zone the API process happens to run in.
 */
export function getDateKey(date: Date): string | null {
  if (!(date instanceof Date) || !isValid(date)) {
    return null;
  }

  return format(date, DATE_FORMAT, { in: utc });
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads a nullable numeric field, returning `null` for anything that cannot be
 * used in arithmetic. The upstream API returns `null` for many fields and
 * occasionally a string, so every read goes through here.
 */
export function toNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

export function round(
  value: number,
  precision: number = NGX_SIGNAL_PRECISION
): number {
  if (!isFiniteNumber(value)) {
    return value;
  }

  const factor = Math.pow(10, precision);

  return Math.round(value * factor) / factor;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Bounds a signed score to [-1, 1]. */
export function clampScore(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function clampToUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function percentChange(from: number, to: number): number | null {
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from === 0) {
    return null;
  }

  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * Turns the raw snapshot rows into one ascending, gap-free-by-construction
 * series per symbol, ending on the evaluation date.
 *
 * Rows are dropped when the price is unusable, when they fall after the
 * evaluation date, or when the symbol has no row on the evaluation date at all
 * — a signal is only ever emitted for a symbol that actually traded that day.
 * Duplicate rows for one calendar day keep the last one seen.
 */
export function groupSeriesBySymbol(
  rows: NgxCompanySnapshotRow[],
  evaluationDateKey: string
): Map<string, NgxCompanySnapshotRow[]> {
  const bySymbol = new Map<string, Map<string, NgxCompanySnapshotRow>>();

  for (const row of rows ?? []) {
    const dateKey = getDateKey(row?.date);
    const price = toNumberOrNull(row?.price);

    if (!dateKey || dateKey > evaluationDateKey || !row?.symbol) {
      continue;
    }

    if (price === null || price <= 0) {
      continue;
    }

    const existing =
      bySymbol.get(row.symbol) ?? new Map<string, NgxCompanySnapshotRow>();

    existing.set(dateKey, row);
    bySymbol.set(row.symbol, existing);
  }

  const result = new Map<string, NgxCompanySnapshotRow[]>();

  for (const [symbol, rowsByDateKey] of bySymbol) {
    if (!rowsByDateKey.has(evaluationDateKey)) {
      continue;
    }

    const series = [...rowsByDateKey.entries()]
      .sort(([a], [b]) => {
        return a < b ? -1 : a > b ? 1 : 0;
      })
      .map(([, row]) => {
        return row;
      });

    result.set(symbol, series);
  }

  return result;
}

/**
 * Ascending market snapshots up to and including the evaluation date, one per
 * calendar day.
 */
export function toMarketSeries(
  rows: NgxMarketSnapshotRow[],
  evaluationDateKey: string
): NgxMarketSnapshotRow[] {
  const byDateKey = new Map<string, NgxMarketSnapshotRow>();

  for (const row of rows ?? []) {
    const dateKey = getDateKey(row?.date);

    if (!dateKey || dateKey > evaluationDateKey) {
      continue;
    }

    byDateKey.set(dateKey, row);
  }

  return [...byDateKey.entries()]
    .sort(([a], [b]) => {
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([, row]) => {
      return row;
    });
}
