import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { NgnMarketResponse } from './interfaces/interfaces';

export interface NgnMarketApiResult<T> {
  data: T | null;
  isNotFound: boolean;
}

/**
 * The single place NGN Market HTTP calls are made. Extracted from
 * NgnMarketService so that the market analytics capture can share the same
 * envelope handling, quota telemetry and — most importantly — the same error
 * semantics.
 */
@Injectable()
export class NgnMarketApiService implements OnModuleInit {
  private static readonly BASE_URL = 'https://api.ngnmarket.com/v1';
  private static readonly QUOTA_WARNING_RATIO = 0.1;

  private readonly logger = new Logger(NgnMarketApiService.name);

  private apiKey: string;
  private hasLoggedAuthenticationError = false;

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService
  ) {}

  public onModuleInit() {
    this.apiKey = this.configurationService.get('API_KEY_NGN_MARKET');
  }

  public hasApiKey() {
    return Boolean(this.apiKey);
  }

  /**
   * Every failure degrades to null rather than throwing: portfolio snapshots
   * span all data providers, so an NGN Market outage must not take unrelated
   * holdings down with it.
   */
  public async request<T>({
    path,
    requestTimeout,
    searchParams = {}
  }: {
    path: string;
    requestTimeout: number;
    searchParams?: { [key: string]: string };
  }): Promise<NgnMarketApiResult<T>> {
    if (!this.apiKey) {
      this.logAuthenticationErrorOnce(
        'API_KEY_NGN_MARKET is not set, skipping request'
      );

      return { data: null, isNotFound: false };
    }

    const queryParams = new URLSearchParams(searchParams).toString();
    const url = `${NgnMarketApiService.BASE_URL}${path}${
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
      calls_remaining / calls_limit < NgnMarketApiService.QUOTA_WARNING_RATIO
    ) {
      this.logger.warn(
        `Only ${calls_remaining} of ${calls_limit} NGN Market API calls remain this period`
      );
    }
  }
}
