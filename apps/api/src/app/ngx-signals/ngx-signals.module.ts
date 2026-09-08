import { NgxSignalsModule as NgxSignalsServiceModule } from '@ghostfolio/api/services/ngx-signals/ngx-signals.module';

import { Module } from '@nestjs/common';

import { NgxSignalsController } from './ngx-signals.controller';

@Module({
  controllers: [NgxSignalsController],
  imports: [NgxSignalsServiceModule]
})
export class NgxSignalsApiModule {}
