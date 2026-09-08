import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxExchangeReturnMedians
} from '../interfaces/interfaces';
import {
  computeExchangeReturnMedians,
  computeReturnOverPeriod,
  evaluateRelativeStrength
} from './relative-strength.rule';

/**
 * A series that is flat at 100 and closes at `finalPrice`, so its return over
 * any available horizon is `finalPrice - 100` percent.
 */
function buildSeries({
  finalPrice,
  observations,
  symbol = 'DANGCEM'
}: {
  finalPrice: number;
  observations: number;
  symbol?: string;
}): NgxCompanySnapshotRow[] {
  return Array.from({ length: observations }, (_, index) => {
    return {
      symbol,
      date: new Date(Date.UTC(2026, 0, index + 1)),
      price: index === observations - 1 ? finalPrice : 100
    };
  });
}

function medians(
  overrides: Partial<NgxExchangeReturnMedians> = {}
): NgxExchangeReturnMedians {
  return {
    longPeriodMedian: null,
    longPeriodSampleSize: 0,
    shortPeriodMedian: null,
    shortPeriodSampleSize: 0,
    ...overrides
  };
}

describe('computeReturnOverPeriod', () => {
  it('returns null below period + 1 observations', () => {
    expect(
      computeReturnOverPeriod(
        buildSeries({ finalPrice: 120, observations: 7 }),
        7
      )
    ).toBeNull();
  });

  it('measures from the close 7 observations back', () => {
    expect(
      computeReturnOverPeriod(
        buildSeries({ finalPrice: 120, observations: 8 }),
        7
      )
    ).toBe(20);
  });

  it('tolerates an empty or missing series', () => {
    expect(computeReturnOverPeriod([], 7)).toBeNull();
    expect(computeReturnOverPeriod(null, 7)).toBeNull();
  });
});

describe('computeExchangeReturnMedians', () => {
  /** 21 symbols whose 7-day returns are 0 % through 20 %, median 10 %. */
  function buildCrossSection(size: number) {
    const seriesBySymbol = new Map<string, NgxCompanySnapshotRow[]>();

    for (let index = 0; index < size; index++) {
      seriesBySymbol.set(
        `SYM${index}`,
        buildSeries({
          finalPrice: 100 + index,
          observations: 8,
          symbol: `SYM${index}`
        })
      );
    }

    return seriesBySymbol;
  }

  it('takes the median across the exchange', () => {
    const result = computeExchangeReturnMedians(buildCrossSection(21));

    expect(result.shortPeriodMedian).toBe(10);
    expect(result.shortPeriodSampleSize).toBe(21);
  });

  it('drops a horizon backed by fewer than 20 symbols', () => {
    const result = computeExchangeReturnMedians(buildCrossSection(19));

    expect(result.shortPeriodMedian).toBeNull();
    expect(result.shortPeriodSampleSize).toBe(19);
  });

  it('drops the 30-day horizon until symbols have 31 observations', () => {
    const result = computeExchangeReturnMedians(buildCrossSection(21));

    expect(result.longPeriodMedian).toBeNull();
    expect(result.longPeriodSampleSize).toBe(0);
  });

  it('tolerates an empty cross-section', () => {
    const result = computeExchangeReturnMedians(new Map());

    expect(result.shortPeriodMedian).toBeNull();
    expect(result.longPeriodMedian).toBeNull();
  });
});

describe('evaluateRelativeStrength', () => {
  describe('worked example: the short horizon alone', () => {
    // 20 % against an exchange median of 2 % is 18 points of excess return,
    // past the 15-point full-strength scale, so the score clamps to 1.
    const signal = evaluateRelativeStrength({
      medians: medians({ shortPeriodMedian: 2, shortPeriodSampleSize: 30 }),
      series: buildSeries({ finalPrice: 120, observations: 8 })
    });

    it('is a BUY at full strength', () => {
      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.score).toBe(1);
    });

    it('names the horizon it actually used', () => {
      expect(signal.rationale.inputs.horizonsUsed).toBe('7d');
    });

    it('reports the return, the median and the difference', () => {
      expect(signal.rationale.inputs.returnPercent7d).toBe(20);
      expect(signal.rationale.inputs.exchangeMedianReturnPercent7d).toBe(2);
      expect(signal.rationale.inputs.excessReturnPercent7d).toBe(18);
    });

    it('reports the breadth of the cross-section behind the median', () => {
      expect(signal.rationale.inputs.shortPeriodCrossSectionSize).toBe(30);
    });
  });

  describe('worked example: both horizons agreeing', () => {
    // 20 % over 7 days against a median of 12 % -> +8 points
    // 20 % over 30 days against a median of 15 % -> +5 points
    // score = mean(8, 5) / 15 = 6.5 / 15
    const signal = evaluateRelativeStrength({
      medians: medians({
        longPeriodMedian: 15,
        longPeriodSampleSize: 25,
        shortPeriodMedian: 12,
        shortPeriodSampleSize: 30
      }),
      series: buildSeries({ finalPrice: 120, observations: 31 })
    });

    it('is a BUY', () => {
      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.score).toBeCloseTo(0.4333, 4);
    });

    it('names both horizons', () => {
      expect(signal.rationale.inputs.horizonsUsed).toBe('7d,30d');
      expect(signal.rationale.inputs.excessReturnPercent7d).toBe(8);
      expect(signal.rationale.inputs.excessReturnPercent30d).toBe(5);
    });
  });

  describe('worked example: both horizons behind the exchange', () => {
    const signal = evaluateRelativeStrength({
      medians: medians({
        longPeriodMedian: 30,
        longPeriodSampleSize: 25,
        shortPeriodMedian: 30,
        shortPeriodSampleSize: 30
      }),
      series: buildSeries({ finalPrice: 120, observations: 31 })
    });

    it('is an AVOID', () => {
      expect(signal.direction).toBe(NgxSignalDirection.AVOID);
      expect(signal.score).toBeCloseTo(-0.6667, 4);
    });
  });

  describe('horizons that disagree', () => {
    it('is held at WATCH rather than picking a side', () => {
      // -10 points over 7 days, +15 points over 30 days
      const signal = evaluateRelativeStrength({
        medians: medians({
          longPeriodMedian: 5,
          longPeriodSampleSize: 25,
          shortPeriodMedian: 30,
          shortPeriodSampleSize: 30
        }),
        series: buildSeries({ finalPrice: 120, observations: 31 })
      });

      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
      expect(signal.score).toBeCloseTo(0.1667, 4);
    });
  });

  describe('no evidence', () => {
    it('returns null when the symbol tracks the exchange', () => {
      const signal = evaluateRelativeStrength({
        medians: medians({ shortPeriodMedian: 18, shortPeriodSampleSize: 30 }),
        series: buildSeries({ finalPrice: 120, observations: 8 })
      });

      expect(signal).toBeNull();
    });

    it('returns null when no horizon has a usable exchange median', () => {
      const signal = evaluateRelativeStrength({
        medians: medians(),
        series: buildSeries({ finalPrice: 120, observations: 31 })
      });

      expect(signal).toBeNull();
    });

    it('returns null when the symbol lacks the history for any horizon', () => {
      const signal = evaluateRelativeStrength({
        medians: medians({ shortPeriodMedian: 2, shortPeriodSampleSize: 30 }),
        series: buildSeries({ finalPrice: 120, observations: 7 })
      });

      expect(signal).toBeNull();
    });

    it('returns null for an empty or missing series', () => {
      expect(
        evaluateRelativeStrength({ medians: medians(), series: [] })
      ).toBeNull();
      expect(
        evaluateRelativeStrength({ medians: medians(), series: null })
      ).toBeNull();
    });
  });
});
