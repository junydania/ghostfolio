import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxSignalCandidate
} from '../interfaces/interfaces';
import {
  MOVING_AVERAGE_TREND_CONFIG,
  NGX_SIGNAL_TYPES
} from '../ngx-signals.constants';
import { clampScore, mean, round } from '../ngx-signals.utils';

const {
  avoidDeviationPercent,
  buyDeviationPercent,
  minimumObservations,
  period,
  scoreFullScaleDeviationPercent,
  slopeLookback
} = MOVING_AVERAGE_TREND_CONFIG;

/**
 * Compares the closing price to the symbol's own simple moving average, and
 * checks whether that average is itself rising or falling.
 *
 * Price above a rising average is trend evidence; price above a falling average
 * is a bounce inside a downtrend, which is why the slope gates the direction
 * rather than only the deviation. Below `minimumObservations` stored closes the
 * rule returns nothing: an average over a handful of days describes noise, not
 * a trend, and a signal derived from it would be worse than no signal.
 *
 * @param series ascending snapshots for one symbol, ending on the evaluation date
 */
export function evaluateMovingAverageTrend(
  series: NgxCompanySnapshotRow[]
): NgxSignalCandidate | null {
  const rows = series ?? [];
  const latest = rows.at(-1);

  if (!latest || rows.length < minimumObservations) {
    return null;
  }

  const closes = rows.map(({ price: close }) => {
    return close;
  });

  const movingAverage = mean(closes.slice(-period));
  const previousMovingAverage = mean(
    closes.slice(-(period + slopeLookback), -slopeLookback)
  );

  if (
    movingAverage === null ||
    movingAverage <= 0 ||
    previousMovingAverage === null ||
    previousMovingAverage <= 0
  ) {
    return null;
  }

  const price = latest.price;
  const deviationPercent = ((price - movingAverage) / movingAverage) * 100;
  const slopePercent =
    ((movingAverage - previousMovingAverage) / previousMovingAverage) * 100;

  let direction: NgxSignalDirection;

  if (deviationPercent >= buyDeviationPercent && slopePercent > 0) {
    direction = NgxSignalDirection.BUY;
  } else if (deviationPercent <= avoidDeviationPercent && slopePercent < 0) {
    direction = NgxSignalDirection.AVOID;
  } else if (
    deviationPercent >= buyDeviationPercent ||
    deviationPercent <= avoidDeviationPercent
  ) {
    // The price has moved far enough to be worth reporting, but the trend it
    // sits in disagrees with it.
    direction = NgxSignalDirection.WATCH;
  } else {
    return null;
  }

  const score = clampScore(deviationPercent / scoreFullScaleDeviationPercent);

  return {
    direction,
    rationale: {
      inputs: {
        deviationPercent: round(deviationPercent),
        movingAverage: round(movingAverage),
        movingAveragePeriod: period,
        previousMovingAverage: round(previousMovingAverage),
        price: round(price),
        slopeLookback,
        slopePercent: round(slopePercent)
      },
      observations: rows.length,
      rule: NGX_SIGNAL_TYPES.MOVING_AVERAGE_TREND,
      summary:
        `Closed at ${round(price)} against a ${period}-day average of ` +
        `${round(movingAverage)} (${round(deviationPercent)}%), and that ` +
        `average has moved ${round(slopePercent)}% over the last ` +
        `${slopeLookback} observations.`,
      thresholds: {
        avoidDeviationPercent,
        buyDeviationPercent,
        minimumObservations
      }
    },
    score: round(score),
    symbol: latest.symbol,
    type: NGX_SIGNAL_TYPES.MOVING_AVERAGE_TREND
  };
}
