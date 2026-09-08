import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { FetchModule } from '@ghostfolio/api/services/fetch/fetch.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { NgxDigestService } from './ngx-digest.service';
import { NgxNotificationService } from './ngx-notification.service';

@Module({
  exports: [NgxDigestService, NgxNotificationService],
  imports: [ConfigurationModule, FetchModule, PrismaModule],
  providers: [NgxDigestService, NgxNotificationService]
})
export class NgxNotificationModule {}
