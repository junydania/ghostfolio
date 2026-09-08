import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { NgxSignalDirection } from '@prisma/client';
import { Observable } from 'rxjs';

import {
  NgxBreadthResponse,
  NgxMoversResponse,
  NgxSectorsResponse,
  NgxSignalHistoryResponse,
  NgxSignalsResponse,
  NgxSymbolHistoryResponse
} from './interfaces/interfaces';

/**
 * Read access to the NGX signals and analytics endpoints. Every route reads
 * the stored daily capture, so nothing here consumes market data provider
 * quota.
 */
@Service()
export class NgxService {
  private readonly http = inject(HttpClient);

  public fetchBreadth({ days }: { days?: number } = {}) {
    return this.http.get<NgxBreadthResponse>('/api/v1/ngx-analytics/breadth', {
      params: this.buildParams({ days })
    });
  }

  public fetchMovers({ days, limit }: { days?: number; limit?: number } = {}) {
    return this.http.get<NgxMoversResponse>('/api/v1/ngx-analytics/movers', {
      params: this.buildParams({ days, limit })
    });
  }

  public fetchSectors({ days }: { days?: number } = {}) {
    return this.http.get<NgxSectorsResponse>('/api/v1/ngx-analytics/sectors', {
      params: this.buildParams({ days })
    });
  }

  /**
   * The signals of the most recently evaluated trading day.
   */
  public fetchSignals({
    direction,
    symbol,
    take,
    type
  }: {
    direction?: NgxSignalDirection;
    symbol?: string;
    take?: number;
    type?: string;
  } = {}) {
    return this.http.get<NgxSignalsResponse>('/api/v1/ngx-signals', {
      params: this.buildParams({ direction, symbol, take, type })
    });
  }

  public fetchSignalHistory({
    symbol,
    take,
    type
  }: {
    symbol: string;
    take?: number;
    type?: string;
  }): Observable<NgxSignalHistoryResponse> {
    return this.http.get<NgxSignalHistoryResponse>(
      `/api/v1/ngx-signals/${encodeURIComponent(symbol)}`,
      { params: this.buildParams({ take, type }) }
    );
  }

  public fetchSymbolHistory({
    days,
    symbol
  }: {
    days?: number;
    symbol: string;
  }): Observable<NgxSymbolHistoryResponse> {
    return this.http.get<NgxSymbolHistoryResponse>(
      `/api/v1/ngx-analytics/symbols/${encodeURIComponent(symbol)}`,
      { params: this.buildParams({ days }) }
    );
  }

  private buildParams(values: Record<string, number | string | undefined>) {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.append(key, value);
      }
    }

    return params;
  }
}
