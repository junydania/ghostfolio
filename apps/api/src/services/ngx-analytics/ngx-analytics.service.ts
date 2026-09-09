import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import {
  NgnMarketCompanyListItem,
  NgnMarketSnapshotResponse
} from '@ghostfolio/api/services/data-provider/ngn-market/interfaces/interfaces';
import { NgnMarketApiService } from '@ghostfolio/api/services/data-provider/ngn-market/ngn-market-api.service';
import { extractListPayload } from '@ghostfolio/api/services/data-provider/ngn-market/ngn-market.mapper';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { DATE_FORMAT } from '@ghostfolio/common/helper';

import { Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';

import {
  NgxCompanySnapshotRow,
  resolveTradingDate,
  toCompanySnapshotRows,
  toMarketSnapshotRow
} from './ngx-analytics.mapper';

export interface NgxAnalyticsCaptureResult {
  apiCalls: number;
  companiesCaptured: number;
  date: Date | null;
  hasMarketSnapshot: boolean;
  skipped: boolean;
}

/**
 * Ghostfolio's MarketData table only holds what a user owns or watches. The
 * daily capture stores an exchange-wide cross-section instead, so signals have
 * history to reason over.
 */
@Injectable()
export class NgxAnalyticsService {
  private static readonly COMPANIES_PAGE_SIZE = 200;

  /**
   * The Hobby plan allows 10,000 calls a month. Two pages cover the ~150 NGX
   * listings with headroom and cap a run at three calls including the market
   * snapshot, which is roughly 60 calls a month.
   */
  private static readonly MAX_COMPANY_PAGES = 2;

  private static readonly UPSERT_CHUNK_SIZE = 25;

  private readonly logger = new Logger(NgxAnalyticsService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly ngnMarketApiService: NgnMarketApiService,
    private readonly prismaService: PrismaService
  ) {}

  /**
   * Idempotent by construction: rows are keyed by trading date, so re-running
   * for the same session updates in place rather than duplicating.
   */
  public async captureDailySnapshot({
    date: requestedDate
  }: {
    date?: Date;
  } = {}): Promise<NgxAnalyticsCaptureResult> {
    if (!this.ngnMarketApiService.hasApiKey()) {
      this.logger.log(
        'API_KEY_NGN_MARKET is not set, skipping the NGX daily capture'
      );

      return {
        apiCalls: 0,
        companiesCaptured: 0,
        date: null,
        hasMarketSnapshot: false,
        skipped: true
      };
    }

    const requestTimeout = this.configurationService.get('REQUEST_TIMEOUT');

    const { apiCalls: snapshotCalls, snapshot } =
      await this.fetchMarketSnapshot({ requestedDate, requestTimeout });

    const { apiCalls: companyCalls, companies } = await this.fetchCompanies({
      requestTimeout
    });

    const apiCalls = snapshotCalls + companyCalls;

    if (!snapshot && companies.length === 0) {
      this.logger.warn(
        'The NGX daily capture returned no data, nothing was stored'
      );

      return {
        apiCalls,
        companiesCaptured: 0,
        date: null,
        hasMarketSnapshot: false,
        skipped: false
      };
    }

    const date = resolveTradingDate({
      companies,
      snapshot,
      fallbackDate: requestedDate ?? new Date()
    });

    const rows = toCompanySnapshotRows({ companies, date });

    await this.upsertCompanySnapshots(rows);

    if (snapshot) {
      await this.upsertMarketSnapshot(toMarketSnapshotRow({ date, snapshot }));
    }

    this.logger.log(
      `Captured ${rows.length} NGX company snapshots for ${format(
        date,
        DATE_FORMAT
      )} in ${apiCalls} API call(s)`
    );

    return {
      apiCalls,
      date,
      companiesCaptured: rows.length,
      hasMarketSnapshot: Boolean(snapshot),
      skipped: false
    };
  }

  private async fetchCompanies({
    requestTimeout
  }: {
    requestTimeout: number;
  }): Promise<{ apiCalls: number; companies: NgnMarketCompanyListItem[] }> {
    const companies: NgnMarketCompanyListItem[] = [];
    let apiCalls = 0;

    for (let page = 1; page <= NgxAnalyticsService.MAX_COMPANY_PAGES; page++) {
      const { data } = await this.ngnMarketApiService.request<
        NgnMarketCompanyListItem[]
      >({
        requestTimeout,
        path: '/companies',
        searchParams: {
          limit: `${NgxAnalyticsService.COMPANIES_PAGE_SIZE}`,
          page: `${page}`
        }
      });

      apiCalls += 1;

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

      if (page_.length < NgxAnalyticsService.COMPANIES_PAGE_SIZE) {
        break;
      }
    }

    return { apiCalls, companies };
  }

  private async fetchMarketSnapshot({
    requestedDate,
    requestTimeout
  }: {
    requestedDate?: Date;
    requestTimeout: number;
  }): Promise<{
    apiCalls: number;
    snapshot: NgnMarketSnapshotResponse | null;
  }> {
    const { data } =
      await this.ngnMarketApiService.request<NgnMarketSnapshotResponse>({
        requestTimeout,
        path: '/market/snapshot',
        searchParams: requestedDate
          ? { date: format(requestedDate, DATE_FORMAT) }
          : {}
      });

    return { apiCalls: 1, snapshot: data };
  }

  private async upsertCompanySnapshots(rows: NgxCompanySnapshotRow[]) {
    for (
      let index = 0;
      index < rows.length;
      index += NgxAnalyticsService.UPSERT_CHUNK_SIZE
    ) {
      const chunk = rows.slice(
        index,
        index + NgxAnalyticsService.UPSERT_CHUNK_SIZE
      );

      await this.prismaService.$transaction(
        chunk.map(({ date, symbol, ...values }) => {
          return this.prismaService.ngxCompanySnapshot.upsert({
            create: { date, symbol, ...values },
            update: values,
            where: { date_symbol: { date, symbol } }
          });
        })
      );
    }
  }

  private async upsertMarketSnapshot({
    date,
    ...values
  }: ReturnType<typeof toMarketSnapshotRow>) {
    await this.prismaService.ngxMarketSnapshot.upsert({
      create: { date, ...values },
      update: values,
      where: { date }
    });
  }
}
