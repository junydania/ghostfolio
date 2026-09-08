import { NgxSignalDirection } from '@prisma/client';

import { NgxCompanySnapshotRow } from '../interfaces/interfaces';
import { evaluateMovingAverageTrend } from './moving-average-trend.rule';

function buildSeries(prices: number[]): NgxCompanySnapshotRow[] {
  return prices.map((price, index) => {
    return {
      price,
      date: new Date(Date.UTC(2026, 0, index + 1)),
      symbol: 'DANGCEM'
    };
  });
}

function repeat(value: number, times: number): number[] {
  return Array.from({ length: times }, () => {
    return value;
  });
}

describe('evaluateMovingAverageTrend', () => {
  describe('insufficient history', () => {
    it('returns null below 25 observations, however extreme the move', () => {
      const series = buildSeries([...repeat(100, 23), 500]);

      expect(series).toHaveLength(24);
      expect(evaluateMovingAverageTrend(series)).toBeNull();
    });

    it('returns null for an empty or missing series', () => {
      expect(evaluateMovingAverageTrend([])).toBeNull();
      expect(evaluateMovingAverageTrend(null)).toBeNull();
    });
  });

  describe('worked example: price above a rising average', () => {
    // 25 closes: 5 x 80, then 19 x 100, then 120.
    //   20-day average  = (19 x 100 + 120) / 20 = 101
    //   the same average 5 observations earlier
    //                   = (5 x 80 + 15 x 100) / 20 = 95
    //   deviation       = (120 - 101) / 101 = +18.8119 %
    //   slope           = (101 - 95) / 95   = +6.3158 %
    //   score           = 18.8119 / 10, clamped to 1
    const signal = evaluateMovingAverageTrend(
      buildSeries([...repeat(80, 5), ...repeat(100, 19), 120])
    );

    it('is a BUY', () => {
      expect(signal.direction).toBe(NgxSignalDirection.BUY);
    });

    it('scores at full strength', () => {
      expect(signal.score).toBe(1);
    });

    it('reports the averages it compared', () => {
      expect(signal.rationale.inputs.movingAverage).toBe(101);
      expect(signal.rationale.inputs.previousMovingAverage).toBe(95);
      expect(signal.rationale.inputs.price).toBe(120);
    });

    it('reports the deviation and slope it measured', () => {
      expect(signal.rationale.inputs.deviationPercent).toBeCloseTo(18.8119, 3);
      expect(signal.rationale.inputs.slopePercent).toBeCloseTo(6.3158, 3);
    });

    it('reports the thresholds those values were tested against', () => {
      expect(signal.rationale.thresholds).toEqual({
        avoidDeviationPercent: -5,
        buyDeviationPercent: 3,
        minimumObservations: 25
      });
    });

    it('states the evidence in the summary', () => {
      expect(signal.rationale.summary).toContain('20-day average of 101');
    });

    it('records how much history it consumed', () => {
      expect(signal.rationale.observations).toBe(25);
    });
  });

  describe('worked example: price below a falling average', () => {
    // 5 x 120, then 19 x 100, then 80.
    //   average = (19 x 100 + 80) / 20 = 99
    //   earlier = (5 x 120 + 15 x 100) / 20 = 105
    //   deviation = (80 - 99) / 99 = -19.1919 %, slope = -5.7143 %
    const signal = evaluateMovingAverageTrend(
      buildSeries([...repeat(120, 5), ...repeat(100, 19), 80])
    );

    it('is an AVOID at full strength', () => {
      expect(signal.direction).toBe(NgxSignalDirection.AVOID);
      expect(signal.score).toBe(-1);
    });

    it('reports the averages it compared', () => {
      expect(signal.rationale.inputs.movingAverage).toBe(99);
      expect(signal.rationale.inputs.previousMovingAverage).toBe(105);
      expect(signal.rationale.inputs.deviationPercent).toBeCloseTo(-19.1919, 3);
      expect(signal.rationale.inputs.slopePercent).toBeCloseTo(-5.7143, 3);
    });
  });

  describe('worked example: a bounce inside a downtrend', () => {
    // 5 x 120, then 19 x 100, then 105.
    //   average = (19 x 100 + 105) / 20 = 100.25, earlier = 105
    //   deviation = 4.75 / 100.25 = +4.7382 % (past the +3 buy threshold)
    //   slope     = -4.5238 % (the average is still falling)
    const signal = evaluateMovingAverageTrend(
      buildSeries([...repeat(120, 5), ...repeat(100, 19), 105])
    );

    it('is held at WATCH because the price and the trend disagree', () => {
      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
    });

    it('still scores the deviation it measured', () => {
      expect(signal.score).toBeCloseTo(0.4738, 4);
      expect(signal.rationale.inputs.movingAverage).toBe(100.25);
      expect(signal.rationale.inputs.slopePercent).toBeCloseTo(-4.5238, 3);
    });
  });

  describe('no evidence', () => {
    it('returns null when the price sits on its own average', () => {
      expect(
        evaluateMovingAverageTrend(buildSeries(repeat(100, 30)))
      ).toBeNull();
    });

    it('returns null for a deviation inside the thresholds', () => {
      // +2 % is short of the +3 % buy threshold.
      const signal = evaluateMovingAverageTrend(
        buildSeries([...repeat(80, 5), ...repeat(100, 19), 102])
      );

      expect(signal).toBeNull();
    });
  });
});
