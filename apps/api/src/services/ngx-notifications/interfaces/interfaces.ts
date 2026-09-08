import { NgxSignalDirection } from '@prisma/client';

export interface NgxDigestSignal {
  direction: NgxSignalDirection;
  rationale?: Record<string, unknown> | null;
  score: number;
  symbol: string;
  type: string;
}

export interface NgxDigestMarketContext {
  advDecRatio?: number | null;
  asi?: number | null;
  asiChangePercent?: number | null;
}

export interface NgxDigestInput {
  date: Date;
  market?: NgxDigestMarketContext | null;
  signals: NgxDigestSignal[];
}

export interface NgxRenderedDigest {
  html: string;
  subject: string;
  text: string;
}
