import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxSignalCandidate
} from '../interfaces/interfaces';
import {
  FIFTY_TWO_WEEK_POSITION_CONFIG,
  NGX_SIGNAL_TYPES
} from '../ngx-signals.constants';
import {
  clampToUnitInterval,
  round,
  toNumberOrNull
} from '../ngx-signals.utils';

const {
  avoidPosition,
  buyPosition,
  minimumRangeRatio,
  watchLowerPosition,
  watchUpperPosition
} = FIFTY_TWO_WEEK_POSITION_CONFIG;

/**
 * Locates the closing price inside its own 52-week range.
 *
 * This is the one rule that works from the first captured day, because the
 * 52-week high and low arrive from the API rather than from accumulated
 * snapshots. Trading in the top decile of the range is evidence of sustained
 * demand; the bottom decile is evidence of sustained supply. Neither is a
 * forecast.
 *
 * The range is required to span at least `minimumRangeRatio` of the price: for
 * a near-flat symbol the position is a rounding artefact rather than a
 * statement about the market.
 */
export function evaluateFiftyTwoWeekPosition(
  series: NgxCompanySnapshotRow[]
): NgxSignalCandidate | null {
  const rows = series ?? [];
  const latest = rows.at(-1);

  if (!latest) {
    return null;
  }

  const high52wk = toNumberOrNull(latest.high52wk);
  const low52wk = toNumberOrNull(latest.low52wk);
  const price = latest.price;

  if (high52wk === null || low52wk === null || high52wk <= low52wk) {
    return null;
  }

  const range = high52wk - low52wk;

  if (range < price * minimumRangeRatio) {
    return null;
  }

  const rawPosition = (price - low52wk) / range;
  const position = clampToUnitInterval(rawPosition);
  // The 52-week bounds are published values and lag a fresh high or low by a
  // day, which puts the price outside its own range. Record the clamp rather
  // than hiding it.
  const clamped = rawPosition !== position;

  let direction: NgxSignalDirection;

  if (position >= buyPosition) {
    direction = NgxSignalDirection.BUY;
  } else if (position <= avoidPosition) {
    direction = NgxSignalDirection.AVOID;
  } else if (position >= watchUpperPosition || position <= watchLowerPosition) {
    direction = NgxSignalDirection.WATCH;
  } else {
    return null;
  }

  const score = position * 2 - 1;

  return {
    direction,
    rationale: {
      inputs: {
        clamped,
        high52wk: round(high52wk),
        low52wk: round(low52wk),
        position: round(position),
        price: round(price),
        rangeRatio: round(range / price)
      },
      observations: 1,
      rule: NGX_SIGNAL_TYPES.FIFTY_TWO_WEEK_POSITION,
      summary:
        `Closed at ${round(price)}, which is ${round(position * 100, 1)}% of ` +
        `the way up a 52-week range of ${round(low52wk)} to ${round(high52wk)}.`,
      thresholds: {
        avoidPosition,
        buyPosition,
        minimumRangeRatio,
        watchLowerPosition,
        watchUpperPosition
      }
    },
    score: round(score),
    symbol: latest.symbol,
    type: NGX_SIGNAL_TYPES.FIFTY_TWO_WEEK_POSITION
  };
}
