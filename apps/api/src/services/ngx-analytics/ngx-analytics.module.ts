import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { NgxAnalyticsService } from './ngx-analytics.service';

@Module({
  exports: [NgxAnalyticsService],
  imports: [ConfigurationModule, DataProviderModule, PrismaModule],
  providers: [NgxAnalyticsService]
})
export class NgxAnalyticsModule {}
