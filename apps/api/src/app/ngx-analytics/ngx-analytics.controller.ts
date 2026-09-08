import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { GetNgxScreenerDto } from './get-ngx-screener.dto';
import { NgxScreenerService } from './ngx-screener.service';

@Controller('ngx-analytics')
@UseGuards(AuthGuard('jwt'), HasPermissionGuard)
export class NgxAnalyticsController {
  public constructor(private readonly ngxScreenerService: NgxScreenerService) {}

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
