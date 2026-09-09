import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { NgxAnalyticsService } from '@ghostfolio/api/services/ngx-analytics/ngx-analytics.service';
import { NgxDigestService } from '@ghostfolio/api/services/ngx-notifications/ngx-digest.service';
import { NgxSignalsService } from '@ghostfolio/api/services/ngx-signals/ngx-signals.service';
import { permissions } from '@ghostfolio/common/permissions';

import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { GetNgxScreenerDto } from './get-ngx-screener.dto';
import { NgxScreenerService } from './ngx-screener.service';

@Controller('ngx-analytics')
@UseGuards(AuthGuard('jwt'), HasPermissionGuard)
export class NgxAnalyticsController {
  public constructor(
    private readonly ngxAnalyticsService: NgxAnalyticsService,
    private readonly ngxDigestService: NgxDigestService,
    private readonly ngxScreenerService: NgxScreenerService,
    private readonly ngxSignalsService: NgxSignalsService
  ) {}

  /**
   * Runs the same chain as the daily cron, on demand: capture, evaluate,
   * send. Exists so a failed or missed capture can be re-run without waiting
   * for the next close — the capture is idempotent, so repeating it for a
   * date updates rather than duplicates.
   */
  @HasPermission(permissions.accessAdminControl)
  @Post('capture')
  public async captureNow() {
    const capture = await this.ngxAnalyticsService.captureDailySnapshot();

    if (capture.skipped || !capture.date) {
      return { capture, evaluation: null, digestSent: false };
    }

    const evaluation = await this.ngxSignalsService.evaluate({
      date: capture.date
    });

    const digestSent = evaluation.date
      ? await this.ngxDigestService.sendDigestForDate(evaluation.date)
      : false;

    return { capture, digestSent, evaluation };
  }

  @Get('breadth')
  public async getBreadth(@Query() { days }: GetNgxScreenerDto) {
    return this.ngxScreenerService.getBreadth({ days });
  }

  @Get('movers')
  public async getMovers(@Query() { days, limit }: GetNgxScreenerDto) {
    return this.ngxScreenerService.getMovers({ days, limit });
  }

  @Get('sectors')
  public async getSectorPerformance(@Query() { days }: GetNgxScreenerDto) {
    return this.ngxScreenerService.getSectorPerformance({ days });
  }

  @Get('symbols/:symbol')
  public async getSymbolHistory(
    @Param('symbol') symbol: string,
    @Query() { days }: GetNgxScreenerDto
  ) {
    return this.ngxScreenerService.getSymbolHistory({ days, symbol });
  }
}
