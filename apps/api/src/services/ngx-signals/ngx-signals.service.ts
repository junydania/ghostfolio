import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, Logger } from '@nestjs/common';
import { NgxSignal, NgxSignalDirection, Prisma } from '@prisma/client';
import { subDays } from 'date-fns';

import { NgxSignalsEvaluationResult } from './interfaces/interfaces';
import {
  NGX_SIGNALS_HISTORY_WINDOW_IN_DAYS,
  NGX_SIGNAL_TYPE_VALUES
} from './ngx-signals.constants';
import { evaluateSignals } from './ngx-signals.engine';

const DEFAULT_TAKE = 100;
const MAXIMUM_TAKE = 500;

@Injectable()
export class NgxSignalsService {
  private readonly logger = new Logger(NgxSignalsService.name);

  public constructor(private readonly prismaService: PrismaService) {}

  /**
   * Evaluates one trading day and persists the result.
   *
   * Idempotent on [date, symbol, type]: re-running for a date that has already
   * been evaluated updates the signals it still supports and removes the ones
   * it no longer does, so a corrected snapshot cannot leave a stale BUY behind.
   *
   * @param date the day to evaluate; defaults to the most recent captured day
   */
  public async evaluate({
    date
  }: { date?: Date } = {}): Promise<NgxSignalsEvaluationResult> {
    const evaluationDate = await this.resolveEvaluationDate(date);

    if (!evaluationDate) {
      this.logger.warn(
        'No NGX company snapshots available, skipping signal evaluation',
        'NgxSignalsService'
      );

      return {
        createdOrUpdated: 0,
        date: null,
        deleted: 0,
        regime: 'UNKNOWN',
        symbolsEvaluated: 0
      };
    }

    const from = subDays(evaluationDate, NGX_SIGNALS_HISTORY_WINDOW_IN_DAYS);

    const [companySnapshots, marketSnapshots] = await Promise.all([
      this.prismaService.ngxCompanySnapshot.findMany({
        orderBy: { date: 'asc' },
        where: { date: { gte: from, lte: evaluationDate } }
      }),
      this.prismaService.ngxMarketSnapshot.findMany({
        orderBy: { date: 'asc' },
        where: { date: { gte: from, lte: evaluationDate } }
      })
    ]);

    const { candidates, regime, symbolsEvaluated } = evaluateSignals({
      companySnapshots,
      marketSnapshots,
      date: evaluationDate
    });

    const staleSignalIds = await this.getStaleSignalIds({
      candidates,
      date: evaluationDate
    });

    const operations: Prisma.PrismaPromise<unknown>[] = candidates.map(
      ({ direction, rationale, score, symbol, type }) => {
        const data = {
          direction,
          score,
          symbol,
          type,
          date: evaluationDate,
          rationale: rationale as unknown as Prisma.InputJsonValue
        };

        return this.prismaService.ngxSignal.upsert({
          create: data,
          update: data,
          where: {
            date_symbol_type: { symbol, type, date: evaluationDate }
          }
        });
      }
    );

    if (staleSignalIds.length > 0) {
      operations.push(
        this.prismaService.ngxSignal.deleteMany({
          where: { id: { in: staleSignalIds } }
        })
      );
    }

    await this.prismaService.$transaction(operations);

    this.logger.log(
      `Evaluated ${symbolsEvaluated} symbols in a ${regime.regime} market and stored ${candidates.length} signals`,
      'NgxSignalsService'
    );

    return {
      symbolsEvaluated,
      createdOrUpdated: candidates.length,
      date: evaluationDate,
      deleted: staleSignalIds.length,
      regime: regime.regime
    };
  }

  /**
   * The signals of the most recent evaluated day matching the filters. Ordered
   * by score, so the strongest buy-side evidence comes first.
   */
  public async getLatestSignals({
    direction,
    symbol,
    take = DEFAULT_TAKE,
    type
  }: {
    direction?: NgxSignalDirection;
    symbol?: string;
    take?: number;
    type?: string;
  } = {}): Promise<NgxSignal[]> {
    const where = this.buildWhere({ direction, symbol, type });

    const latest = await this.prismaService.ngxSignal.findFirst({
      where,
      orderBy: { date: 'desc' },
      select: { date: true }
    });

    if (!latest) {
      return [];
    }

    return this.prismaService.ngxSignal.findMany({
      orderBy: [{ score: 'desc' }, { symbol: 'asc' }, { type: 'asc' }],
      take: this.normalizeTake(take),
      where: { ...where, date: latest.date }
    });
  }

  /**
   * Every signal recorded for one symbol, newest first, so a direction that
   * flipped over time is visible rather than overwritten.
   */
  public async getSignalHistory({
    symbol,
    take = DEFAULT_TAKE,
    type
  }: {
    symbol: string;
    take?: number;
    type?: string;
  }): Promise<NgxSignal[]> {
    return this.prismaService.ngxSignal.findMany({
      orderBy: [{ date: 'desc' }, { type: 'asc' }],
      take: this.normalizeTake(take),
      where: this.buildWhere({ symbol, type })
    });
  }

  private buildWhere({
    direction,
    symbol,
    type
  }: {
    direction?: NgxSignalDirection;
    symbol?: string;
    type?: string;
  }): Prisma.NgxSignalWhereInput {
    return {
      ...(direction ? { direction } : {}),
      ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
      ...(type && NGX_SIGNAL_TYPE_VALUES.includes(type) ? { type } : {})
    };
  }

  /**
   * Signals stored for the date whose rule no longer produces them. Removing
   * these is what makes a re-evaluation a replacement rather than an append.
   */
  private async getStaleSignalIds({
    candidates,
    date
  }: {
    candidates: { symbol: string; type: string }[];
    date: Date;
  }): Promise<string[]> {
    const existing = await this.prismaService.ngxSignal.findMany({
      select: { id: true, symbol: true, type: true },
      where: { date }
    });

    const produced = new Set(
      candidates.map(({ symbol, type }) => {
        return `${symbol}|${type}`;
      })
    );

    return existing
      .filter(({ symbol, type }) => {
        return !produced.has(`${symbol}|${type}`);
      })
      .map(({ id }) => {
        return id;
      });
  }

  private normalizeTake(take: number): number {
    if (!Number.isFinite(take) || take <= 0) {
      return DEFAULT_TAKE;
    }

    return Math.min(Math.floor(take), MAXIMUM_TAKE);
  }

  /**
   * Signals are stamped with the exact date of the snapshot they were derived
   * from, so that `NgxSignal.date` always joins cleanly against
   * `NgxCompanySnapshot.date`.
   */
  private async resolveEvaluationDate(date?: Date): Promise<Date | null> {
    const snapshot = await this.prismaService.ngxCompanySnapshot.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
      where: date ? { date: { lte: date } } : {}
    });

    return snapshot?.date ?? null;
  }
}
