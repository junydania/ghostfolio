import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxSignalCandidate
} from '../interfaces/interfaces';
import {
  NGX_SIGNAL_TYPES,
  VOLUME_ANOMALY_CONFIG
} from '../ngx-signals.constants';
import {
  clampScore,
  mean,
  percentChange,
  round,
  toNumberOrNull
} from '../ngx-signals.utils';

const {
  confirmationRatio,
  minimumAverageVolume,
  minimumObservations,
  scoreFullScaleRatio,
  trailingPeriod,
  watchRatio
} = VOLUME_ANOMALY_CONFIG;

type PriceChangeSource = 'PREVIOUS_CLOSE' | 'PREVIOUS_SNAPSHOT' | 'REPORTED';

/**
 * Compares the day's traded volume to the symbol's own trailing average.
 *
 * Volume on its own says nothing about direction, so the day's price move
 * decides which way the anomaly points: a spike into a rising price is
 * accumulation, the same spike into a falling price is distribution. An
 * unusually busy day that moved the price barely at all is reported as WATCH
 * with a neutral score, because the evidence genuinely is ambiguous.
 *
 * Symbols whose trailing average is below `minimumAverageVolume` are skipped:
 * on a thin NGX counter a multiple of a tiny average is one ordinary trade.
 */
export function evaluateVolumeAnomaly(
  series: NgxCompanySnapshotRow[]
): NgxSignalCandidate | null {
  const rows = series ?? [];
  const latest = rows.at(-1);

  if (!latest || rows.length < minimumObservations) {
    return null;
  }

  const volume = toNumberOrNull(latest.volume);

  if (volume === null || volume < 0) {
    return null;
  }

  const trailingVolumes = rows
    .slice(0, -1)
    .map(({ volume: value }) => {
      return toNumberOrNull(value);
    })
    .filter((value): value is number => {
      return value !== null && value >= 0;
    })
    .slice(-trailingPeriod);

  // A trailing average assembled from fewer than the full window would silently
  // compare against a different baseline per symbol.
  if (trailingVolumes.length < trailingPeriod) {
    return null;
  }

  const averageVolume = mean(trailingVolumes);

  if (averageVolume === null || averageVolume < minimumAverageVolume) {
    return null;
  }

  const volumeRatio = volume / averageVolume;

  if (volumeRatio < watchRatio) {
    return null;
  }

  const { priceChangePercent, priceChangeSource } = resolvePriceChange(rows);
  const priceDirection =
    priceChangePercent === null ? 0 : Math.sign(priceChangePercent);

  let direction: NgxSignalDirection;

  if (volumeRatio >= confirmationRatio && priceDirection > 0) {
    direction = NgxSignalDirection.BUY;
  } else if (volumeRatio >= confirmationRatio && priceDirection < 0) {
    direction = NgxSignalDirection.AVOID;
  } else {
    direction = NgxSignalDirection.WATCH;
  }

  const score = clampScore(
    (priceDirection * (volumeRatio - 1)) / (scoreFullScaleRatio - 1)
  );

  return {
    direction,
    rationale: {
      inputs: {
        averageVolume: round(averageVolume, 0),
        priceChangePercent:
          priceChangePercent === null ? null : round(priceChangePercent),
        priceChangeSource,
        trailingPeriod,
        volume: round(volume, 0),
        volumeRatio: round(volumeRatio)
      },
      observations: rows.length,
      rule: NGX_SIGNAL_TYPES.VOLUME_ANOMALY,
      summary:
        `Traded ${round(volumeRatio, 2)} times its ${trailingPeriod}-day ` +
        `average volume (${round(volume, 0)} against ` +
        `${round(averageVolume, 0)}) on a day the price moved ` +
        `${priceChangePercent === null ? 'an unknown amount' : `${round(priceChangePercent)}%`}.`,
      thresholds: {
        confirmationRatio,
        minimumAverageVolume,
        minimumObservations,
        watchRatio
      }
    },
    score: round(score),
    symbol: latest.symbol,
    type: NGX_SIGNAL_TYPES.VOLUME_ANOMALY
  };
}

/**
 * `priceChangePercent` is nullable upstream, so fall back to the reported
 * previous close and then to the preceding snapshot. Which source was used is
 * recorded, because the three are not equally trustworthy.
 */
function resolvePriceChange(rows: NgxCompanySnapshotRow[]): {
  priceChangePercent: number | null;
  priceChangeSource: PriceChangeSource | null;
} {
  const latest = rows.at(-1);
  const reported = toNumberOrNull(latest.priceChangePercent);

  if (reported !== null) {
    return { priceChangePercent: reported, priceChangeSource: 'REPORTED' };
  }

  const prevClose = toNumberOrNull(latest.prevClose);
  const fromPrevClose =
    prevClose !== null && prevClose > 0
      ? percentChange(prevClose, latest.price)
      : null;

  if (fromPrevClose !== null) {
    return {
      priceChangePercent: fromPrevClose,
      priceChangeSource: 'PREVIOUS_CLOSE'
    };
  }

  const previous = rows.at(-2);
  const fromPreviousSnapshot = previous
    ? percentChange(previous.price, latest.price)
    : null;

  if (fromPreviousSnapshot !== null) {
    return {
      priceChangePercent: fromPreviousSnapshot,
      priceChangeSource: 'PREVIOUS_SNAPSHOT'
    };
  }

  return { priceChangePercent: null, priceChangeSource: null };
}
