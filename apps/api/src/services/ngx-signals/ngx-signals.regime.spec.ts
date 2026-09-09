import { NgxSignalDirection } from '@prisma/client';

import {
  NgxMarketSnapshotRow,
  NgxSignalCandidate
} from './interfaces/interfaces';
import {
  applyMarketRegimeGate,
  assessMarketRegime
} from './ngx-signals.regime';

function buildMarketSeries(
  rows: Partial<NgxMarketSnapshotRow>[]
): NgxMarketSnapshotRow[] {
  return rows.map((row, index) => {
    return {
      date: new Date(Date.UTC(2026, 0, index + 1)),
      ...row
    };
  });
}

function buildAsiSeries(asiValues: number[], advDecRatio: number) {
  return buildMarketSeries(
    asiValues.map((asi, index) => {
      return index === asiValues.length - 1 ? { advDecRatio, asi } : { asi };
    })
  );
}

function buildCandidate(
  overrides: Partial<NgxSignalCandidate> = {}
): NgxSignalCandidate {
  return {
    direction: NgxSignalDirection.BUY,
    score: 0.8,
    symbol: 'DANGCEM',
    type: 'FIFTY_TWO_WEEK_POSITION',
    ...overrides,
    rationale: {
      inputs: {},
      observations: 1,
      rule: 'FIFTY_TWO_WEEK_POSITION',
      summary: 'Closed in the top decile of its 52-week range.',
      thresholds: {},
      ...overrides.rationale
    }
  };
}

describe('assessMarketRegime', () => {
  describe('with no usable input', () => {
    it('is UNKNOWN for an empty series', () => {
      expect(assessMarketRegime([]).regime).toBe('UNKNOWN');
      expect(assessMarketRegime(null).regime).toBe('UNKNOWN');
    });

    it('is UNKNOWN when every field on the latest day is null', () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([
          {
            advDecRatio: null,
            advancers: null,
            asi: null,
            asiChangePercent: null,
            decliners: null
          }
        ])
      );

      expect(assessment.regime).toBe('UNKNOWN');
      expect(assessment.asiTrendSource).toBe('NONE');
    });
  });

  describe('worked example: a falling market', () => {
    // ASI 90 against a 10-day average of (9 x 100 + 90) / 10 = 99
    // trend = (90 - 99) / 99 = -9.0909 %; breadth 0.5 is under 0.67
    const assessment = assessMarketRegime(
      buildAsiSeries([...Array.from({ length: 9 }, () => 100), 90], 0.5)
    );

    it('is BEARISH', () => {
      expect(assessment.regime).toBe('BEARISH');
    });

    it('reports the average it compared the index against', () => {
      expect(assessment.asiMovingAverage).toBe(99);
      expect(assessment.asiTrendPercent).toBeCloseTo(-9.0909, 3);
      expect(assessment.asiTrendSource).toBe('MOVING_AVERAGE');
      expect(assessment.advDecRatio).toBe(0.5);
      expect(assessment.observations).toBe(10);
    });
  });

  describe('worked example: a rising market', () => {
    // ASI 110 against a 10-day average of 101 -> +8.9109 %; breadth 2.0
    const assessment = assessMarketRegime(
      buildAsiSeries([...Array.from({ length: 9 }, () => 100), 110], 2)
    );

    it('is BULLISH', () => {
      expect(assessment.regime).toBe('BULLISH');
      expect(assessment.asiMovingAverage).toBe(101);
      expect(assessment.asiTrendPercent).toBeCloseTo(8.9109, 3);
    });
  });

  describe('sparse history', () => {
    it("falls back to the day's own ASI move below 10 observations", () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([
          { advDecRatio: 0.5, asi: 100_000, asiChangePercent: -1.2 }
        ])
      );

      expect(assessment.asiTrendSource).toBe('DAILY_CHANGE');
      expect(assessment.asiTrendPercent).toBe(-1.2);
      expect(assessment.regime).toBe('BEARISH');
    });

    it('decides on breadth alone when the index is unavailable', () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([
          { advDecRatio: 0.5, asi: null, asiChangePercent: null }
        ])
      );

      expect(assessment.regime).toBe('BEARISH');
      expect(assessment.asiTrendSource).toBe('NONE');
    });

    it('recomputes breadth from the counts when the ratio is null', () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([
          {
            advDecRatio: null,
            advancers: 10,
            asiChangePercent: -1,
            decliners: 40
          }
        ])
      );

      expect(assessment.advDecRatio).toBe(0.25);
      expect(assessment.regime).toBe('BEARISH');
    });
  });

  describe('disagreement between the two factors', () => {
    it('is NEUTRAL when breadth is strong but the index is falling', () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([{ advDecRatio: 2, asiChangePercent: -0.5 }])
      );

      expect(assessment.regime).toBe('NEUTRAL');
    });

    it('is NEUTRAL when neither factor is decisive', () => {
      const assessment = assessMarketRegime(
        buildMarketSeries([{ advDecRatio: 1, asiChangePercent: 0 }])
      );

      expect(assessment.regime).toBe('NEUTRAL');
    });
  });
});

describe('applyMarketRegimeGate', () => {
  const bearish = assessMarketRegime(
    buildMarketSeries([{ advDecRatio: 0.5, asiChangePercent: -1.2 }])
  );
  const neutral = assessMarketRegime(
    buildMarketSeries([{ advDecRatio: 1, asiChangePercent: 0 }])
  );

  describe('in a falling market', () => {
    const gated = applyMarketRegimeGate({
      candidate: buildCandidate(),
      regime: bearish
    });

    it('demotes BUY to WATCH', () => {
      expect(gated.direction).toBe(NgxSignalDirection.WATCH);
    });

    it('halves the score', () => {
      expect(gated.score).toBe(0.4);
    });

    it('records what was demoted and why', () => {
      expect(gated.rationale.regime).toEqual({
        advDecRatio: 0.5,
        asiTrendPercent: -1.2,
        asiTrendSource: 'DAILY_CHANGE',
        demoted: true,
        originalDirection: NgxSignalDirection.BUY,
        regime: 'BEARISH'
      });
    });

    it('says so in the summary', () => {
      expect(gated.rationale.summary).toContain(
        'Held back to WATCH because the broad market is falling'
      );
    });

    it('leaves AVOID untouched', () => {
      const gatedAvoid = applyMarketRegimeGate({
        candidate: buildCandidate({
          direction: NgxSignalDirection.AVOID,
          score: -0.8
        }),
        regime: bearish
      });

      expect(gatedAvoid.direction).toBe(NgxSignalDirection.AVOID);
      expect(gatedAvoid.score).toBe(-0.8);
      expect(gatedAvoid.rationale.regime.demoted).toBe(false);
    });

    it('leaves WATCH untouched', () => {
      const gatedWatch = applyMarketRegimeGate({
        candidate: buildCandidate({
          direction: NgxSignalDirection.WATCH,
          score: 0.5
        }),
        regime: bearish
      });

      expect(gatedWatch.score).toBe(0.5);
      expect(gatedWatch.rationale.regime.demoted).toBe(false);
    });
  });

  describe('in any other market', () => {
    it('leaves a BUY alone but still records the regime', () => {
      const gated = applyMarketRegimeGate({
        candidate: buildCandidate(),
        regime: neutral
      });

      expect(gated.direction).toBe(NgxSignalDirection.BUY);
      expect(gated.score).toBe(0.8);
      expect(gated.rationale.regime.regime).toBe('NEUTRAL');
      expect(gated.rationale.regime.demoted).toBe(false);
      expect(gated.rationale.regime.originalDirection).toBeNull();
    });

    it('never promotes a signal in a rising market', () => {
      const bullish = assessMarketRegime(
        buildMarketSeries([{ advDecRatio: 2, asiChangePercent: 1.2 }])
      );

      const gated = applyMarketRegimeGate({
        candidate: buildCandidate({
          direction: NgxSignalDirection.WATCH,
          score: 0.5
        }),
        regime: bullish
      });

      expect(gated.direction).toBe(NgxSignalDirection.WATCH);
      expect(gated.score).toBe(0.5);
    });
  });
});
