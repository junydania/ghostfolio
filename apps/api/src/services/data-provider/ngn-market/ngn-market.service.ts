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
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse,
  LookupItem,
  LookupResponse
} from '@ghostfolio/common/interfaces';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  NgnMarketIdentifier,
  NgnMarketResponse
} from './interfaces/interfaces';
import {
  NGN_MARKET_CURRENCY,
  getForeignCurrencyOfPair,
  isNgnCurrencyPair,
  isRangeClamped,
  parseChartResponse,
  toAssetProfile,
  toNgnPerUnitRates,
  toQuote
} from './ngn-market.mapper';

interface NgnMarketRequestResult<T> {
  data: T | null;
  isNotFound: boolean;
}

@Injectable()
export class NgnMarketService implements DataProviderInterface, OnModuleInit {
  private static readonly BASE_URL = 'https://api.ngnmarket.com/v1';
  private static readonly COMPANIES_PAGE_SIZE = 200;
  private static readonly IDENTIFIERS_CACHE_TTL = 24 * 60 * 60 * 1000;
  private static readonly MAX_COMPANY_PAGES = 5;
  private static readonly QUOTA_WARNING_RATIO = 0.1;

  private readonly logger = new Logger(NgnMarketService.name);

  private apiKey: string;
  private hasLoggedAuthenticationError = false;
  private identifiersCache: {
    expiresAt: number;
    items: NgnMarketIdentifier[];
  } | null = null;

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService
  ) {}

  public onModuleInit() {
    this.apiKey = this.configurationService.get('API_KEY_NGN_MARKET');
  }

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
      await this.request<NgnMarketCompanyDetail>({
        requestTimeout,
        path: `/companies/${encodeURIComponent(symbol)}`
      });

    if (isNotFound) {
      throw new AssetProfileDelistedError(
        `No data found, ${symbol} (${this.getName()}) may be delisted`
      );
    }

    if (!company) {
      // A transient failure must not be reported as delisted: the data
      // gathering processor deactivates the symbol profile when it is.
      throw new Error(
        `Could not get asset profile for ${symbol} (${this.getName()})`
      );
    }

    return toAssetProfile({ company, symbol });
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

    const { data: response } = await this.request<NgnMarketChartResponse>({
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

  private async getCompanies({
    requestTimeout
  }: {
    requestTimeout: number;
  }): Promise<NgnMarketCompanyListItem[]> {
    const companies: NgnMarketCompanyListItem[] = [];

    for (let page = 1; page <= NgnMarketService.MAX_COMPANY_PAGES; page++) {
      const { data } = await this.request<NgnMarketCompanyListItem[]>({
        requestTimeout,
        path: '/companies',
        searchParams: {
          limit: `${NgnMarketService.COMPANIES_PAGE_SIZE}`,
          page: `${page}`
        }
      });

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      companies.push(...data);

      if (data.length < NgnMarketService.COMPANIES_PAGE_SIZE) {
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
    const { data } = await this.request<NgnMarketForexCurrentResponse>({
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
    const { data } = await this.request<NgnMarketForexHistoryPoint[]>({
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

    const { data } = await this.request<NgnMarketIdentifier[]>({
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

  /**
   * Every failure degrades to null rather than throwing: portfolio snapshots
   * span all data providers, so an NGN Market outage must not take unrelated
   * holdings down with it.
   */
  private async request<T>({
    path,
    requestTimeout,
    searchParams = {}
  }: {
    path: string;
    requestTimeout: number;
    searchParams?: { [key: string]: string };
  }): Promise<NgnMarketRequestResult<T>> {
    if (!this.apiKey) {
      this.logAuthenticationErrorOnce(
        'API_KEY_NGN_MARKET is not set, skipping request'
      );

      return { data: null, isNotFound: false };
    }

    const queryParams = new URLSearchParams(searchParams).toString();
    const url = `${NgnMarketService.BASE_URL}${path}${
      queryParams ? `?${queryParams}` : ''
    }`;

    try {
      const response = await this.fetchService.fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(requestTimeout)
      });

      if (response.status === 401 || response.status === 403) {
        this.logAuthenticationErrorOnce(
          `${path} returned ${response.status} — check API_KEY_NGN_MARKET and your plan`
        );

        return { data: null, isNotFound: false };
      }

      if (response.status === 429) {
        this.logger.error(
          `${path} was rate limited or the monthly quota is exhausted${
            response.headers.get('Retry-After')
              ? `, retry after ${response.headers.get('Retry-After')}s`
              : ''
          }`
        );

        return { data: null, isNotFound: false };
      }

      // Only an explicit 404 means the symbol does not exist. Every other
      // failure must stay distinguishable, because callers translate
      // not-found into AssetProfileDelistedError, which deactivates the
      // symbol profile.
      if (response.status === 404) {
        return { data: null, isNotFound: true };
      }

      const json = (await response.json()) as NgnMarketResponse<T>;

      this.warnOnLowQuota(json);

      if (!json?.success) {
        this.logger.error(
          `${path} failed: ${json?.error?.code ?? 'UNKNOWN'} ${
            json?.error?.message ?? ''
          }`.trim()
        );

        return {
          data: null,
          isNotFound: json?.error?.code === 'NOT_FOUND'
        };
      }

      return { data: json.data, isNotFound: false };
    } catch (error) {
      this.logger.error(`${path} failed: ${error?.message ?? error}`);

      return { data: null, isNotFound: false };
    }
  }

  private logAuthenticationErrorOnce(message: string) {
    if (this.hasLoggedAuthenticationError) {
      return;
    }

    this.hasLoggedAuthenticationError = true;

    this.logger.error(message);
  }

  private warnOnLowQuota(response: Pick<NgnMarketResponse<unknown>, 'meta'>) {
    const { calls_limit, calls_remaining } = response?.meta ?? {};

    if (
      typeof calls_limit === 'number' &&
      typeof calls_remaining === 'number' &&
      calls_limit > 0 &&
      calls_remaining / calls_limit < NgnMarketService.QUOTA_WARNING_RATIO
    ) {
      this.logger.warn(
        `Only ${calls_remaining} of ${calls_limit} NGN Market API calls remain this period`
      );
    }
  }
}
