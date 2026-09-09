import { NgxAnalyticsModule } from '@ghostfolio/api/services/ngx-analytics/ngx-analytics.module';
import { NgxNotificationModule } from '@ghostfolio/api/services/ngx-notifications/ngx-notification.module';
import { NgxSignalsModule } from '@ghostfolio/api/services/ngx-signals/ngx-signals.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { NgxAnalyticsController } from './ngx-analytics.controller';
import { NgxScreenerService } from './ngx-screener.service';

@Module({
  controllers: [NgxAnalyticsController],
  exports: [NgxScreenerService],
  imports: [
    NgxAnalyticsModule,
    NgxNotificationModule,
    NgxSignalsModule,
    PrismaModule
  ],
  providers: [NgxScreenerService]
})
export class NgxAnalyticsApiModule {}
