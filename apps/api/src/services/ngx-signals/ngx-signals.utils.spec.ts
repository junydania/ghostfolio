import { NgxCompanySnapshotRow } from './interfaces/interfaces';
import {
  clampScore,
  clampToUnitInterval,
  getDateKey,
  groupSeriesBySymbol,
  mean,
  median,
  percentChange,
  round,
  toMarketSeries,
  toNumberOrNull
} from './ngx-signals.utils';

function row(
  overrides: Partial<NgxCompanySnapshotRow> &
    Pick<NgxCompanySnapshotRow, 'date'>
): NgxCompanySnapshotRow {
  return {
    price: 100,
    symbol: 'DANGCEM',
    ...overrides
  };
}

describe('NgxSignalsUtils', () => {
  describe('getDateKey', () => {
    it('formats on the UTC calendar day', () => {
      expect(getDateKey(new Date(Date.UTC(2026, 8, 8)))).toBe('2026-09-08');
    });

    it('returns null for unusable values', () => {
      expect(getDateKey(null)).toBeNull();
      expect(getDateKey(new Date('not-a-date'))).toBeNull();
    });
  });

  describe('toNumberOrNull', () => {
    it('passes finite numbers through', () => {
      expect(toNumberOrNull(0)).toBe(0);
      expect(toNumberOrNull(-1.5)).toBe(-1.5);
    });

    it('rejects everything that cannot be used in arithmetic', () => {
      expect(toNumberOrNull(null)).toBeNull();
      expect(toNumberOrNull(undefined)).toBeNull();
      expect(toNumberOrNull('100')).toBeNull();
      expect(toNumberOrNull(Number.NaN)).toBeNull();
      expect(toNumberOrNull(Number.POSITIVE_INFINITY)).toBeNull();
    });
  });

  describe('mean and median', () => {
    it('returns null for an empty sample', () => {
      expect(mean([])).toBeNull();
      expect(median([])).toBeNull();
    });

    it('averages', () => {
      expect(mean([1, 2, 3, 4])).toBe(2.5);
    });

    it('takes the middle value of an odd sample', () => {
      expect(median([5, 1, 3])).toBe(3);
    });

    it('averages the two middle values of an even sample', () => {
      expect(median([4, 1, 3, 2])).toBe(2.5);
    });
  });

  describe('clamping', () => {
    it('bounds a signed score to [-1, 1]', () => {
      expect(clampScore(2.4)).toBe(1);
      expect(clampScore(-2.4)).toBe(-1);
      expect(clampScore(0.5)).toBe(0.5);
    });

    it('bounds a position to [0, 1]', () => {
      expect(clampToUnitInterval(1.2)).toBe(1);
      expect(clampToUnitInterval(-0.2)).toBe(0);
    });
  });

  describe('percentChange', () => {
    it('computes the change in percent', () => {
      expect(percentChange(100, 110)).toBe(10);
      expect(percentChange(100, 90)).toBe(-10);
    });

    it('returns null when the base is zero or unusable', () => {
      expect(percentChange(0, 10)).toBeNull();
      expect(percentChange(null, 10)).toBeNull();
      expect(percentChange(100, null)).toBeNull();
    });
  });

  describe('round', () => {
    it('rounds to four decimals by default', () => {
      expect(round(1.234567)).toBe(1.2346);
    });

    it('passes unusable values through untouched', () => {
      expect(round(null)).toBeNull();
    });
  });

  describe('groupSeriesBySymbol', () => {
    it('keeps only symbols that traded on the evaluation date', () => {
      const result = groupSeriesBySymbol(
        [
          row({ date: new Date(Date.UTC(2026, 8, 7)), symbol: 'STALE' }),
          row({ date: new Date(Date.UTC(2026, 8, 8)), symbol: 'FRESH' })
        ],
        '2026-09-08'
      );

      expect([...result.keys()]).toEqual(['FRESH']);
    });

    it('drops rows dated after the evaluation date', () => {
      const result = groupSeriesBySymbol(
        [
          row({ date: new Date(Date.UTC(2026, 8, 7)) }),
          row({ date: new Date(Date.UTC(2026, 8, 8)) }),
          row({ date: new Date(Date.UTC(2026, 8, 9)), price: 999 })
        ],
        '2026-09-08'
      );

      expect(result.get('DANGCEM')).toHaveLength(2);
      expect(result.get('DANGCEM').at(-1).price).toBe(100);
    });

    it('sorts ascending and de-duplicates a repeated calendar day', () => {
      const result = groupSeriesBySymbol(
        [
          row({ date: new Date(Date.UTC(2026, 8, 8)), price: 10 }),
          row({ date: new Date(Date.UTC(2026, 8, 7)), price: 20 }),
          row({ date: new Date(Date.UTC(2026, 8, 8)), price: 30 })
        ],
        '2026-09-08'
      );

      expect(
        result.get('DANGCEM').map(({ price }) => {
          return price;
        })
      ).toEqual([20, 30]);
    });

    it('drops rows with an unusable price', () => {
      const result = groupSeriesBySymbol(
        [
          row({ date: new Date(Date.UTC(2026, 8, 7)), price: 0 }),
          row({ date: new Date(Date.UTC(2026, 8, 8)) })
        ],
        '2026-09-08'
      );

      expect(result.get('DANGCEM')).toHaveLength(1);
    });

    it('tolerates an empty input', () => {
      expect(groupSeriesBySymbol([], '2026-09-08').size).toBe(0);
      expect(groupSeriesBySymbol(null, '2026-09-08').size).toBe(0);
    });
  });

  describe('toMarketSeries', () => {
    it('sorts ascending, de-duplicates and stops at the evaluation date', () => {
      const result = toMarketSeries(
        [
          { asi: 3, date: new Date(Date.UTC(2026, 8, 9)) },
          { asi: 1, date: new Date(Date.UTC(2026, 8, 8)) },
          { asi: 2, date: new Date(Date.UTC(2026, 8, 7)) }
        ],
        '2026-09-08'
      );

      expect(
        result.map(({ asi }) => {
          return asi;
        })
      ).toEqual([2, 1]);
    });
  });
});
