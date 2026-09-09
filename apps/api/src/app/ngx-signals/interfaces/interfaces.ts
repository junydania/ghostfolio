import { NgxSignalRationale } from '@ghostfolio/api/services/ngx-signals/interfaces/interfaces';

import { NgxSignalDirection } from '@prisma/client';

export interface NgxSignalItem {
  date: string;
  direction: NgxSignalDirection;
  rationale: NgxSignalRationale | null;
  score: number;
  symbol: string;
  type: string;
}

export interface NgxSignalsResponse {
  signals: NgxSignalItem[];
}

export interface NgxSignalHistoryResponse {
  signals: NgxSignalItem[];
  symbol: string;
}
