import { NgxSignalRegimeRationale } from '@ghostfolio/client/services/ngx/interfaces/interfaces';

import { NgxSignalDirection } from '@prisma/client';

/**
 * One line of evidence, already resolved to a display label and a formatted
 * value so the template never has to iterate a raw JSON object.
 */
export interface NgxRationaleEntry {
  label: string;
  value: string;
}

export interface NgxSignalViewModel {
  date: string;
  direction: NgxSignalDirection;
  /** The values that were measured. */
  inputs: NgxRationaleEntry[];
  observations: number | null;
  regime: NgxSignalRegimeRationale | null;
  ruleLabel: string;
  score: number;
  /** The signed score, formatted for display. */
  scoreLabel: string;
  summary: string | null;
  symbol: string;
  /** The values those measurements were compared against. */
  thresholds: NgxRationaleEntry[];
}
