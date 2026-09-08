import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { NgxSignalDirection } from '@prisma/client';

import { NgxDigestSignal } from './interfaces/interfaces';
import { NgxNotificationService } from './ngx-notification.service';

@Injectable()
export class NgxDigestService {
  public constructor(
    private readonly ngxNotificationService: NgxNotificationService,
    private readonly prismaService: PrismaService
  ) {}

  /**
   * Reads the signals and market context for a trading date and sends the
   * daily digest. Reads the tables directly rather than depending on the
   * signals module, so a change to that module's API cannot break delivery.
   */
  public async sendDigestForDate(date: Date): Promise<boolean> {
    if (!this.ngxNotificationService.isConfigured()) {
      return false;
    }

    const [signals, market] = await Promise.all([
      this.prismaService.ngxSignal.findMany({
        orderBy: [{ score: 'desc' }],
        where: { date }
      }),
      this.prismaService.ngxMarketSnapshot.findUnique({ where: { date } })
    ]);

    const digestSignals: NgxDigestSignal[] = signals.map(
      ({ direction, rationale, score, symbol, type }) => {
        return {
          score,
          symbol,
          type,
          direction: direction as NgxSignalDirection,
          rationale: (rationale ?? null) as Record<string, unknown> | null
        };
      }
    );

    return this.ngxNotificationService.sendDailyDigest({
      date,
      market: market
        ? {
            advDecRatio: market.advDecRatio,
            asi: market.asi,
            asiChangePercent: market.asiChangePercent
          }
        : null,
      signals: digestSignals
    });
  }
}
