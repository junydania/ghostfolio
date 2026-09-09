import {
  NgxCompanySnapshotRow,
  NgxMarketRegimeAssessment,
  NgxMarketSnapshotRow,
  NgxSignalCandidate
} from './interfaces/interfaces';
import {
  applyMarketRegimeGate,
  assessMarketRegime
} from './ngx-signals.regime';
import {
  getDateKey,
  groupSeriesBySymbol,
  toMarketSeries
} from './ngx-signals.utils';
import { evaluateFiftyTwoWeekPosition } from './rules/fifty-two-week-position.rule';
import { evaluateMovingAverageTrend } from './rules/moving-average-trend.rule';
import {
  computeExchangeReturnMedians,
  evaluateRelativeStrength
} from './rules/relative-strength.rule';
import { evaluateVolumeAnomaly } from './rules/volume-anomaly.rule';

export interface NgxSignalsEvaluation {
  candidates: NgxSignalCandidate[];
  regime: NgxMarketRegimeAssessment;
  symbolsEvaluated: number;
}

/**
 * Runs every rule over one trading day's cross-section and returns the signals
 * it supports.
 *
 * Pure by design: it takes plain rows and returns plain objects, so the whole
 * scoring surface is testable without a database. Persistence lives in
 * `NgxSignalsService`.
 *
 * Rules that lack the history they need return nothing rather than a weaker
 * signal, so the output naturally grows as snapshots accumulate.
 */
export function evaluateSignals({
  companySnapshots,
  date,
  marketSnapshots
}: {
  companySnapshots: NgxCompanySnapshotRow[];
  date: Date;
  marketSnapshots: NgxMarketSnapshotRow[];
}): NgxSignalsEvaluation {
  const evaluationDateKey = getDateKey(date);

  if (!evaluationDateKey) {
    return {
      candidates: [],
      regime: assessMarketRegime([]),
      symbolsEvaluated: 0
    };
  }

  const seriesBySymbol = groupSeriesBySymbol(
    companySnapshots,
    evaluationDateKey
  );
  const regime = assessMarketRegime(
    toMarketSeries(marketSnapshots, evaluationDateKey)
  );
  const medians = computeExchangeReturnMedians(seriesBySymbol);

  const candidates: NgxSignalCandidate[] = [];

  for (const symbol of [...seriesBySymbol.keys()].sort()) {
    const series = seriesBySymbol.get(symbol);

    const symbolCandidates = [
      evaluateMovingAverageTrend(series),
      evaluateRelativeStrength({ medians, series }),
      evaluateFiftyTwoWeekPosition(series),
      evaluateVolumeAnomaly(series)
    ].filter((candidate) => {
      return candidate !== null;
    });

    for (const candidate of symbolCandidates) {
      candidates.push(applyMarketRegimeGate({ candidate, regime }));
    }
  }

  return {
    candidates: sortCandidates(candidates),
    regime,
    symbolsEvaluated: seriesBySymbol.size
  };
}

/**
 * Strongest buy-side evidence first, then deterministically by symbol and type
 * so repeated runs over the same data produce an identical ordering.
 */
function sortCandidates(candidates: NgxSignalCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }

    if (a.symbol !== b.symbol) {
      return a.symbol < b.symbol ? -1 : 1;
    }

    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });
}
