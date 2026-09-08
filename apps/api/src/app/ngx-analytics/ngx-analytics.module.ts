import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { NgxAnalyticsController } from './ngx-analytics.controller';
import { NgxScreenerService } from './ngx-screener.service';

@Module({
  controllers: [NgxAnalyticsController],
  exports: [NgxScreenerService],
  imports: [PrismaModule],
  providers: [NgxScreenerService]
})
export class NgxAnalyticsApiModule {}
