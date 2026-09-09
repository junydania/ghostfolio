import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxExchangeReturnMedians,
  NgxSignalCandidate,
  NgxSignalRationaleValue
} from '../interfaces/interfaces';
import {
  NGX_SIGNAL_TYPES,
  RELATIVE_STRENGTH_CONFIG
} from '../ngx-signals.constants';
import { clampScore, mean, median, round } from '../ngx-signals.utils';

const {
  avoidExcessReturnPercent,
  buyExcessReturnPercent,
  longPeriod,
  minimumCrossSectionSize,
  scoreFullScaleExcessReturnPercent,
  shortPeriod
} = RELATIVE_STRENGTH_CONFIG;

/**
 * Return over the last `period` observations, in percent.
 *
 * Deliberately measured in stored observations rather than calendar days: the
 * exchange median it is compared against has to be computed over the same
 * window for every symbol, and calendar windows would silently include a
 * different number of trading days per symbol.
 *
 * Returns `null` unless `period + 1` observations are available.
 */
export function computeReturnOverPeriod(
  series: NgxCompanySnapshotRow[],
  period: number
): number | null {
  const rows = series ?? [];

  if (rows.length < period + 1) {
    return null;
  }

  const from = rows[rows.length - 1 - period]?.price;
  const to = rows.at(-1)?.price;

  if (!from || from <= 0 || !to) {
    return null;
  }

  return ((to - from) / from) * 100;
}

/**
 * The exchange-wide median return for each horizon, plus how many symbols went
 * into it.
 *
 * A horizon backed by fewer than `minimumCrossSectionSize` symbols is reported
 * as `null`: a median over a handful of names is not the exchange, and
 * comparing against it would manufacture relative strength out of thin air.
 */
export function computeExchangeReturnMedians(
  seriesBySymbol: Map<string, NgxCompanySnapshotRow[]>
): NgxExchangeReturnMedians {
  const shortPeriodReturns: number[] = [];
  const longPeriodReturns: number[] = [];

  for (const series of seriesBySymbol?.values() ?? []) {
    const shortPeriodReturn = computeReturnOverPeriod(series, shortPeriod);
    const longPeriodReturn = computeReturnOverPeriod(series, longPeriod);

    if (shortPeriodReturn !== null) {
      shortPeriodReturns.push(shortPeriodReturn);
    }

    if (longPeriodReturn !== null) {
      longPeriodReturns.push(longPeriodReturn);
    }
  }

  return {
    longPeriodMedian:
      longPeriodReturns.length >= minimumCrossSectionSize
        ? median(longPeriodReturns)
        : null,
    longPeriodSampleSize: longPeriodReturns.length,
    shortPeriodMedian:
      shortPeriodReturns.length >= minimumCrossSectionSize
        ? median(shortPeriodReturns)
        : null,
    shortPeriodSampleSize: shortPeriodReturns.length
  };
}

/**
 * Scores a symbol's return against the exchange median over the same window.
 *
 * Both horizons are used when both are available, and the rule degrades to the
 * short horizon alone while history is still accumulating — with the horizons
 * actually used named in the rationale, so a signal built on seven days is
 * never mistaken for one built on thirty. BUY and AVOID require every
 * available horizon to agree; disagreement between them is WATCH.
 */
export function evaluateRelativeStrength({
  medians,
  series
}: {
  medians: NgxExchangeReturnMedians;
  series: NgxCompanySnapshotRow[];
}): NgxSignalCandidate | null {
  const rows = series ?? [];
  const latest = rows.at(-1);

  if (!latest || !medians) {
    return null;
  }

  const horizons = [
    {
      excessReturnPercent: computeExcessReturn({
        median: medians.shortPeriodMedian,
        symbolReturn: computeReturnOverPeriod(rows, shortPeriod)
      }),
      period: shortPeriod
    },
    {
      excessReturnPercent: computeExcessReturn({
        median: medians.longPeriodMedian,
        symbolReturn: computeReturnOverPeriod(rows, longPeriod)
      }),
      period: longPeriod
    }
  ].filter(({ excessReturnPercent }) => {
    return excessReturnPercent !== null;
  });

  if (horizons.length === 0) {
    return null;
  }

  const excessReturns = horizons.map(({ excessReturnPercent }) => {
    return excessReturnPercent;
  });

  let direction: NgxSignalDirection;

  if (excessReturns.every((value) => value >= buyExcessReturnPercent)) {
    direction = NgxSignalDirection.BUY;
  } else if (
    excessReturns.every((value) => value <= avoidExcessReturnPercent)
  ) {
    direction = NgxSignalDirection.AVOID;
  } else if (
    excessReturns.some((value) => {
      return (
        value >= buyExcessReturnPercent || value <= avoidExcessReturnPercent
      );
    })
  ) {
    direction = NgxSignalDirection.WATCH;
  } else {
    return null;
  }

  const averageExcessReturn = mean(excessReturns);
  const score = clampScore(
    averageExcessReturn / scoreFullScaleExcessReturnPercent
  );

  const inputs: Record<string, NgxSignalRationaleValue> = {
    horizonsUsed: horizons
      .map(({ period }) => {
        return `${period}d`;
      })
      .join(','),
    longPeriodCrossSectionSize: medians.longPeriodSampleSize,
    shortPeriodCrossSectionSize: medians.shortPeriodSampleSize
  };

  for (const { excessReturnPercent, period } of horizons) {
    const symbolReturn = computeReturnOverPeriod(rows, period);
    const exchangeMedian =
      period === shortPeriod
        ? medians.shortPeriodMedian
        : medians.longPeriodMedian;

    inputs[`excessReturnPercent${period}d`] = round(excessReturnPercent);
    inputs[`exchangeMedianReturnPercent${period}d`] = round(exchangeMedian);
    inputs[`returnPercent${period}d`] = round(symbolReturn);
  }

  return {
    direction,
    rationale: {
      inputs,
      observations: rows.length,
      rule: NGX_SIGNAL_TYPES.RELATIVE_STRENGTH,
      summary: horizons
        .map(({ excessReturnPercent, period }) => {
          const symbolReturn = computeReturnOverPeriod(rows, period);
          const exchangeMedian =
            period === shortPeriod
              ? medians.shortPeriodMedian
              : medians.longPeriodMedian;

          return (
            `Over ${period} trading days it returned ${round(symbolReturn)}% ` +
            `against an exchange median of ${round(exchangeMedian)}% ` +
            `(${round(excessReturnPercent)} percentage points of difference).`
          );
        })
        .join(' '),
      thresholds: {
        avoidExcessReturnPercent,
        buyExcessReturnPercent,
        minimumCrossSectionSize
      }
    },
    score: round(score),
    symbol: latest.symbol,
    type: NGX_SIGNAL_TYPES.RELATIVE_STRENGTH
  };
}

function computeExcessReturn({
  median: exchangeMedian,
  symbolReturn
}: {
  median: number | null;
  symbolReturn: number | null;
}): number | null {
  if (exchangeMedian === null || symbolReturn === null) {
    return null;
  }

  return symbolReturn - exchangeMedian;
}
