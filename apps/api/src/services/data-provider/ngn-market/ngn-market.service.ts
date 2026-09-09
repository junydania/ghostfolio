import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { AssetProfileDelistedError } from '@ghostfolio/api/services/data-provider/errors/asset-profile-delisted.error';
import {
  DataProviderInterface,
  GetAssetProfileParams,
  GetDividendsParams,
  GetHistoricalParams,
  GetQuotesParams,
  GetSearchParams
} from '@ghostfolio/api/services/data-provider/interfaces/data-provider.interface';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse,
  LookupItem,
  LookupResponse
} from '@ghostfolio/common/interfaces';

import { Injectable, Logger } from '@nestjs/common';
import {
  AssetClass,
  AssetSubClass,
  DataSource,
  SymbolProfile
} from '@prisma/client';
import { format } from 'date-fns';

import {
  NgnMarketChartResponse,
  NgnMarketCompanyDetail,
  NgnMarketCompanyListItem,
  NgnMarketForexCurrentResponse,
  NgnMarketForexHistoryPoint,
  NgnMarketIdentifier
} from './interfaces/interfaces';
import { NgnMarketApiService } from './ngn-market-api.service';
import {
  NGN_MARKET_CURRENCY,
  extractListPayload,
  getForeignCurrencyOfPair,
  isNgnCurrencyPair,
  isRangeClamped,
  parseChartResponse,
  toAssetProfile,
  toNgnPerUnitRates,
  toQuote
} from './ngn-market.mapper';

@Injectable()
export class NgnMarketService implements DataProviderInterface {
  private static readonly COMPANIES_PAGE_SIZE = 200;
  private static readonly IDENTIFIERS_CACHE_TTL = 24 * 60 * 60 * 1000;
  private static readonly MAX_COMPANY_PAGES = 5;

  private readonly logger = new Logger(NgnMarketService.name);

  private identifiersCache: {
    expiresAt: number;
    items: NgnMarketIdentifier[];
  } | null = null;

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly ngnMarketApiService: NgnMarketApiService
  ) {}

  public canHandle() {
    return true;
  }

  public getDataProviderInfo(): DataProviderInfo {
    return {
      dataSource: this.getName(),
      isPremium: true,
      name: 'NGN Market',
      url: 'https://docs.ngnmarket.com'
    };
  }

  public getName(): DataSource {
    return DataSource.NGN_MARKET;
  }

  public getTestSymbol() {
    return 'DANGCEM';
  }

  public async getAssetProfile({
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT'),
    symbol
  }: GetAssetProfileParams): Promise<Partial<SymbolProfile>> {
    if (isNgnCurrencyPair(symbol)) {
      return {
        symbol,
        assetClass: AssetClass.LIQUIDITY,
        assetSubClass: AssetSubClass.CASH,
        currency: NGN_MARKET_CURRENCY,
        dataSource: this.getName()
      };
    }

    const { data: company, isNotFound } =
      await this.ngnMarketApiService.request<NgnMarketCompanyDetail>({
        requestTimeout,
        path: `/companies/${encodeURIComponent(symbol)}`
      });

    if (isNotFound) {
      throw new AssetProfileDelistedError(
        `No data found, ${symbol} (${this.getName()}) may be delisted`
      );
    }

    if (company) {
      return toAssetProfile({ company, symbol });
    }

    // The company detail endpoint requires a Hobby plan. On the Free plan it
    // answers 403, so fall back to the listing and identifier endpoints, which
    // are free and together carry everything the profile needs except the
    // description. Without this, no NGX symbol can be added at all.
    const fallback = await this.getAssetProfileFromFreeEndpoints({
      requestTimeout,
      symbol
    });

    if (fallback) {
      return fallback;
    }

    // A transient failure must not be reported as delisted: the data
    // gathering processor deactivates the symbol profile when it is.
    throw new Error(
      `Could not get asset profile for ${symbol} (${this.getName()})`
    );
  }

  /**
   * Dividend history requires a Starter plan or higher. Returning empty keeps
   * this an explicit no-op rather than a silent failure.
   */
  public async getDividends({}: GetDividendsParams) {
    return {};
  }

  public async getHistorical({
    from,
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT'),
    symbol,
    to
  }: GetHistoricalParams): Promise<{
    [date: string]: DataProviderHistoricalResponse;
  }> {
    if (isNgnCurrencyPair(symbol)) {
      return this.getHistoricalForexRates({
        from,
        requestTimeout,
        symbol,
        to
      });
    }

    const { data: response } =
      await this.ngnMarketApiService.request<NgnMarketChartResponse>({
        requestTimeout,
        path: `/companies/${encodeURIComponent(symbol)}/chart`,
        searchParams: {
          format: 'chart',
          from: format(from, DATE_FORMAT),
          to: format(to, DATE_FORMAT)
        }
      });

    if (!response) {
      return {};
    }

    if (
      isRangeClamped({
        requestedFrom: from,
        statisticsStartDate: response.statistics?.start_date
      })
    ) {
      this.logger.warn(
        `Historical range for ${symbol} was clamped by the plan allowance: requested from ${format(
          from,
          DATE_FORMAT
        )}, received from ${response.statistics.start_date}`
      );
    }

    return parseChartResponse(response);
  }

  public async getQuotes({
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT'),
    symbols
  }: GetQuotesParams): Promise<{ [symbol: string]: DataProviderResponse }> {
    const response: { [symbol: string]: DataProviderResponse } = {};

    if (symbols.length <= 0) {
      return response;
    }

    const currencyPairs = symbols.filter((symbol) => {
      return isNgnCurrencyPair(symbol);
    });

    const equitySymbols = symbols.filter((symbol) => {
      return !isNgnCurrencyPair(symbol);
    });

    if (equitySymbols.length > 0) {
      const companies = await this.getCompanies({ requestTimeout });

      const companyBySymbol = new Map<string, NgnMarketCompanyListItem>(
        companies.map((company) => {
          return [company.symbol?.toUpperCase(), company];
        })
      );

      for (const symbol of equitySymbols) {
        const company = companyBySymbol.get(symbol.toUpperCase());

        if (company?.price !== null && company?.price !== undefined) {
          response[symbol] = toQuote({
            company,
            dataProviderInfo: this.getDataProviderInfo()
          });
        }
      }
    }

    if (currencyPairs.length > 0) {
      const rates = await this.getCurrentForexRates({ requestTimeout });

      for (const symbol of currencyPairs) {
        const rate = rates[getForeignCurrencyOfPair(symbol)];

        if (typeof rate === 'number' && isFinite(rate)) {
          response[symbol] = {
            currency: NGN_MARKET_CURRENCY,
            dataProviderInfo: this.getDataProviderInfo(),
            dataSource: this.getName(),
            marketPrice: rate,
            marketState: 'delayed'
          };
        }
      }
    }

    return response;
  }

  public async search({
    query,
    requestTimeout = this.configurationService.get('REQUEST_TIMEOUT')
  }: GetSearchParams): Promise<LookupResponse> {
    const identifiers = await this.getIdentifiers({ requestTimeout });
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return { items: [] };
    }

    const items: LookupItem[] = identifiers
      .filter(({ name, symbol }) => {
        return (
          symbol?.toLowerCase().includes(normalizedQuery) ||
          name?.toLowerCase().includes(normalizedQuery)
        );
      })
      .map(({ name, symbol }) => {
        return {
          symbol,
          assetClass: AssetClass.EQUITY,
          assetSubClass: AssetSubClass.STOCK,
          currency: NGN_MARKET_CURRENCY,
          dataProviderInfo: this.getDataProviderInfo(),
          dataSource: this.getName(),
          name: name ?? symbol
        };
      });

    return { items };
  }

  private async getAssetProfileFromFreeEndpoints({
    requestTimeout,
    symbol
  }: {
    requestTimeout: number;
    symbol: string;
  }): Promise<Partial<SymbolProfile> | null> {
    const [companies, identifiers] = await Promise.all([
      this.getCompanies({ requestTimeout }),
      this.getIdentifiers({ requestTimeout })
    ]);

    const normalizedSymbol = symbol.toUpperCase();

    const company = companies.find(({ symbol: aSymbol }) => {
      return aSymbol?.toUpperCase() === normalizedSymbol;
    });

    const identifier = identifiers.find(({ symbol: aSymbol }) => {
      return aSymbol?.toUpperCase() === normalizedSymbol;
    });

    if (!company && !identifier) {
      return null;
    }

    return toAssetProfile({
      symbol,
      company: {
        ...company,
        international_sec_id: identifier?.international_sec_id ?? null,
        name: company?.name ?? identifier?.name
      } as NgnMarketCompanyDetail
    });
  }

  private async getCompanies({
    requestTimeout
  }: {
    requestTimeout: number;
  }): Promise<NgnMarketCompanyListItem[]> {
    const companies: NgnMarketCompanyListItem[] = [];

    for (let page = 1; page <= NgnMarketService.MAX_COMPANY_PAGES; page++) {
      const { data } = await this.ngnMarketApiService.request<
        NgnMarketCompanyListItem[]
      >({
        requestTimeout,
        path: '/companies',
        searchParams: {
          limit: `${NgnMarketService.COMPANIES_PAGE_SIZE}`,
          page: `${page}`
        }
      });

      const page_ = extractListPayload<NgnMarketCompanyListItem>(data);

      if (page_ === null) {
        this.logger.error(
          'Could not read a company list from /companies — the response shape is not recognised'
        );

        break;
      }

      if (page_.length === 0) {
        break;
      }

      companies.push(...page_);

      if (page_.length < NgnMarketService.COMPANIES_PAGE_SIZE) {
        break;
      }
    }

    return companies;
  }

  private async getCurrentForexRates({
    requestTimeout
  }: {
    requestTimeout: number;
  }): Promise<{ [currency: string]: number }> {
    const { data } =
      await this.ngnMarketApiService.request<NgnMarketForexCurrentResponse>({
        requestTimeout,
        path: '/forex/current'
      });

    return toNgnPerUnitRates(data);
  }

  private async getHistoricalForexRates({
    from,
    requestTimeout,
    symbol,
    to
  }: {
    from: Date;
    requestTimeout: number;
    symbol: string;
    to: Date;
  }): Promise<{ [date: string]: DataProviderHistoricalResponse }> {
    const { data } = await this.ngnMarketApiService.request<
      NgnMarketForexHistoryPoint[]
    >({
      requestTimeout,
      path: '/forex/history',
      searchParams: {
        from: format(from, DATE_FORMAT),
        source: getForeignCurrencyOfPair(symbol),
        target: NGN_MARKET_CURRENCY,
        to: format(to, DATE_FORMAT)
      }
    });

    const result: { [date: string]: DataProviderHistoricalResponse } = {};

    if (Array.isArray(data)) {
      for (const { date, rate } of data) {
        if (date && typeof rate === 'number' && isFinite(rate)) {
          result[date] = { marketPrice: rate };
        }
      }
    }

    return result;
  }

  private async getIdentifiers({
    requestTimeout
  }: {
    requestTimeout: number;
  }): Promise<NgnMarketIdentifier[]> {
    if (this.identifiersCache && this.identifiersCache.expiresAt > Date.now()) {
      return this.identifiersCache.items;
    }

    const { data } = await this.ngnMarketApiService.request<
      NgnMarketIdentifier[]
    >({
      requestTimeout,
      path: '/companies/identifiers'
    });

    if (!Array.isArray(data)) {
      return this.identifiersCache?.items ?? [];
    }

    this.identifiersCache = {
      expiresAt: Date.now() + NgnMarketService.IDENTIFIERS_CACHE_TTL,
      items: data
    };

    return data;
  }
}
