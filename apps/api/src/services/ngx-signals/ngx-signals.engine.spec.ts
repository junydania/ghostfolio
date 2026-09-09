import { NgxSignalDirection } from '@prisma/client';

import {
  NgxCompanySnapshotRow,
  NgxMarketSnapshotRow
} from './interfaces/interfaces';
import { evaluateSignals } from './ngx-signals.engine';

const EVALUATION_DATE = new Date(Date.UTC(2026, 8, 8));

function company(
  overrides: Partial<NgxCompanySnapshotRow>
): NgxCompanySnapshotRow {
  return {
    date: EVALUATION_DATE,
    high52wk: 200,
    low52wk: 100,
    price: 150,
    symbol: 'DANGCEM',
    ...overrides
  };
}

function market(
  overrides: Partial<NgxMarketSnapshotRow>
): NgxMarketSnapshotRow {
  return { date: EVALUATION_DATE, ...overrides };
}

/**
 * ALPHA closes in the top decile of its 52-week range, BETA in the bottom
 * decile and GAMMA in the middle. Only the 52-week rule has the history it
 * needs on a single captured day.
 */
const CROSS_SECTION = [
  company({ price: 190, symbol: 'ALPHA' }),
  company({ price: 108, symbol: 'BETA' }),
  company({ price: 150, symbol: 'GAMMA' })
];

describe('evaluateSignals', () => {
  describe('in a market with no clear direction', () => {
    const { candidates, regime, symbolsEvaluated } = evaluateSignals({
      companySnapshots: CROSS_SECTION,
      date: EVALUATION_DATE,
      marketSnapshots: [market({ advDecRatio: 1, asiChangePercent: 0 })]
    });

    it('evaluates every symbol that traded', () => {
      expect(symbolsEvaluated).toBe(3);
      expect(regime.regime).toBe('NEUTRAL');
    });

    it('emits a signal only where a rule found evidence', () => {
      expect(
        candidates.map(({ direction, score, symbol }) => {
          return { direction, score, symbol };
        })
      ).toEqual([
        { direction: NgxSignalDirection.BUY, score: 0.8, symbol: 'ALPHA' },
        { direction: NgxSignalDirection.AVOID, score: -0.84, symbol: 'BETA' }
      ]);
    });

    it('attaches the regime to every rationale', () => {
      for (const { rationale } of candidates) {
        expect(rationale.regime.regime).toBe('NEUTRAL');
        expect(rationale.regime.demoted).toBe(false);
      }
    });
  });

  describe('in a falling market', () => {
    const { candidates, regime } = evaluateSignals({
      companySnapshots: CROSS_SECTION,
      date: EVALUATION_DATE,
      marketSnapshots: [market({ advDecRatio: 0.4, asiChangePercent: -2.1 })]
    });

    it('demotes the buy and halves its score', () => {
      expect(regime.regime).toBe('BEARISH');
      expect(candidates[0]).toMatchObject({
        direction: NgxSignalDirection.WATCH,
        score: 0.4,
        symbol: 'ALPHA'
      });
    });

    it('leaves the avoid intact', () => {
      expect(candidates[1]).toMatchObject({
        direction: NgxSignalDirection.AVOID,
        score: -0.84,
        symbol: 'BETA'
      });
    });
  });

  describe('with no market snapshot at all', () => {
    it('reports the regime as UNKNOWN and does not demote', () => {
      const { candidates, regime } = evaluateSignals({
        companySnapshots: CROSS_SECTION,
        date: EVALUATION_DATE,
        marketSnapshots: []
      });

      expect(regime.regime).toBe('UNKNOWN');
      expect(candidates[0].direction).toBe(NgxSignalDirection.BUY);
      expect(candidates[0].rationale.regime.regime).toBe('UNKNOWN');
    });
  });

  describe('input hygiene', () => {
    it('ignores a symbol that did not trade on the evaluation date', () => {
      const { candidates, symbolsEvaluated } = evaluateSignals({
        companySnapshots: [
          company({
            date: new Date(Date.UTC(2026, 8, 7)),
            price: 190,
            symbol: 'HALTED'
          })
        ],
        date: EVALUATION_DATE,
        marketSnapshots: []
      });

      expect(symbolsEvaluated).toBe(0);
      expect(candidates).toEqual([]);
    });

    it('ignores rows dated after the evaluation date', () => {
      const { candidates } = evaluateSignals({
        companySnapshots: [
          company({ price: 190, symbol: 'ALPHA' }),
          company({
            date: new Date(Date.UTC(2026, 8, 9)),
            price: 108,
            symbol: 'ALPHA'
          })
        ],
        date: EVALUATION_DATE,
        marketSnapshots: []
      });

      expect(candidates[0].direction).toBe(NgxSignalDirection.BUY);
      expect(candidates[0].rationale.inputs.price).toBe(190);
    });

    it('returns nothing for an unusable evaluation date', () => {
      const result = evaluateSignals({
        companySnapshots: CROSS_SECTION,
        date: new Date('not-a-date'),
        marketSnapshots: []
      });

      expect(result.candidates).toEqual([]);
      expect(result.symbolsEvaluated).toBe(0);
    });

    it('returns nothing when there is no data at all', () => {
      const result = evaluateSignals({
        companySnapshots: [],
        date: EVALUATION_DATE,
        marketSnapshots: []
      });

      expect(result.candidates).toEqual([]);
      expect(result.regime.regime).toBe('UNKNOWN');
    });
  });

  describe('ordering', () => {
    it('puts the strongest buy-side evidence first', () => {
      const { candidates } = evaluateSignals({
        companySnapshots: [
          company({ price: 108, symbol: 'AAA' }),
          company({ price: 195, symbol: 'ZZZ' })
        ],
        date: EVALUATION_DATE,
        marketSnapshots: []
      });

      expect(
        candidates.map(({ symbol }) => {
          return symbol;
        })
      ).toEqual(['ZZZ', 'AAA']);
    });
  });
});
