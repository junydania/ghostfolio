import { NgxSignalDirection } from '@prisma/client';

import {
  NgxAsiTrendSource,
  NgxMarketRegime,
  NgxMarketRegimeAssessment,
  NgxMarketSnapshotRow,
  NgxSignalCandidate
} from './interfaces/interfaces';
import { MARKET_REGIME_CONFIG } from './ngx-signals.constants';
import { mean, round, toNumberOrNull } from './ngx-signals.utils';

const UNKNOWN_REGIME: NgxMarketRegimeAssessment = {
  advDecRatio: null,
  asi: null,
  asiMovingAverage: null,
  asiTrendPercent: null,
  asiTrendSource: 'NONE',
  observations: 0,
  regime: 'UNKNOWN'
};

/**
 * Classifies the broad market from breadth (advancers versus decliners) and the
 * All-Share Index trend.
 *
 * Two independent votes are cast, and only from the factors that are actually
 * available. The market is called BEARISH when at least one factor is negative
 * and none is positive, BULLISH under the mirror condition, NEUTRAL when they
 * disagree and UNKNOWN when neither factor can be read. Requiring unanimity
 * rather than a majority keeps a single noisy factor from flipping the call.
 *
 * @param marketSeries ascending market snapshots ending on the evaluation date
 */
export function assessMarketRegime(
  marketSeries: NgxMarketSnapshotRow[]
): NgxMarketRegimeAssessment {
  const series = marketSeries ?? [];
  const latest = series.at(-1);

  if (!latest) {
    return UNKNOWN_REGIME;
  }

  const advDecRatio = resolveAdvDecRatio(latest);
  const asi = toNumberOrNull(latest.asi);

  const asiValues = series
    .map(({ asi: value }) => {
      return toNumberOrNull(value);
    })
    .filter((value): value is number => {
      return value !== null && value > 0;
    });

  let asiMovingAverage: number | null = null;
  let asiTrendPercent: number | null = null;
  let asiTrendSource: NgxAsiTrendSource = 'NONE';

  if (
    asi !== null &&
    asiValues.length >= MARKET_REGIME_CONFIG.asiMovingAveragePeriod
  ) {
    asiMovingAverage = mean(
      asiValues.slice(-MARKET_REGIME_CONFIG.asiMovingAveragePeriod)
    );

    if (asiMovingAverage !== null && asiMovingAverage > 0) {
      asiTrendPercent = ((asi - asiMovingAverage) / asiMovingAverage) * 100;
      asiTrendSource = 'MOVING_AVERAGE';
    }
  }

  if (asiTrendPercent === null) {
    // Before ten market snapshots have accumulated there is no average to
    // compare against, so fall back to the single day's move and say so.
    const asiChangePercent = toNumberOrNull(latest.asiChangePercent);

    if (asiChangePercent !== null) {
      asiTrendPercent = asiChangePercent;
      asiTrendSource = 'DAILY_CHANGE';
    }
  }

  const votes: number[] = [];

  if (advDecRatio !== null) {
    if (advDecRatio <= MARKET_REGIME_CONFIG.bearishAdvDecRatio) {
      votes.push(-1);
    } else if (advDecRatio >= MARKET_REGIME_CONFIG.bullishAdvDecRatio) {
      votes.push(1);
    } else {
      votes.push(0);
    }
  }

  if (asiTrendPercent !== null) {
    votes.push(Math.sign(asiTrendPercent));
  }

  let regime: NgxMarketRegime = 'NEUTRAL';

  if (votes.length === 0) {
    regime = 'UNKNOWN';
  } else if (
    votes.some((vote) => vote < 0) &&
    !votes.some((vote) => vote > 0)
  ) {
    regime = 'BEARISH';
  } else if (
    votes.some((vote) => vote > 0) &&
    !votes.some((vote) => vote < 0)
  ) {
    regime = 'BULLISH';
  }

  return {
    advDecRatio: advDecRatio === null ? null : round(advDecRatio),
    asi: asi === null ? null : round(asi, 2),
    asiMovingAverage:
      asiMovingAverage === null ? null : round(asiMovingAverage, 2),
    asiTrendPercent: asiTrendPercent === null ? null : round(asiTrendPercent),
    asiTrendSource,
    observations: series.length,
    regime
  };
}

/**
 * Attaches the regime to a candidate's rationale and, in a falling market,
 * demotes BUY to WATCH with a halved score.
 *
 * AVOID and WATCH are never touched, and no regime ever promotes a signal.
 */
export function applyMarketRegimeGate({
  candidate,
  regime
}: {
  candidate: NgxSignalCandidate;
  regime: NgxMarketRegimeAssessment;
}): NgxSignalCandidate {
  const demoted =
    regime.regime === 'BEARISH' &&
    candidate.direction === NgxSignalDirection.BUY;

  return {
    ...candidate,
    direction: demoted ? NgxSignalDirection.WATCH : candidate.direction,
    rationale: {
      ...candidate.rationale,
      regime: {
        advDecRatio: regime.advDecRatio,
        asiTrendPercent: regime.asiTrendPercent,
        asiTrendSource: regime.asiTrendSource,
        demoted,
        originalDirection: demoted ? NgxSignalDirection.BUY : null,
        regime: regime.regime
      },
      summary: demoted
        ? `${candidate.rationale.summary} Held back to WATCH because the broad market is falling (advance/decline ratio ${formatValue(regime.advDecRatio)}, ASI trend ${formatValue(regime.asiTrendPercent)}%).`
        : candidate.rationale.summary
    },
    score: demoted
      ? round(candidate.score * MARKET_REGIME_CONFIG.demotionScoreFactor)
      : candidate.score
  };
}

function formatValue(value: number | null): string {
  return value === null ? 'unavailable' : `${value}`;
}

/**
 * The API exposes `advDecRatio` directly but it is frequently null; recompute
 * it from the counts when it is, rather than dropping the breadth factor.
 */
function resolveAdvDecRatio(row: NgxMarketSnapshotRow): number | null {
  const advDecRatio = toNumberOrNull(row.advDecRatio);

  if (advDecRatio !== null && advDecRatio >= 0) {
    return advDecRatio;
  }

  const advancers = toNumberOrNull(row.advancers);
  const decliners = toNumberOrNull(row.decliners);

  if (advancers === null || decliners === null || decliners <= 0) {
    return null;
  }

  return advancers / decliners;
}
