import { DataSource } from '@prisma/client';

import { NgnMarketChartResponse } from './interfaces/interfaces';
import {
  getForeignCurrencyOfPair,
  isNgnCurrencyPair,
  isRangeClamped,
  normalizeChartDate,
  parseChartResponse,
  toAssetProfile,
  toNgnPerUnitRates,
  toQuote
} from './ngn-market.mapper';

describe('NgnMarketMapper', () => {
  describe('isNgnCurrencyPair', () => {
    it('recognizes NGN pairs', () => {
      expect(isNgnCurrencyPair('USDNGN')).toBe(true);
      expect(isNgnCurrencyPair('GBPNGN')).toBe(true);
    });

    it('rejects equities and non-NGN pairs', () => {
      expect(isNgnCurrencyPair('DANGCEM')).toBe(false);
      expect(isNgnCurrencyPair('USDEUR')).toBe(false);
      expect(isNgnCurrencyPair('NGNUSD')).toBe(false);
    });

    it('extracts the foreign currency', () => {
      expect(getForeignCurrencyOfPair('USDNGN')).toBe('USD');
    });
  });

  describe('normalizeChartDate', () => {
    it('handles ISO strings', () => {
      expect(normalizeChartDate('2026-03-04')).toBe('2026-03-04');
    });

    it('handles epoch milliseconds', () => {
      expect(normalizeChartDate(Date.UTC(2026, 2, 4))).toBe('2026-03-04');
    });

    it('handles epoch seconds', () => {
      expect(normalizeChartDate(Date.UTC(2026, 2, 4) / 1000)).toBe(
        '2026-03-04'
      );
    });

    it('returns null for unusable values', () => {
      expect(normalizeChartDate(null)).toBeNull();
      expect(normalizeChartDate('not-a-date')).toBeNull();
    });
  });

  describe('parseChartResponse', () => {
    it('parses compact [timestamp, close] tuples', () => {
      const response = {
        data: [
          ['2026-03-04', 512.5],
          ['2026-03-05', 518]
        ]
      } as unknown as NgnMarketChartResponse;

      expect(parseChartResponse(response)).toEqual({
        '2026-03-04': { marketPrice: 512.5 },
        '2026-03-05': { marketPrice: 518 }
      });
    });

    it('parses OHLCV tuples using the close column', () => {
      const response = {
        data: [['2026-03-04', 500, 520, 495, 512.5, 10_000]]
      } as unknown as NgnMarketChartResponse;

      expect(parseChartResponse(response)).toEqual({
        '2026-03-04': { marketPrice: 512.5 }
      });
    });

    it('parses detailed objects', () => {
      const response = {
        data: [{ close: 512.5, date: '2026-03-04' }]
      } as unknown as NgnMarketChartResponse;

      expect(parseChartResponse(response)).toEqual({
        '2026-03-04': { marketPrice: 512.5 }
      });
    });

    it('skips points without a close rather than writing zero', () => {
      const response = {
        data: [
          { close: null, date: '2026-03-04' },
          { close: 518, date: '2026-03-05' }
        ]
      } as unknown as NgnMarketChartResponse;

      expect(parseChartResponse(response)).toEqual({
        '2026-03-05': { marketPrice: 518 }
      });
    });

    it('tolerates a missing or malformed payload', () => {
      expect(parseChartResponse(undefined)).toEqual({});
      expect(
        parseChartResponse({ data: null } as unknown as NgnMarketChartResponse)
      ).toEqual({});
    });
  });

  describe('isRangeClamped', () => {
    it('detects a narrowed range', () => {
      expect(
        isRangeClamped({
          requestedFrom: new Date('2020-01-01'),
          statisticsStartDate: '2024-01-01'
        })
      ).toBe(true);
    });

    it('accepts an honoured range', () => {
      expect(
        isRangeClamped({
          requestedFrom: new Date('2025-01-01'),
          statisticsStartDate: '2025-01-01'
        })
      ).toBe(false);
    });

    it('does not report a clamp without statistics', () => {
      expect(
        isRangeClamped({
          requestedFrom: new Date('2020-01-01'),
          statisticsStartDate: null
        })
      ).toBe(false);
    });
  });

  describe('toQuote', () => {
    const dataProviderInfo = { isPremium: true, name: 'NGN Market' };

    it('maps a list item to a delayed NGN quote', () => {
      expect(
        toQuote({
          company: { price: 512.5, symbol: 'DANGCEM' },
          dataProviderInfo
        })
      ).toEqual({
        dataProviderInfo,
        currency: 'NGN',
        dataSource: DataSource.NGN_MARKET,
        marketPrice: 512.5,
        marketState: 'delayed'
      });
    });

    it('falls back to current_price from the detail endpoint', () => {
      expect(
        toQuote({
          company: { current_price: 44, price: null, symbol: 'GTCO' },
          dataProviderInfo
        }).marketPrice
      ).toBe(44);
    });
  });

  describe('toAssetProfile', () => {
    it('maps identity, sector and country', () => {
      const profile = toAssetProfile({
        company: {
          international_sec_id: 'NGDANGCEM09',
          name: 'Dangote Cement Plc',
          sector: 'Industrial Goods',
          website: 'https://www.dangotecement.com'
        } as never,
        symbol: 'DANGCEM'
      });

      expect(profile).toMatchObject({
        symbol: 'DANGCEM',
        currency: 'NGN',
        dataSource: DataSource.NGN_MARKET,
        isin: 'NGDANGCEM09',
        name: 'Dangote Cement Plc',
        url: 'https://www.dangotecement.com'
      });
      expect(profile.countries).toEqual([{ code: 'NG', weight: 1 }]);
      expect(profile.sectors).toEqual([
        { name: 'Industrial Goods', weight: 1 }
      ]);
    });

    it('omits optional fields when the API returns nulls', () => {
      const profile = toAssetProfile({
        company: {
          international_sec_id: null,
          name: null,
          sector: null,
          website: null
        } as never,
        symbol: 'ZENITHBANK'
      });

      expect(profile.name).toBe('ZENITHBANK');
      expect(profile.isin).toBeUndefined();
      expect(profile.sectors).toBeUndefined();
      expect(profile.url).toBeUndefined();
    });
  });

  describe('toNgnPerUnitRates', () => {
    it('uses inverse_rate, which is NGN per unit of foreign currency', () => {
      expect(
        toNgnPerUnitRates({
          date: '2026-03-04',
          rates: [
            {
              currency: 'USD',
              daily_change: null,
              daily_change_percent: null,
              inverse_rate: 1605.14,
              last_updated: null,
              rate: 0.000623
            }
          ],
          target: 'NGN'
        })
      ).toEqual({ USD: 1605.14 });
    });

    it('inverts rate when inverse_rate is missing', () => {
      const rates = toNgnPerUnitRates({
        date: null,
        rates: [
          {
            currency: 'GBP',
            daily_change: null,
            daily_change_percent: null,
            inverse_rate: null,
            last_updated: null,
            rate: 0.0005
          }
        ],
        target: 'NGN'
      });

      expect(rates.GBP).toBe(2000);
    });

    it('never returns the raw NGN-per-1 rate, which would be inverted', () => {
      const rates = toNgnPerUnitRates({
        date: null,
        rates: [
          {
            currency: 'USD',
            daily_change: null,
            daily_change_percent: null,
            inverse_rate: null,
            last_updated: null,
            rate: 0.000623
          }
        ],
        target: 'NGN'
      });

      expect(rates.USD).toBeGreaterThan(1);
    });

    it('skips unusable rates and tolerates a malformed payload', () => {
      expect(
        toNgnPerUnitRates({
          date: null,
          rates: [
            {
              currency: 'EUR',
              daily_change: null,
              daily_change_percent: null,
              inverse_rate: null,
              last_updated: null,
              rate: 0
            }
          ],
          target: 'NGN'
        })
      ).toEqual({});

      expect(toNgnPerUnitRates(undefined)).toEqual({});
    });
  });
});
