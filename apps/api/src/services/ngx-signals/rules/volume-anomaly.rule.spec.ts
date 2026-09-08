import { NgxSignalDirection } from '@prisma/client';

import { NgxCompanySnapshotRow } from '../interfaces/interfaces';
import { evaluateVolumeAnomaly } from './volume-anomaly.rule';

/**
 * `trailingVolumes` are the days before the evaluated one; `latest` is the
 * evaluated day itself.
 */
function buildSeries({
  latest,
  trailingVolumes
}: {
  latest: Partial<NgxCompanySnapshotRow>;
  trailingVolumes: (number | null)[];
}): NgxCompanySnapshotRow[] {
  const trailing = trailingVolumes.map((volume, index) => {
    return {
      volume,
      date: new Date(Date.UTC(2026, 0, index + 1)),
      price: 100,
      symbol: 'DANGCEM'
    };
  });

  return [
    ...trailing,
    {
      date: new Date(Date.UTC(2026, 1, 1)),
      price: 100,
      symbol: 'DANGCEM',
      ...latest
    }
  ];
}

function repeat(value: number | null, times: number): (number | null)[] {
  return Array.from({ length: times }, () => {
    return value;
  });
}

describe('evaluateVolumeAnomaly', () => {
  describe('insufficient history', () => {
    it('returns null with only 20 observations', () => {
      const series = buildSeries({
        latest: { priceChangePercent: 5, volume: 1_000_000 },
        trailingVolumes: repeat(100_000, 19)
      });

      expect(series).toHaveLength(20);
      expect(evaluateVolumeAnomaly(series)).toBeNull();
    });

    it('returns null when nulls leave fewer than 20 usable trailing volumes', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: { priceChangePercent: 5, volume: 1_000_000 },
          trailingVolumes: [...repeat(null, 5), ...repeat(100_000, 19)]
        })
      );

      expect(signal).toBeNull();
    });

    it('returns null for an empty or missing series', () => {
      expect(evaluateVolumeAnomaly([])).toBeNull();
      expect(evaluateVolumeAnomaly(null)).toBeNull();
    });
  });

  describe('worked example: a spike into a rising price', () => {
    // trailing average = 100,000; the day traded 400,000 -> ratio 4
    // score = (4 - 1) / (5 - 1) = 0.75
    const signal = evaluateVolumeAnomaly(
      buildSeries({
        latest: { priceChangePercent: 2.5, volume: 400_000 },
        trailingVolumes: repeat(100_000, 20)
      })
    );

    it('is a BUY', () => {
      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.score).toBe(0.75);
    });

    it('reports the volumes it compared and where the price move came from', () => {
      expect(signal.rationale.inputs).toEqual({
        averageVolume: 100_000,
        priceChangePercent: 2.5,
        priceChangeSource: 'REPORTED',
        trailingPeriod: 20,
        volume: 400_000,
        volumeRatio: 4
      });
    });

    it('reports the thresholds those values were tested against', () => {
      expect(signal.rationale.thresholds).toEqual({
        confirmationRatio: 3,
        minimumAverageVolume: 10_000,
        minimumObservations: 21,
        watchRatio: 2
      });
    });
  });

  describe('worked example: the same spike into a falling price', () => {
    const signal = evaluateVolumeAnomaly(
      buildSeries({
        latest: { priceChangePercent: -2.5, volume: 400_000 },
        trailingVolumes: repeat(100_000, 20)
      })
    );

    it('is an AVOID with a mirrored score', () => {
      expect(signal.direction).toBe(NgxSignalDirection.AVOID);
      expect(signal.score).toBe(-0.75);
    });
  });

  describe('the watch band', () => {
    it('reports 2.5x volume as WATCH, short of the 3x confirmation', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: { priceChangePercent: 1, volume: 250_000 },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
      expect(signal.score).toBe(0.375);
    });

    it('returns null below 2x volume', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: { priceChangePercent: 1, volume: 150_000 },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal).toBeNull();
    });
  });

  describe('thin symbols', () => {
    it('returns null when the trailing average is below 10,000 shares', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: { priceChangePercent: 10, volume: 50_000 },
          trailingVolumes: repeat(5_000, 20)
        })
      );

      expect(signal).toBeNull();
    });
  });

  describe('a missing price change', () => {
    it('falls back to the reported previous close', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: {
            prevClose: 100,
            price: 110,
            priceChangePercent: null,
            volume: 400_000
          },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal.direction).toBe(NgxSignalDirection.BUY);
      expect(signal.rationale.inputs.priceChangePercent).toBe(10);
      expect(signal.rationale.inputs.priceChangeSource).toBe('PREVIOUS_CLOSE');
    });

    it('falls back to the preceding snapshot', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: {
            prevClose: null,
            price: 90,
            priceChangePercent: null,
            volume: 400_000
          },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal.direction).toBe(NgxSignalDirection.AVOID);
      expect(signal.rationale.inputs.priceChangePercent).toBe(-10);
      expect(signal.rationale.inputs.priceChangeSource).toBe(
        'PREVIOUS_SNAPSHOT'
      );
    });

    it('reports an unusually busy but directionless day as a neutral WATCH', () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: {
            prevClose: null,
            price: 100,
            priceChangePercent: null,
            volume: 400_000
          },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal.direction).toBe(NgxSignalDirection.WATCH);
      expect(signal.score).toBe(0);
    });
  });

  describe('unusable inputs', () => {
    it("returns null when the day's own volume is missing", () => {
      const signal = evaluateVolumeAnomaly(
        buildSeries({
          latest: { priceChangePercent: 5, volume: null },
          trailingVolumes: repeat(100_000, 20)
        })
      );

      expect(signal).toBeNull();
    });
  });
});
