import { NgxSignalDirection } from '@prisma/client';

import { NgxDigestSignal } from './interfaces/interfaces';
import {
  formatRationale,
  groupSignalsByDirection,
  renderDigest
} from './ngx-digest.renderer';

const date = new Date('2026-09-08T00:00:00.000Z');

const buy: NgxDigestSignal = {
  direction: NgxSignalDirection.BUY,
  rationale: { movingAverage50: 480.125, price: 512.5 },
  score: 0.82,
  symbol: 'DANGCEM',
  type: 'momentum'
};

const avoid: NgxDigestSignal = {
  direction: NgxSignalDirection.AVOID,
  rationale: { position52w: 0.04 },
  score: 0.71,
  symbol: 'ZENITHBANK',
  type: 'near-52w-low'
};

const watch: NgxDigestSignal = {
  direction: NgxSignalDirection.WATCH,
  rationale: null,
  score: 0.4,
  symbol: 'GTCO',
  type: 'volume-anomaly'
};

describe('NgxDigestRenderer', () => {
  describe('groupSignalsByDirection', () => {
    it('groups and orders each direction by descending score', () => {
      const lowerBuy = { ...buy, score: 0.2, symbol: 'OKOMUOIL' };
      const grouped = groupSignalsByDirection([lowerBuy, watch, buy, avoid]);

      expect(
        grouped[NgxSignalDirection.BUY].map(({ symbol }) => symbol)
      ).toEqual(['DANGCEM', 'OKOMUOIL']);
      expect(grouped[NgxSignalDirection.AVOID]).toHaveLength(1);
      expect(grouped[NgxSignalDirection.WATCH]).toHaveLength(1);
    });

    it('tolerates an empty or missing list', () => {
      const grouped = groupSignalsByDirection(undefined);

      expect(grouped[NgxSignalDirection.BUY]).toEqual([]);
    });
  });

  describe('formatRationale', () => {
    it('renders evidence as key/value pairs with numbers rounded', () => {
      expect(formatRationale({ movingAverage50: 480.125, price: 512.5 })).toBe(
        'movingAverage50: 480.13, price: 512.50'
      );
    });

    it('keeps integers unrounded and drops empty values', () => {
      expect(formatRationale({ days: 50, missing: null, blank: '' })).toBe(
        'days: 50'
      );
    });

    it('returns an empty string when there is no rationale', () => {
      expect(formatRationale(null)).toBe('');
      expect(formatRationale(undefined)).toBe('');
    });
  });

  describe('renderDigest', () => {
    it('states the verdict in the subject', () => {
      const { subject } = renderDigest({ date, signals: [buy, avoid, watch] });

      expect(subject).toBe('NGX signals 2026-09-08 — 1 buy, 1 avoid');
    });

    it('marks a quiet day as skippable without opening it', () => {
      const { subject } = renderDigest({ date, signals: [watch] });

      expect(subject).toBe('NGX signals 2026-09-08 — no action');
    });

    it('still sends a body on a day with no signals at all', () => {
      const { html, subject, text } = renderDigest({ date, signals: [] });

      expect(subject).toBe('NGX signals 2026-09-08 — no action');
      expect(text).toContain('NGX signals for 2026-09-08');
      expect(html).toContain('NGX signals for 2026-09-08');
    });

    it('includes the rationale so a signal can be acted on', () => {
      const { text } = renderDigest({ date, signals: [buy] });

      expect(text).toContain('DANGCEM');
      expect(text).toContain('movingAverage50: 480.13');
    });

    it('renders market context when present', () => {
      const { text } = renderDigest({
        date,
        market: { advDecRatio: 1.4, asi: 98765.43, asiChangePercent: 0.85 },
        signals: [buy]
      });

      expect(text).toContain('ASI 98765.43 (+0.85%)');
      expect(text).toContain('advance/decline 1.40');
    });

    it('omits market context when the snapshot is missing', () => {
      const { text } = renderDigest({ date, market: null, signals: [buy] });

      expect(text).not.toContain('ASI');
    });

    it('escapes HTML so API-sourced values cannot inject markup', () => {
      const { html } = renderDigest({
        date,
        signals: [{ ...buy, symbol: '<script>x</script>' }]
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not present signals as advice', () => {
      const { text } = renderDigest({ date, signals: [buy] });

      expect(text).toContain('Evidence, not advice.');
    });
  });
});
