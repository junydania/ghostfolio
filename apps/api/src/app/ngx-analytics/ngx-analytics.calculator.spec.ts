import {
  NgxCompanySnapshotSlice,
  computePeriodPerformances,
  computeSectorPerformances,
  getPercentChange,
  rankMovers,
  toBreadthSeries,
  toSymbolHistory
} from './ngx-analytics.calculator';

function createRow(values: {
  date: string;
  marketCap?: number | null;
  price: number;
  sector?: string | null;
  symbol: string;
  volume?: number | null;
}): NgxCompanySnapshotSlice {
  const { date, ...rest } = values;

  return {
    date: new Date(`${date}T00:00:00.000Z`),
    marketCap: null,
    sector: null,
    volume: null,
    ...rest
  };
}

describe('NgxAnalyticsCalculator', () => {
  describe('getPercentChange', () => {
    it('computes a percentage move', () => {
      expect(getPercentChange({ from: 100, to: 110 })).toBe(10);
      expect(getPercentChange({ from: 100, to: 90 })).toBe(-10);
    });

    it('returns null when the base is unusable', () => {
      expect(getPercentChange({ from: 0, to: 10 })).toBeNull();
      expect(getPercentChange({ from: Number.NaN, to: 10 })).toBeNull();
      expect(getPercentChange({ from: 10, to: Number.NaN })).toBeNull();
    });
  });

  describe('computePeriodPerformances', () => {
    it('measures each symbol between its first and last stored session', () => {
      const performances = computePeriodPerformances([
        createRow({ date: '2026-09-02', price: 100, symbol: 'AAA' }),
        createRow({ date: '2026-09-04', price: 120, symbol: 'AAA' }),
        createRow({ date: '2026-09-03', price: 110, symbol: 'AAA' }),
        createRow({ date: '2026-09-02', price: 50, symbol: 'BBB' }),
        createRow({ date: '2026-09-04', price: 45, symbol: 'BBB' })
      ]);

      expect(
        performances.find(({ symbol }) => {
          return symbol === 'AAA';
        })
      ).toMatchObject({
        endDate: '2026-09-04',
        endPrice: 120,
        performancePercent: 20,
        startDate: '2026-09-02',
        startPrice: 100
      });

      expect(
        performances.find(({ symbol }) => {
          return symbol === 'BBB';
        }).performancePercent
      ).toBe(-10);
    });

    it('reports a single-session symbol as flat rather than dropping it', () => {
      const [performance] = computePeriodPerformances([
        createRow({ date: '2026-09-04', price: 12, symbol: 'CCC' })
      ]);

      expect(performance.performancePercent).toBe(0);
      expect(performance.startDate).toBe('2026-09-04');
    });

    it('carries the sector and market cap of the latest session', () => {
      const [performance] = computePeriodPerformances([
        createRow({
          date: '2026-09-02',
          marketCap: 100,
          price: 10,
          sector: 'Old',
          symbol: 'AAA'
        }),
        createRow({
          date: '2026-09-04',
          marketCap: 200,
          price: 12,
          sector: 'Financial Services',
          symbol: 'AAA'
        })
      ]);

      expect(performance.marketCap).toBe(200);
      expect(performance.sector).toBe('Financial Services');
    });

    it('ignores rows with a non-finite price', () => {
      expect(
        computePeriodPerformances([
          createRow({ date: '2026-09-04', price: Number.NaN, symbol: 'AAA' })
        ])
      ).toEqual([]);
    });
  });

  describe('rankMovers', () => {
    const performances = computePeriodPerformances([
      createRow({ date: '2026-09-02', price: 100, symbol: 'AAA' }),
      createRow({ date: '2026-09-04', price: 130, symbol: 'AAA' }),
      createRow({ date: '2026-09-02', price: 100, symbol: 'BBB' }),
      createRow({ date: '2026-09-04', price: 80, symbol: 'BBB' }),
      createRow({ date: '2026-09-02', price: 100, symbol: 'CCC' }),
      createRow({ date: '2026-09-04', price: 105, symbol: 'CCC' })
    ]);

    it('ranks gainers descending and losers ascending', () => {
      const { gainers, losers } = rankMovers({ limit: 2, performances });

      expect(
        gainers.map(({ symbol }) => {
          return symbol;
        })
      ).toEqual(['AAA', 'CCC']);

      expect(
        losers.map(({ symbol }) => {
          return symbol;
        })
      ).toEqual(['BBB', 'CCC']);
    });

    it('breaks ties on symbol so the ordering is stable', () => {
      const { gainers } = rankMovers({
        limit: 3,
        performances: computePeriodPerformances([
          createRow({ date: '2026-09-02', price: 100, symbol: 'ZZZ' }),
          createRow({ date: '2026-09-04', price: 110, symbol: 'ZZZ' }),
          createRow({ date: '2026-09-02', price: 100, symbol: 'AAA' }),
          createRow({ date: '2026-09-04', price: 110, symbol: 'AAA' })
        ])
      });

      expect(
        gainers.map(({ symbol }) => {
          return symbol;
        })
      ).toEqual(['AAA', 'ZZZ']);
    });

    it('excludes symbols without a computable move', () => {
      const { gainers, losers } = rankMovers({
        limit: 5,
        performances: computePeriodPerformances([
          createRow({ date: '2026-09-02', price: 0, symbol: 'AAA' }),
          createRow({ date: '2026-09-04', price: 10, symbol: 'AAA' })
        ])
      });

      expect(gainers).toEqual([]);
      expect(losers).toEqual([]);
    });

    it('handles a zero or negative limit', () => {
      expect(rankMovers({ limit: 0, performances }).gainers).toEqual([]);
      expect(rankMovers({ limit: -3, performances }).losers).toEqual([]);
    });
  });

  describe('computeSectorPerformances', () => {
    it('weights sector performance by market capitalisation', () => {
      const sectors = computeSectorPerformances(
        computePeriodPerformances([
          createRow({
            date: '2026-09-02',
            marketCap: 900,
            price: 100,
            sector: 'Banking',
            symbol: 'BIG'
          }),
          createRow({
            date: '2026-09-04',
            marketCap: 900,
            price: 110,
            sector: 'Banking',
            symbol: 'BIG'
          }),
          createRow({
            date: '2026-09-02',
            marketCap: 100,
            price: 100,
            sector: 'Banking',
            symbol: 'SML'
          }),
          createRow({
            date: '2026-09-04',
            marketCap: 100,
            price: 150,
            sector: 'Banking',
            symbol: 'SML'
          })
        ])
      );

      // (10 * 900 + 50 * 100) / 1000 = 14, not the 30 an equal weighting gives
      expect(sectors[0]).toMatchObject({
        advancers: 2,
        companyCount: 2,
        decliners: 0,
        performancePercent: 14,
        sector: 'Banking',
        totalMarketCap: 1000,
        unchanged: 0
      });
    });

    it('falls back to equal weighting when market caps are missing', () => {
      const [sector] = computeSectorPerformances(
        computePeriodPerformances([
          createRow({
            date: '2026-09-02',
            price: 100,
            sector: 'Oil and Gas',
            symbol: 'AAA'
          }),
          createRow({
            date: '2026-09-04',
            price: 120,
            sector: 'Oil and Gas',
            symbol: 'AAA'
          }),
          createRow({
            date: '2026-09-02',
            price: 100,
            sector: 'Oil and Gas',
            symbol: 'BBB'
          }),
          createRow({
            date: '2026-09-04',
            price: 90,
            sector: 'Oil and Gas',
            symbol: 'BBB'
          })
        ])
      );

      expect(sector.performancePercent).toBe(5);
      expect(sector.totalMarketCap).toBeNull();
    });

    it('groups symbols without a sector under Unclassified and sorts descending', () => {
      const sectors = computeSectorPerformances(
        computePeriodPerformances([
          createRow({
            date: '2026-09-02',
            price: 100,
            sector: '  ',
            symbol: 'AAA'
          }),
          createRow({
            date: '2026-09-04',
            price: 200,
            sector: null,
            symbol: 'AAA'
          }),
          createRow({
            date: '2026-09-02',
            price: 100,
            sector: 'Banking',
            symbol: 'BBB'
          }),
          createRow({
            date: '2026-09-04',
            price: 90,
            sector: 'Banking',
            symbol: 'BBB'
          })
        ])
      );

      expect(
        sectors.map(({ sector }) => {
          return sector;
        })
      ).toEqual(['Unclassified', 'Banking']);
    });
  });

  describe('toBreadthSeries', () => {
    it('orders by date and derives a missing advance/decline ratio', () => {
      const breadth = toBreadthSeries([
        {
          advancers: 30,
          advDecRatio: null,
          date: new Date('2026-09-04T00:00:00.000Z'),
          decliners: 15
        },
        {
          advancers: 10,
          advDecRatio: 0.5,
          date: new Date('2026-09-03T00:00:00.000Z'),
          decliners: 20
        }
      ]);

      expect(
        breadth.map(({ date }) => {
          return date;
        })
      ).toEqual(['2026-09-03', '2026-09-04']);

      expect(breadth[0].advDecRatio).toBe(0.5);
      expect(breadth[1].advDecRatio).toBe(2);
    });

    it('leaves the ratio null when there are no decliners', () => {
      const [point] = toBreadthSeries([
        {
          advancers: 30,
          advDecRatio: null,
          date: new Date('2026-09-04T00:00:00.000Z'),
          decliners: 0
        }
      ]);

      expect(point.advDecRatio).toBeNull();
    });

    it('normalises absent fields to null', () => {
      const [point] = toBreadthSeries([
        { date: new Date('2026-09-04T00:00:00.000Z') }
      ]);

      expect(point).toEqual({
        advancers: null,
        advDecRatio: null,
        asi: null,
        asiChangePercent: null,
        date: '2026-09-04',
        decliners: null,
        unchanged: null,
        valueTraded: null,
        volume: null
      });
    });
  });

  describe('toSymbolHistory', () => {
    it('returns an ordered series with its period statistics', () => {
      const history = toSymbolHistory({
        symbol: 'DANGCEM',
        rows: [
          createRow({ date: '2026-09-04', price: 120, symbol: 'DANGCEM' }),
          createRow({ date: '2026-09-02', price: 100, symbol: 'DANGCEM' }),
          createRow({ date: '2026-09-03', price: 140, symbol: 'DANGCEM' })
        ]
      });

      expect(
        history.historicalData.map(({ date }) => {
          return date;
        })
      ).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);

      expect(history.high).toBe(140);
      expect(history.low).toBe(100);
      expect(history.performancePercent).toBe(20);
    });

    it('returns an empty series for a symbol with no stored history', () => {
      expect(toSymbolHistory({ rows: [], symbol: 'AAA' })).toEqual({
        high: null,
        historicalData: [],
        low: null,
        performancePercent: null,
        symbol: 'AAA'
      });
    });
  });
});
