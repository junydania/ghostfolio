import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { resetHours } from '@ghostfolio/common/helper';

import { Injectable } from '@nestjs/common';
import { subDays } from 'date-fns';

import {
  NgxBreadthPoint,
  NgxPeriodPerformance,
  NgxSectorPerformance,
  NgxSymbolHistory,
  computePeriodPerformances,
  computeSectorPerformances,
  rankMovers,
  toBreadthSeries,
  toSymbolHistory
} from './ngx-analytics.calculator';

export const NGX_SCREENER_DEFAULT_DAYS = 30;
export const NGX_SCREENER_DEFAULT_LIMIT = 10;

/**
 * Read side of the NGX analytics store. Every figure is derived from the daily
 * capture, never from a live NGN Market call, so screening costs no API quota.
 */
@Injectable()
export class NgxScreenerService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async getBreadth({
    days = NGX_SCREENER_DEFAULT_DAYS
  }: {
    days?: number;
  }): Promise<{ breadth: NgxBreadthPoint[] }> {
    const snapshots = await this.prismaService.ngxMarketSnapshot.findMany({
      orderBy: { date: 'asc' },
      where: { date: { gte: getStartDate(days) } }
    });

    return { breadth: toBreadthSeries(snapshots) };
  }

  public async getMovers({
    days = NGX_SCREENER_DEFAULT_DAYS,
    limit = NGX_SCREENER_DEFAULT_LIMIT
  }: {
    days?: number;
    limit?: number;
  }): Promise<{
    days: number;
    gainers: NgxPeriodPerformance[];
    losers: NgxPeriodPerformance[];
  }> {
    const performances = computePeriodPerformances(
      await this.getCompanySnapshots({ days })
    );

    return { days, ...rankMovers({ limit, performances }) };
  }

  public async getSectorPerformance({
    days = NGX_SCREENER_DEFAULT_DAYS
  }: {
    days?: number;
  }): Promise<{ days: number; sectors: NgxSectorPerformance[] }> {
    const performances = computePeriodPerformances(
      await this.getCompanySnapshots({ days })
    );

    return { days, sectors: computeSectorPerformances(performances) };
  }

  public async getSymbolHistory({
    days = NGX_SCREENER_DEFAULT_DAYS,
    symbol
  }: {
    days?: number;
    symbol: string;
  }): Promise<NgxSymbolHistory> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    const rows = await this.prismaService.ngxCompanySnapshot.findMany({
      orderBy: { date: 'asc' },
      select: {
        date: true,
        marketCap: true,
        price: true,
        sector: true,
        symbol: true,
        volume: true
      },
      where: {
        symbol: normalizedSymbol,
        date: { gte: getStartDate(days) }
      }
    });

    return toSymbolHistory({ rows, symbol: normalizedSymbol });
  }

  private getCompanySnapshots({ days }: { days: number }) {
    return this.prismaService.ngxCompanySnapshot.findMany({
      orderBy: { date: 'asc' },
      select: {
        date: true,
        marketCap: true,
        price: true,
        sector: true,
        symbol: true,
        volume: true
      },
      where: { date: { gte: getStartDate(days) } }
    });
  }
}

function getStartDate(days: number) {
  return resetHours(subDays(new Date(), days));
}
