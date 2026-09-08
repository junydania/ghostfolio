import { DATE_FORMAT } from '@ghostfolio/common/helper';

import { NgxSignalDirection } from '@prisma/client';
import { format } from 'date-fns';

import {
  NgxDigestInput,
  NgxDigestSignal,
  NgxRenderedDigest
} from './interfaces/interfaces';

const DIRECTION_ORDER: NgxSignalDirection[] = [
  NgxSignalDirection.BUY,
  NgxSignalDirection.AVOID,
  NgxSignalDirection.WATCH
];

const DIRECTION_LABEL: { [key in NgxSignalDirection]: string } = {
  [NgxSignalDirection.AVOID]: 'Avoid',
  [NgxSignalDirection.BUY]: 'Buy',
  [NgxSignalDirection.WATCH]: 'Watch'
};

export function groupSignalsByDirection(signals: NgxDigestSignal[]): {
  [key in NgxSignalDirection]: NgxDigestSignal[];
} {
  const grouped = {
    [NgxSignalDirection.AVOID]: [] as NgxDigestSignal[],
    [NgxSignalDirection.BUY]: [] as NgxDigestSignal[],
    [NgxSignalDirection.WATCH]: [] as NgxDigestSignal[]
  };

  for (const signal of signals ?? []) {
    if (grouped[signal.direction]) {
      grouped[signal.direction].push(signal);
    }
  }

  for (const direction of DIRECTION_ORDER) {
    grouped[direction].sort((a, b) => {
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }

  return grouped;
}

/**
 * Rationale is rendered as plain "key: value" evidence rather than prose. The
 * reader must be able to see which numbers produced the signal, because an
 * unexplained signal cannot support a buying decision.
 */
export function formatRationale(
  rationale: Record<string, unknown> | null | undefined
): string {
  if (!rationale || typeof rationale !== 'object') {
    return '';
  }

  return Object.entries(rationale)
    .filter(([, value]) => {
      return value !== null && value !== undefined && value !== '';
    })
    .map(([key, value]) => {
      const formattedValue =
        typeof value === 'number'
          ? Number.isInteger(value)
            ? `${value}`
            : value.toFixed(2)
          : `${value}`;

      return `${key}: ${formattedValue}`;
    })
    .join(', ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderDigest({
  date,
  market,
  signals
}: NgxDigestInput): NgxRenderedDigest {
  const grouped = groupSignalsByDirection(signals);
  const formattedDate = format(date, DATE_FORMAT);

  const buyCount = grouped[NgxSignalDirection.BUY].length;
  const avoidCount = grouped[NgxSignalDirection.AVOID].length;

  const headline = [
    buyCount > 0 ? `${buyCount} buy` : null,
    avoidCount > 0 ? `${avoidCount} avoid` : null
  ]
    .filter(Boolean)
    .join(', ');

  // The digest sends every trading day, so the subject has to carry the
  // verdict: a quiet day must be skippable without opening the mail.
  const subject = `NGX signals ${formattedDate} — ${headline || 'no action'}`;

  const marketLine =
    market && (market.asi ?? null) !== null
      ? `ASI ${market.asi.toFixed(2)}${
          (market.asiChangePercent ?? null) !== null
            ? ` (${market.asiChangePercent > 0 ? '+' : ''}${market.asiChangePercent.toFixed(2)}%)`
            : ''
        }${
          (market.advDecRatio ?? null) !== null
            ? `, advance/decline ${market.advDecRatio.toFixed(2)}`
            : ''
        }`
      : '';

  const textSections: string[] = [];
  const htmlSections: string[] = [];

  for (const direction of DIRECTION_ORDER) {
    const items = grouped[direction];

    if (items.length === 0) {
      continue;
    }

    textSections.push(
      `${DIRECTION_LABEL[direction]}\n${items
        .map((signal) => {
          const rationale = formatRationale(signal.rationale);

          return `  ${signal.symbol} — ${signal.type} (score ${signal.score.toFixed(
            2
          )})${rationale ? `\n    ${rationale}` : ''}`;
        })
        .join('\n')}`
    );

    htmlSections.push(
      `<h2 style="font-size:16px;margin:24px 0 8px">${DIRECTION_LABEL[direction]}</h2><ul style="margin:0;padding-left:20px">${items
        .map((signal) => {
          const rationale = formatRationale(signal.rationale);

          return `<li style="margin-bottom:6px"><strong>${escapeHtml(
            signal.symbol
          )}</strong> — ${escapeHtml(signal.type)} (score ${signal.score.toFixed(
            2
          )})${
            rationale
              ? `<br /><span style="color:#666">${escapeHtml(rationale)}</span>`
              : ''
          }</li>`;
        })
        .join('')}</ul>`
    );
  }

  const text = [
    `NGX signals for ${formattedDate}`,
    marketLine,
    ...textSections,
    'Derived from stored NGX market history. Evidence, not advice.'
  ]
    .filter(Boolean)
    .join('\n\n');

  const html = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111"><h1 style="font-size:18px;margin:0 0 4px">NGX signals for ${formattedDate}</h1>`,
    marketLine
      ? `<p style="color:#666;margin:0">${escapeHtml(marketLine)}</p>`
      : '',
    ...htmlSections,
    `<p style="color:#888;font-size:12px;margin-top:24px">Derived from stored NGX market history. Evidence, not advice.</p></div>`
  ]
    .filter(Boolean)
    .join('');

  return { html, subject, text };
}
