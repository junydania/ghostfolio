import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { NgxSignalsService } from './ngx-signals.service';

@Module({
  exports: [NgxSignalsService],
  imports: [PrismaModule],
  providers: [NgxSignalsService]
})
export class NgxSignalsModule {}
