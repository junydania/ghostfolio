import {
  NgxAsiTrendSource,
  NgxMarketRegime,
  NgxSignalItem,
  NgxSignalRationaleValue
} from '@ghostfolio/client/services/ngx/interfaces/interfaces';

import { NgxSignalDirection } from '@prisma/client';

import { NgxRationaleEntry, NgxSignalViewModel } from './interfaces/interfaces';

/** The currency every NGX figure is quoted in. */
export const NGX_CURRENCY = 'NGN';

const MAXIMUM_FRACTION_DIGITS = 4;
const PLACEHOLDER = '–';

export function getDirectionLabel(aDirection: NgxSignalDirection) {
  switch (aDirection) {
    case 'AVOID':
      return $localize`Avoid`;
    case 'BUY':
      return $localize`Buy`;
    case 'WATCH':
      return $localize`Watch`;
    default:
      return aDirection;
  }
}

export function getRegimeLabel(aRegime: NgxMarketRegime) {
  switch (aRegime) {
    case 'BEARISH':
      return $localize`Bearish`;
    case 'BULLISH':
      return $localize`Bullish`;
    case 'NEUTRAL':
      return $localize`Neutral`;
    default:
      return $localize`Unknown`;
  }
}

export function getAsiTrendSourceLabel(aSource: NgxAsiTrendSource) {
  switch (aSource) {
    case 'DAILY_CHANGE':
      return $localize`daily change`;
    case 'MOVING_AVERAGE':
      return $localize`moving average`;
    default:
      return $localize`not available`;
  }
}

export function getRuleLabel(aType: string) {
  switch (aType) {
    case 'FIFTY_TWO_WEEK_POSITION':
      return $localize`52-week position`;
    case 'MOVING_AVERAGE_TREND':
      return $localize`Moving average trend`;
    case 'RELATIVE_STRENGTH':
      return $localize`Relative strength`;
    case 'VOLUME_ANOMALY':
      return $localize`Volume anomaly`;
    default:
      return aType;
  }
}

/**
 * `excessReturnPercent7d` becomes `Excess return percent 7d`. The rationale
 * keys are written by the rules, so they are turned into labels rather than
 * translated one by one.
 */
export function humanizeRationaleKey(aKey: string) {
  const words = aKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatRationaleValue({
  locale,
  value
}: {
  locale: string;
  value: NgxSignalRationaleValue;
}) {
  if (value === null || value === undefined) {
    return PLACEHOLDER;
  }

  if (typeof value === 'boolean') {
    return value ? $localize`Yes` : $localize`No`;
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      return PLACEHOLDER;
    }

    return value.toLocaleString(locale, {
      maximumFractionDigits: MAXIMUM_FRACTION_DIGITS
    });
  }

  return value;
}

export function formatScore({
  locale,
  score
}: {
  locale: string;
  score: number;
}) {
  if (!isFinite(score)) {
    return PLACEHOLDER;
  }

  const formattedValue = Math.abs(score).toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });

  return `${score < 0 ? '-' : '+'}${formattedValue}`;
}

function toRationaleEntries({
  locale,
  values
}: {
  locale: string;
  values: Record<string, NgxSignalRationaleValue> | undefined;
}): NgxRationaleEntry[] {
  return Object.entries(values ?? {})
    .map(([key, value]) => {
      return {
        label: humanizeRationaleKey(key),
        value: formatRationaleValue({ locale, value })
      };
    })
    .sort((a, b) => {
      return a.label.localeCompare(b.label);
    });
}

/**
 * Flattens a signal and its rationale into everything the template renders.
 * A signal whose rationale is missing still renders, with the evidence
 * sections empty, rather than being dropped.
 */
export function toNgxSignalViewModel({
  locale,
  signal
}: {
  locale: string;
  signal: NgxSignalItem;
}): NgxSignalViewModel {
  const { date, direction, rationale, score, symbol, type } = signal;

  return {
    date,
    direction,
    score,
    symbol,
    inputs: toRationaleEntries({ locale, values: rationale?.inputs }),
    observations: rationale?.observations ?? null,
    regime: rationale?.regime ?? null,
    ruleLabel: getRuleLabel(type),
    scoreLabel: formatScore({ locale, score }),
    summary: rationale?.summary ?? null,
    thresholds: toRationaleEntries({ locale, values: rationale?.thresholds })
  };
}
