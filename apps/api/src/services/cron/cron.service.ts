import { UserService } from '@ghostfolio/api/app/user/user.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { NgxAnalyticsService } from '@ghostfolio/api/services/ngx-analytics/ngx-analytics.service';
import { NgxDigestService } from '@ghostfolio/api/services/ngx-notifications/ngx-digest.service';
import { NgxSignalsService } from '@ghostfolio/api/services/ngx-signals/ngx-signals.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { StatisticsGatheringService } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.service';
import { TwitterBotService } from '@ghostfolio/api/services/twitter-bot/twitter-bot.service';
import {
  DATA_GATHERING_QUEUE_PRIORITY_LOW,
  GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
  GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
  PROPERTY_IS_DATA_GATHERING_ENABLED
} from '@ghostfolio/common/config';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronService {
  private static readonly EVERY_HOUR_AT_RANDOM_MINUTE = `${new Date().getMinutes()} * * * *`;
  // NGX closes at 16:00 WAT; capturing an hour later leaves room for the
  // exchange's own end-of-day settling before the cross-section is stored
  private static readonly EVERY_TRADING_DAY_AFTER_NGX_CLOSE = '0 17 * * 1-5';
  private static readonly EVERY_SUNDAY_AT_LUNCH_TIME = '0 12 * * 0';

  private readonly logger = new Logger(CronService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly ngxAnalyticsService: NgxAnalyticsService,
    private readonly ngxDigestService: NgxDigestService,
    private readonly ngxSignalsService: NgxSignalsService,
    private readonly propertyService: PropertyService,
    private readonly statisticsGatheringService: StatisticsGatheringService,
    private readonly twitterBotService: TwitterBotService,
    private readonly userService: UserService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  public async runEveryHour() {
    if (this.configurationService.get('ENABLE_FEATURE_STATISTICS')) {
      await this.statisticsGatheringService.addJobsToQueue();
    }
  }

  @Cron(CronService.EVERY_HOUR_AT_RANDOM_MINUTE)
  public async runEveryHourAtRandomMinute() {
    if (await this.isDataGatheringEnabled()) {
      await this.dataGatheringService.gatherHourlyMarketData();
      await this.dataGatheringService.gatherRecentMarketData();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  public async runEveryDayAtFivePm() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.twitterBotService.tweetFearAndGreedIndex();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async runEveryDayAtMidnight() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.userService.resetAnalytics();
    }
  }

  @Cron(CronService.EVERY_TRADING_DAY_AFTER_NGX_CLOSE, {
    timeZone: 'Africa/Lagos'
  })
  public async runEveryTradingDayAfterNgxClose() {
    // Without a key the capture cannot reach NGN Market, so the job is inert
    // rather than a source of daily error logs
    if (!this.configurationService.get('API_KEY_NGN_MARKET')) {
      return;
    }

    try {
      // The three stages are strictly ordered and each depends on the one
      // before it: signals are computed from the captured cross-section, and
      // the digest reports the signals. A failure part-way through stops the
      // chain rather than sending a digest built on stale or missing data.
      const { date, skipped } =
        await this.ngxAnalyticsService.captureDailySnapshot();

      if (skipped || !date) {
        return;
      }

      const { date: evaluatedDate } = await this.ngxSignalsService.evaluate({
        date
      });

      if (!evaluatedDate) {
        return;
      }

      await this.ngxDigestService.sendDigestForDate(evaluatedDate);
    } catch (error) {
      // A background job must never take the process down with it: an
      // unhandled rejection here would be fatal under Node's default policy
      this.logger.error(
        `The NGX daily job failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  @Cron(CronService.EVERY_SUNDAY_AT_LUNCH_TIME)
  public async runEverySundayAtTwelvePm() {
    if (await this.isDataGatheringEnabled()) {
      const assetProfileIdentifiers =
        await this.dataGatheringService.getActiveAssetProfileIdentifiers({
          maxAge: '60 days'
        });

      await this.dataGatheringService.addJobsToQueue(
        assetProfileIdentifiers.map(({ dataSource, symbol }) => {
          return {
            data: {
              dataSource,
              symbol
            },
            name: GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
            opts: {
              ...GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
              jobId: getAssetProfileIdentifier({ dataSource, symbol }),
              priority: DATA_GATHERING_QUEUE_PRIORITY_LOW
            }
          };
        })
      );
    }
  }

  private async isDataGatheringEnabled() {
    return (await this.propertyService.getByKey(
      PROPERTY_IS_DATA_GATHERING_ENABLED
    )) === false
      ? false
      : true;
  }
}
