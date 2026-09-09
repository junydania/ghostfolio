import { NgxSignalDirection } from '@prisma/client';

import { NgxCompanySnapshotRow } from '../interfaces/interfaces';
import { evaluateFiftyTwoWeekPosition } from './fifty-two-week-position.rule';

function buildSeries(
  overrides: Partial<NgxCompanySnapshotRow>
): NgxCompanySnapshotRow[] {
  return [
    {
      date: new Date(Date.UTC(2026, 8, 8)),
      high52wk: 200,
      low52wk: 100,
      price: 150,
      symbol: 'DANGCEM',
      ...overrides
    }
  ];
}

describe('evaluateFiftyTwoWeekPosition', () => {
  describe('worked example: top of the range', () => {
    // (190 - 100) / (200 - 100) = 0.9 -> score 0.9 x 2 - 1 = 0.8
    const signal = evaluateFiftyTwoWeekPosition(buildSeries({ price: 190 }));

    it('is a BUY', () => {
      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.score).toBe(0.8);
    });

    it('reports the bounds and the position it computed', () => {
      expect(signal.rationale.inputs).toEqual({
        clamped: false,
        high52wk: 200,
        low52wk: 100,
        position: 0.9,
        price: 190,
        rangeRatio: 0.5263
      });
    });

    it('needs only the evaluated day', () => {
      expect(signal.rationale.observations).toBe(1);
    });
  });

  describe('worked example: bottom of the range', () => {
    // (108 - 100) / 100 = 0.08 -> score 0.08 x 2 - 1 = -0.84
    const signal = evaluateFiftyTwoWeekPosition(buildSeries({ price: 108 }));

    it('is an AVOID', () => {
      expect(signal.direction).toBe(NgxSignalDirection.AVOID);
      expect(signal.score).toBe(-0.84);
      expect(signal.rationale.inputs.position).toBe(0.08);
    });
  });

  describe('the watch bands', () => {
    it('reports 0.87 as WATCH rather than BUY', () => {
      const signal = evaluateFiftyTwoWeekPosition(buildSeries({ price: 187 }));

      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
      expect(signal.score).toBeCloseTo(0.74, 10);
    });

    it('reports 0.12 as WATCH rather than AVOID', () => {
      const signal = evaluateFiftyTwoWeekPosition(buildSeries({ price: 112 }));

      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
      expect(signal.score).toBeCloseTo(-0.76, 10);
    });

    it('returns null in the middle of the range', () => {
      expect(
        evaluateFiftyTwoWeekPosition(buildSeries({ price: 150 }))
      ).toBeNull();
    });
  });

  describe('stale published bounds', () => {
    it('clamps a price above its own 52-week high and says so', () => {
      const signal = evaluateFiftyTwoWeekPosition(buildSeries({ price: 220 }));

      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.score).toBe(1);
      expect(signal.rationale.inputs.clamped).toBe(true);
    });
  });

  describe('unusable inputs', () => {
    it('returns null when either bound is missing', () => {
      expect(
        evaluateFiftyTwoWeekPosition(buildSeries({ high52wk: null }))
      ).toBeNull();
      expect(
        evaluateFiftyTwoWeekPosition(buildSeries({ low52wk: null }))
      ).toBeNull();
    });

    it('returns null when every optional field is null', () => {
      expect(
        evaluateFiftyTwoWeekPosition(
          buildSeries({
            change52wPercent: null,
            change7dPercent: null,
            dayHigh: null,
            dayLow: null,
            high52wk: null,
            low52wk: null,
            marketCap: null,
            prevClose: null,
            priceChangePercent: null,
            volume: null
          })
        )
      ).toBeNull();
    });

    it('returns null when the bounds are inverted', () => {
      expect(
        evaluateFiftyTwoWeekPosition(
          buildSeries({ high52wk: 100, low52wk: 200 })
        )
      ).toBeNull();
    });

    it('returns null when the range is too narrow to mean anything', () => {
      // A 2-unit range on a 100 price is 2 %, under the 5 % minimum.
      expect(
        evaluateFiftyTwoWeekPosition(
          buildSeries({ high52wk: 101, low52wk: 99, price: 100 })
        )
      ).toBeNull();
    });

    it('returns null for an empty or missing series', () => {
      expect(evaluateFiftyTwoWeekPosition([])).toBeNull();
      expect(evaluateFiftyTwoWeekPosition(null)).toBeNull();
    });
  });
});
