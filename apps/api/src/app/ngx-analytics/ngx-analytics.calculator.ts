import { DATE_FORMAT } from '@ghostfolio/common/helper';

import { format } from 'date-fns';

export interface NgxCompanySnapshotSlice {
  date: Date;
  marketCap?: number | null;
  price: number;
  sector?: string | null;
  subSector?: string | null;
  symbol: string;
  volume?: number | null;
}

export interface NgxMarketSnapshotSlice {
  advancers?: number | null;
  advDecRatio?: number | null;
  asi?: number | null;
  asiChangePercent?: number | null;
  date: Date;
  decliners?: number | null;
  unchanged?: number | null;
  valueTraded?: number | null;
  volume?: number | null;
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

export interface NgxBreadthPoint {
  advancers: number | null;
  advDecRatio: number | null;
  asi: number | null;
  asiChangePercent: number | null;
  date: string;
  decliners: number | null;
  unchanged: number | null;
  valueTraded: number | null;
  volume: number | null;
}

export interface NgxSymbolHistoryPoint {
  date: string;
  marketCap: number | null;
  price: number;
  volume: number | null;
}

export interface NgxSymbolHistory {
  performancePercent: number | null;
  high: number | null;
  historicalData: NgxSymbolHistoryPoint[];
  low: number | null;
  symbol: string;
}

const UNCLASSIFIED_SECTOR = 'Unclassified';

/**
 * A move is only meaningful relative to a non-zero base, and NGX prices can
 * arrive as zero on suspended listings.
 */
export function getPercentChange({
  from,
  to
}: {
  from: number;
  to: number;
}): number | null {
  if (!isFinite(from) || !isFinite(to) || from === 0) {
    return null;
  }

  return ((to - from) / from) * 100;
}

/**
 * Collapses a period's rows into one performance figure per symbol, measured
 * between the first and last session actually stored for it. Symbols listed
 * mid-period therefore report the return they were available for rather than
 * being silently dropped.
 */
export function computePeriodPerformances(
  rows: NgxCompanySnapshotSlice[]
): NgxPeriodPerformance[] {
  const rowsBySymbol = new Map<string, NgxCompanySnapshotSlice[]>();

  for (const row of rows ?? []) {
    if (!row?.symbol || !isFinite(row.price)) {
      continue;
    }

    const existing = rowsBySymbol.get(row.symbol);

    if (existing) {
      existing.push(row);
    } else {
      rowsBySymbol.set(row.symbol, [row]);
    }
  }

  const performances: NgxPeriodPerformance[] = [];

  for (const [symbol, symbolRows] of rowsBySymbol) {
    const sorted = [...symbolRows].sort((a, b) => {
      return a.date.getTime() - b.date.getTime();
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    performances.push({
      symbol,
      endDate: format(last.date, DATE_FORMAT),
      endPrice: last.price,
      marketCap: last.marketCap ?? null,
      performancePercent: getPercentChange({
        from: first.price,
        to: last.price
      }),
      sector: last.sector ?? null,
      startDate: format(first.date, DATE_FORMAT),
      startPrice: first.price,
      volume: last.volume ?? null
    });
  }

  return performances;
}

/**
 * Symbols without a computable return are excluded rather than ranked as zero,
 * which would put suspended listings in the middle of the table.
 */
export function rankMovers({
  limit,
  performances
}: {
  limit: number;
  performances: NgxPeriodPerformance[];
}): { losers: NgxPeriodPerformance[]; gainers: NgxPeriodPerformance[] } {
  const ranked = (performances ?? [])
    .filter(({ performancePercent }) => {
      return performancePercent !== null;
    })
    .sort((a, b) => {
      // Symbol as the tie-breaker keeps the ordering stable across requests
      return (
        b.performancePercent - a.performancePercent ||
        a.symbol.localeCompare(b.symbol)
      );
    });

  const safeLimit = Math.max(0, Math.trunc(limit));

  return {
    gainers: ranked.slice(0, safeLimit),
    losers: [...ranked].reverse().slice(0, safeLimit)
  };
}

/**
 * Sector returns are market-cap weighted, so a large constituent moving 1%
 * outweighs a micro-cap moving 40%. Symbols without a market cap fall back to
 * equal weighting inside their sector rather than being dropped.
 */
export function computeSectorPerformances(
  performances: NgxPeriodPerformance[]
): NgxSectorPerformance[] {
  const bySector = new Map<string, NgxPeriodPerformance[]>();

  for (const performance of performances ?? []) {
    const sector = performance.sector?.trim() || UNCLASSIFIED_SECTOR;
    const existing = bySector.get(sector);

    if (existing) {
      existing.push(performance);
    } else {
      bySector.set(sector, [performance]);
    }
  }

  const results: NgxSectorPerformance[] = [];

  for (const [sector, constituents] of bySector) {
    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    let totalMarketCap = 0;
    let totalVolume = 0;
    let hasMarketCap = false;
    let hasVolume = false;
    let weightedSum = 0;
    let totalWeight = 0;

    for (const { marketCap, performancePercent, volume } of constituents) {
      if (typeof marketCap === 'number' && isFinite(marketCap)) {
        hasMarketCap = true;
        totalMarketCap += marketCap;
      }

      if (typeof volume === 'number' && isFinite(volume)) {
        hasVolume = true;
        totalVolume += volume;
      }

      if (performancePercent === null) {
        continue;
      }

      if (performancePercent > 0) {
        advancers += 1;
      } else if (performancePercent < 0) {
        decliners += 1;
      } else {
        unchanged += 1;
      }

      const weight =
        typeof marketCap === 'number' && isFinite(marketCap) && marketCap > 0
          ? marketCap
          : 1;

      weightedSum += performancePercent * weight;
      totalWeight += weight;
    }

    results.push({
      advancers,
      decliners,
      sector,
      unchanged,
      companyCount: constituents.length,
      performancePercent: totalWeight > 0 ? weightedSum / totalWeight : null,
      totalMarketCap: hasMarketCap ? totalMarketCap : null,
      totalVolume: hasVolume ? totalVolume : null
    });
  }

  return results.sort((a, b) => {
    return (
      (b.performancePercent ?? Number.NEGATIVE_INFINITY) -
        (a.performancePercent ?? Number.NEGATIVE_INFINITY) ||
      a.sector.localeCompare(b.sector)
    );
  });
}

/**
 * `advDecRatio` is nullable upstream, so it is derived when missing. A session
 * with no decliners has no finite ratio and stays null rather than becoming
 * Infinity, which does not survive JSON.
 */
export function toBreadthSeries(
  snapshots: NgxMarketSnapshotSlice[]
): NgxBreadthPoint[] {
  return (snapshots ?? [])
    .map((snapshot) => {
      const advancers = snapshot.advancers ?? null;
      const decliners = snapshot.decliners ?? null;

      let advDecRatio = snapshot.advDecRatio ?? null;

      if (
        advDecRatio === null &&
        typeof advancers === 'number' &&
        typeof decliners === 'number' &&
        decliners > 0
      ) {
        advDecRatio = advancers / decliners;
      }

      return {
        advancers,
        advDecRatio,
        decliners,
        asi: snapshot.asi ?? null,
        asiChangePercent: snapshot.asiChangePercent ?? null,
        date: format(snapshot.date, DATE_FORMAT),
        unchanged: snapshot.unchanged ?? null,
        valueTraded: snapshot.valueTraded ?? null,
        volume: snapshot.volume ?? null
      };
    })
    .sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
}

export function toSymbolHistory({
  rows,
  symbol
}: {
  rows: NgxCompanySnapshotSlice[];
  symbol: string;
}): NgxSymbolHistory {
  const historicalData = (rows ?? [])
    .filter((row) => {
      return isFinite(row?.price);
    })
    .map((row) => {
      return {
        date: format(row.date, DATE_FORMAT),
        marketCap: row.marketCap ?? null,
        price: row.price,
        volume: row.volume ?? null
      };
    })
    .sort((a, b) => {
      return a.date.localeCompare(b.date);
    });

  if (historicalData.length === 0) {
    return {
      symbol,
      high: null,
      historicalData,
      low: null,
      performancePercent: null
    };
  }

  const prices = historicalData.map(({ price }) => {
    return price;
  });

  return {
    symbol,
    high: Math.max(...prices),
    historicalData,
    low: Math.min(...prices),
    performancePercent: getPercentChange({
      from: prices[0],
      to: prices[prices.length - 1]
    })
  };
}
