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

/**
 * Email clients vary wildly in CSS support, so every colour is applied inline
 * rather than through a stylesheet. Muted, print-like palette: this is a
 * morning note, not a notification badge.
 */
const THEME = {
  avoidBg: '#fdeceb',
  avoidBorder: '#f3c4c0',
  avoidInk: '#9f1c13',
  buyBg: '#e6f4ec',
  buyBorder: '#bfe3ce',
  buyInk: '#0b6b3a',
  ink: '#111827',
  muted: '#6b7280',
  page: '#f4f5f7',
  rule: '#e5e7eb',
  subtle: '#f9fafb',
  surface: '#ffffff',
  watchBg: '#fff4e0',
  watchBorder: '#f0d9a8',
  watchInk: '#7a5200'
};

const DIRECTION_COLOURS: {
  [key in NgxSignalDirection]: { bg: string; border: string; ink: string };
} = {
  [NgxSignalDirection.AVOID]: {
    bg: THEME.avoidBg,
    border: THEME.avoidBorder,
    ink: THEME.avoidInk
  },
  [NgxSignalDirection.BUY]: {
    bg: THEME.buyBg,
    border: THEME.buyBorder,
    ink: THEME.buyInk
  },
  [NgxSignalDirection.WATCH]: {
    bg: THEME.watchBg,
    border: THEME.watchBorder,
    ink: THEME.watchInk
  }
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
      // Strongest evidence first. For AVOID that is the most negative score,
      // so order by absolute strength rather than raw value.
      return Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0);
    });
  }

  return grouped;
}

/** FIFTY_TWO_WEEK_POSITION -> "52 week position" */
export function humanizeRuleName(type: string): string {
  if (!type) {
    return '';
  }

  const words = type.toLowerCase().split('_');

  return words
    .map((word, index) => {
      if (/^\d/.test(word)) {
        return word;
      }

      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(' ')
    .replace(/^Fifty two/, '52-')
    .replace(/^52- /, '52-week ')
    .replace('week week', 'week');
}

export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  return `${value}`;
}

/**
 * Kept for the plain-text part and for callers that want a one-line summary.
 */
export function formatRationale(
  rationale: Record<string, unknown> | null | undefined
): string {
  return toPairs(rationale)
    .map(([key, value]) => {
      return `${key}: ${value}`;
    })
    .join(', ');
}

function toPairs(
  source: Record<string, unknown> | null | undefined
): [string, string][] {
  if (!source || typeof source !== 'object') {
    return [];
  }

  return Object.entries(source)
    .map(([key, value]): [string, string] => {
      return [key, formatValue(value)];
    })
    .filter(([, value]) => {
      return value !== '';
    });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSignedScore(score: number): string {
  const value = score ?? 0;

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function renderEvidenceColumn({
  pairs,
  title
}: {
  pairs: [string, string][];
  title: string;
}): string {
  if (pairs.length === 0) {
    return '';
  }

  const rows = pairs
    .map(([key, value]) => {
      return `<tr><td style="padding:1px 8px 1px 0;color:${THEME.muted};font-size:12px;line-height:18px;white-space:nowrap">${escapeHtml(
        humanizeKey(key)
      )}</td><td style="padding:1px 0;color:${THEME.ink};font-size:12px;line-height:18px;font-weight:600;text-align:right">${escapeHtml(
        value
      )}</td></tr>`;
    })
    .join('');

  return `<td valign="top" style="padding:0 12px 0 0;width:50%"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${THEME.muted};padding-bottom:4px">${escapeHtml(
    title
  )}</div><table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">${rows}</table></td>`;
}

function renderSignalCard(signal: NgxDigestSignal): string {
  const colours = DIRECTION_COLOURS[signal.direction];
  const rationale = signal.rationale ?? {};

  const inputs = toPairs(rationale.inputs as Record<string, unknown>);
  const thresholds = toPairs(rationale.thresholds as Record<string, unknown>);
  const summary = formatValue(rationale.summary);
  const observations = formatValue(rationale.observations);

  // Fall back to the whole rationale when it is not split into the
  // inputs/thresholds shape, so an unexpected payload still shows its
  // evidence rather than rendering an empty card.
  const fallback =
    inputs.length === 0 && thresholds.length === 0
      ? toPairs(rationale).filter(([key]) => {
          return !['regime', 'rule', 'summary'].includes(key);
        })
      : [];

  const evidence =
    inputs.length > 0 || thresholds.length > 0
      ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation"><tr>${renderEvidenceColumn(
          { pairs: inputs, title: 'Observed' }
        )}${renderEvidenceColumn({
          pairs: thresholds,
          title: 'Thresholds tested'
        })}</tr></table>`
      : fallback.length > 0
        ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation"><tr>${renderEvidenceColumn(
            { pairs: fallback, title: 'Evidence' }
          )}</tr></table>`
        : '';

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="border:1px solid ${THEME.rule};border-radius:6px;margin-bottom:8px">
  <tr><td style="padding:12px 14px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation"><tr>
      <td style="font-size:15px;font-weight:700;color:${THEME.ink};line-height:20px">${escapeHtml(
        signal.symbol
      )}<span style="font-weight:400;color:${THEME.muted};font-size:12px"> &middot; ${escapeHtml(
        humanizeRuleName(signal.type)
      )}</span></td>
      <td align="right" style="white-space:nowrap"><span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${colours.bg};border:1px solid ${colours.border};color:${colours.ink};font-size:11px;font-weight:700;letter-spacing:.04em">${escapeHtml(
        DIRECTION_LABEL[signal.direction].toUpperCase()
      )}</span><span style="font-size:13px;font-weight:700;color:${colours.ink};padding-left:8px">${formatSignedScore(
        signal.score
      )}</span></td>
    </tr></table>
    ${
      summary
        ? `<div style="font-size:13px;line-height:19px;color:${THEME.ink};padding:8px 0 ${evidence ? '10px' : '0'}">${escapeHtml(summary)}</div>`
        : ''
    }
    ${
      evidence
        ? `<div style="background:${THEME.subtle};border-radius:4px;padding:8px 10px">${evidence}</div>`
        : ''
    }
    ${
      observations
        ? `<div style="font-size:11px;color:${THEME.muted};padding-top:8px">Based on ${escapeHtml(
            observations
          )} observations</div>`
        : ''
    }
  </td></tr>
</table>`;
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
  const watchCount = grouped[NgxSignalDirection.WATCH].length;

  const headline = [
    buyCount > 0 ? `${buyCount} buy` : null,
    avoidCount > 0 ? `${avoidCount} avoid` : null
  ]
    .filter(Boolean)
    .join(', ');

  // The digest sends every trading day, so the subject carries the verdict:
  // a quiet day must be skippable straight from the inbox list.
  const subject = `NGX signals ${formattedDate} — ${headline || 'no action'}`;

  const hasAsi = market && (market.asi ?? null) !== null;
  const marketLine = hasAsi
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
      `${DIRECTION_LABEL[direction].toUpperCase()} (${items.length})\n${items
        .map((signal) => {
          const rationale = signal.rationale ?? {};
          const summary = formatValue(rationale.summary);
          const detail = formatRationale(
            (rationale.inputs as Record<string, unknown>) ?? rationale
          );

          return `  ${signal.symbol}  ${formatSignedScore(signal.score)}  ${humanizeRuleName(
            signal.type
          )}${summary ? `\n    ${summary}` : ''}${detail ? `\n    ${detail}` : ''}`;
        })
        .join('\n\n')}`
    );

    htmlSections.push(
      `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${THEME.muted};padding:18px 0 8px;font-weight:700">${DIRECTION_LABEL[
        direction
      ].toUpperCase()} <span style="color:${THEME.rule}">&middot;</span> ${items.length}</div>${items
        .map((signal) => {
          return renderSignalCard(signal);
        })
        .join('')}`
    );
  }

  const emptyState = `<div style="border:1px dashed ${THEME.rule};border-radius:6px;padding:20px;text-align:center;color:${THEME.muted};font-size:13px;line-height:19px">No rule produced a signal for this session.<br />Rules stay silent until enough trading days have accumulated.</div>`;

  const text = [
    `NGX SIGNALS — ${formattedDate}`,
    headline ? headline.toUpperCase() : 'No action',
    marketLine,
    ...(textSections.length > 0
      ? textSections
      : ['No rule produced a signal for this session.']),
    '—',
    'Derived from stored NGX market history. Scores express the strength of the observed evidence, from -1 to +1. This is not financial advice.'
  ]
    .filter(Boolean)
    .join('\n\n');

  const preheader = `${headline || 'No action'}${marketLine ? ` · ${marketLine}` : ''}`;

  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${THEME.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="background:${THEME.page};padding:24px 12px">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" role="presentation" style="width:600px;max-width:100%;background:${THEME.surface};border:1px solid ${THEME.rule};border-radius:8px;font-family:${FONT}">
      <tr><td style="padding:20px 22px 0">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${THEME.muted};font-weight:700">Nigerian Exchange</div>
        <div style="font-size:22px;font-weight:700;color:${THEME.ink};padding-top:2px;line-height:28px">Signals for ${escapeHtml(
          formattedDate
        )}</div>
        <div style="font-size:14px;color:${THEME.ink};padding-top:6px">${
          headline
            ? [
                buyCount > 0 ? `${buyCount} buy` : null,
                avoidCount > 0 ? `${avoidCount} avoid` : null,
                watchCount > 0 ? `${watchCount} watch` : null
              ]
                .filter(Boolean)
                .map((part) => {
                  return escapeHtml(part);
                })
                .join(' &middot; ')
            : `<span style="color:${THEME.muted}">Nothing actionable today</span>`
        }</div>
      </td></tr>
      ${
        marketLine
          ? `<tr><td style="padding:14px 22px 0"><table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="background:${THEME.subtle};border:1px solid ${THEME.rule};border-radius:6px"><tr><td style="padding:10px 12px;font-size:12px;color:${THEME.muted};line-height:18px">${escapeHtml(
              marketLine
            )}</td></tr></table></td></tr>`
          : ''
      }
      <tr><td style="padding:0 22px 4px">${
        htmlSections.length > 0
          ? htmlSections.join('')
          : `<div style="padding-top:18px">${emptyState}</div>`
      }</td></tr>
      <tr><td style="padding:14px 22px 22px">
        <div style="border-top:1px solid ${THEME.rule};padding-top:12px;font-size:11px;line-height:17px;color:${THEME.muted}">
          Derived from stored NGX market history. A score runs from &minus;1 to +1 and expresses how strong the observed evidence is &mdash; positive counts in favour of buying, negative against. It is not a forecast, a probability, or financial advice.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { html, subject, text };
}
