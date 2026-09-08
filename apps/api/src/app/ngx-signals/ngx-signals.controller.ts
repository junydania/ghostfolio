import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { NgxSignalRationale } from '@ghostfolio/api/services/ngx-signals/interfaces/interfaces';
import { NgxSignalsService } from '@ghostfolio/api/services/ngx-signals/ngx-signals.service';
import { DATE_FORMAT } from '@ghostfolio/common/helper';

import { utc } from '@date-fns/utc';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NgxSignal } from '@prisma/client';
import { format } from 'date-fns';

import { GetNgxSignalHistoryDto } from './get-ngx-signal-history.dto';
import { GetNgxSignalsDto } from './get-ngx-signals.dto';
import {
  NgxSignalHistoryResponse,
  NgxSignalItem,
  NgxSignalsResponse
} from './interfaces/interfaces';

@Controller('ngx-signals')
export class NgxSignalsController {
  public constructor(private readonly ngxSignalsService: NgxSignalsService) {}

  /**
   * The most recent evaluated trading day, filterable by direction, symbol and
   * rule. Ordered by score, strongest buy-side evidence first.
   */
  @Get()
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getSignals(
    @Query() { direction, symbol, take, type }: GetNgxSignalsDto
  ): Promise<NgxSignalsResponse> {
    const signals = await this.ngxSignalsService.getLatestSignals({
      direction,
      symbol,
      take,
      type
    });

    return { signals: signals.map(toNgxSignalItem) };
  }

  /**
   * Must be after the collection route.
   */
  @Get(':symbol')
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getSignalHistory(
    @Param('symbol') symbol: string,
    @Query() { take, type }: GetNgxSignalHistoryDto
  ): Promise<NgxSignalHistoryResponse> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    const signals = await this.ngxSignalsService.getSignalHistory({
      take,
      type,
      symbol: normalizedSymbol
    });

    return { signals: signals.map(toNgxSignalItem), symbol: normalizedSymbol };
  }
}

function toNgxSignalItem({
  date,
  direction,
  rationale,
  score,
  symbol,
  type
}: NgxSignal): NgxSignalItem {
  return {
    direction,
    score,
    symbol,
    type,
    date: format(date, DATE_FORMAT, { in: utc }),
    rationale: (rationale as unknown as NgxSignalRationale) ?? null
  };
}
