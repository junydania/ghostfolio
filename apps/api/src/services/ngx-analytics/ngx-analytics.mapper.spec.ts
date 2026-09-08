import { NgnMarketCompanyListItem } from '@ghostfolio/api/services/data-provider/ngn-market/interfaces/interfaces';

import {
  resolveTradingDate,
  toCompanySnapshotRows,
  toFiniteNumber,
  toMarketSnapshotRow,
  toTradingDate
} from './ngx-analytics.mapper';

function createCompany(
  values: Partial<NgnMarketCompanyListItem> = {}
): NgnMarketCompanyListItem {
  return {
    change7dPercent: null,
    change52wPercent: null,
    day_high: null,
    day_low: null,
    high52wk: null,
    id: 'id',
    last_updated: null,
    logo_url: null,
    low52wk: null,
    market_cap: null,
    name: 'A Company',
    prev_close: null,
    price: 100,
    price_change: null,
    price_change_percent: null,
    sector: null,
    shares_outstanding: null,
    sub_sector: null,
    symbol: 'AAA',
    volume: null,
    website: null,
    ...values
  };
}

describe('NgxAnalyticsMapper', () => {
  describe('toTradingDate', () => {
    it('keeps a date-only string on its own calendar day', () => {
      expect(toTradingDate('2026-09-08')?.toISOString()).toBe(
        '2026-09-08T00:00:00.000Z'
      );
    });

    it('resolves a timestamp to the Lagos calendar day', () => {
      // 23:30 UTC is already the next day in Lagos (UTC+1)
      expect(toTradingDate('2026-09-08T23:30:00.000Z')?.toISOString()).toBe(
        '2026-09-09T00:00:00.000Z'
      );

      expect(toTradingDate('2026-09-08T16:20:00.000Z')?.toISOString()).toBe(
        '2026-09-08T00:00:00.000Z'
      );
    });

    it('accepts Date instances', () => {
      expect(
        toTradingDate(new Date('2026-09-08T10:00:00.000Z'))?.toISOString()
      ).toBe('2026-09-08T00:00:00.000Z');
    });

    it('returns null for unusable values', () => {
      expect(toTradingDate(null)).toBeNull();
      expect(toTradingDate('')).toBeNull();
      expect(toTradingDate('not-a-date')).toBeNull();
      expect(toTradingDate(new Date(NaN))).toBeNull();
    });
  });

  describe('resolveTradingDate', () => {
    it('prefers the date the market snapshot reports', () => {
      const date = resolveTradingDate({
        companies: [
          createCompany({ last_updated: '2026-09-07T10:00:00.000Z' })
        ],
        fallbackDate: new Date('2026-01-01T00:00:00.000Z'),
        snapshot: { date: '2026-09-08', updated_at: '2026-09-08T16:00:00.000Z' }
      });

      expect(date.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    });

    it('falls back to updated_at, then to the company feed', () => {
      expect(
        resolveTradingDate({
          companies: [],
          fallbackDate: new Date('2026-01-01T00:00:00.000Z'),
          snapshot: { date: null, updated_at: '2026-09-08T12:00:00.000Z' }
        }).toISOString()
      ).toBe('2026-09-08T00:00:00.000Z');

      expect(
        resolveTradingDate({
          companies: [
            createCompany({ last_updated: null }),
            createCompany({ last_updated: '2026-09-05T12:00:00.000Z' })
          ],
          fallbackDate: new Date('2026-01-01T00:00:00.000Z'),
          snapshot: null
        }).toISOString()
      ).toBe('2026-09-05T00:00:00.000Z');
    });

    it('falls back to the caller-provided date when nothing else is usable', () => {
      expect(
        resolveTradingDate({
          fallbackDate: new Date('2026-09-08T09:00:00.000Z'),
          snapshot: null
        }).toISOString()
      ).toBe('2026-09-08T00:00:00.000Z');
    });
  });

  describe('toCompanySnapshotRows', () => {
    const date = new Date('2026-09-08T00:00:00.000Z');

    it('maps the API payload onto snapshot rows', () => {
      const [row] = toCompanySnapshotRows({
        date,
        companies: [
          createCompany({
            change7dPercent: 1.5,
            change52wPercent: -12,
            day_high: 512,
            day_low: 498,
            high52wk: 640,
            low52wk: 401,
            market_cap: 8_600_000_000,
            prev_close: 500,
            price: 505.5,
            price_change_percent: 1.1,
            sector: 'Industrial Goods',
            shares_outstanding: 17_040_000,
            sub_sector: 'Building Materials',
            symbol: 'DANGCEM',
            volume: 91_200
          })
        ]
      });

      expect(row).toEqual({
        date,
        change7dPercent: 1.5,
        change52wPercent: -12,
        dayHigh: 512,
        dayLow: 498,
        high52wk: 640,
        low52wk: 401,
        marketCap: 8_600_000_000,
        prevClose: 500,
        price: 505.5,
        priceChangePercent: 1.1,
        sector: 'Industrial Goods',
        sharesOutstanding: 17_040_000,
        subSector: 'Building Materials',
        symbol: 'DANGCEM',
        volume: 91_200
      });
    });

    it('skips rows without a usable price rather than writing zero', () => {
      const rows = toCompanySnapshotRows({
        date,
        companies: [
          createCompany({ price: null, symbol: 'AAA' }),
          createCompany({ price: Number.NaN, symbol: 'BBB' }),
          createCompany({ price: 12, symbol: '' }),
          createCompany({ price: 12, symbol: 'CCC' })
        ]
      });

      expect(
        rows.map(({ symbol }) => {
          return symbol;
        })
      ).toEqual(['CCC']);
    });

    it('uppercases symbols and de-duplicates them', () => {
      const rows = toCompanySnapshotRows({
        date,
        companies: [
          createCompany({ price: 10, symbol: 'zenithbank' }),
          createCompany({ price: 11, symbol: 'ZENITHBANK' })
        ]
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].symbol).toBe('ZENITHBANK');
      expect(rows[0].price).toBe(11);
    });

    it('nulls blank sector strings', () => {
      const [row] = toCompanySnapshotRows({
        date,
        companies: [createCompany({ sector: '   ', sub_sector: null })]
      });

      expect(row.sector).toBeNull();
      expect(row.subSector).toBeNull();
    });
  });

  describe('toMarketSnapshotRow', () => {
    const date = new Date('2026-09-08T00:00:00.000Z');

    it('flattens the nested breadth and market cap objects', () => {
      expect(
        toMarketSnapshotRow({
          date,
          snapshot: {
            asi: 108_432.11,
            asi_change: 210.5,
            asi_change_percent: 0.19,
            breadth: {
              adv_dec_ratio: 1.75,
              advancers: 35,
              decliners: 20,
              unchanged: 8
            },
            deals: 12_045,
            market_cap: {
              bonds: 1_000,
              equity: 60_000,
              etfs: 500,
              total: 61_500
            },
            turnover_rate: 0.04,
            value_traded: 5_400_000_000,
            volume: 412_000_000,
            ytd_asi_change_percent: 24.7
          }
        })
      ).toEqual({
        date,
        advancers: 35,
        advDecRatio: 1.75,
        asi: 108_432.11,
        asiChangePercent: 0.19,
        deals: 12_045,
        decliners: 20,
        marketCapTotal: 61_500,
        turnoverRate: 0.04,
        unchanged: 8,
        valueTraded: 5_400_000_000,
        volume: 412_000_000,
        ytdAsiChangePercent: 24.7
      });
    });

    it('tolerates a payload with missing nested objects', () => {
      const row = toMarketSnapshotRow({
        date,
        snapshot: {
          asi: null,
          asi_change: null,
          asi_change_percent: null,
          deals: null,
          turnover_rate: null,
          value_traded: null,
          volume: null,
          ytd_asi_change_percent: null
        }
      });

      expect(row.advancers).toBeNull();
      expect(row.marketCapTotal).toBeNull();
      expect(row.asi).toBeNull();
    });

    it('rounds counts that arrive as floats', () => {
      const row = toMarketSnapshotRow({
        date,
        snapshot: {
          asi: null,
          asi_change: null,
          asi_change_percent: null,
          breadth: {
            adv_dec_ratio: null,
            advancers: 34.6,
            decliners: null,
            unchanged: null
          },
          deals: null,
          turnover_rate: null,
          value_traded: null,
          volume: null,
          ytd_asi_change_percent: null
        }
      });

      expect(row.advancers).toBe(35);
    });
  });

  describe('toFiniteNumber', () => {
    it('rejects values that cannot be stored as a Float', () => {
      expect(toFiniteNumber(Number.NaN)).toBeNull();
      expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
      expect(toFiniteNumber(null)).toBeNull();
      expect(toFiniteNumber('')).toBeNull();
      expect(toFiniteNumber('abc')).toBeNull();
    });

    it('accepts numbers and numeric strings', () => {
      expect(toFiniteNumber(0)).toBe(0);
      expect(toFiniteNumber(-1.25)).toBe(-1.25);
      expect(toFiniteNumber('42.5')).toBe(42.5);
    });
  });
});
