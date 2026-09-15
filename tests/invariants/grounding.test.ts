import { describe, expect, it } from 'vitest';

import {
  AssessmentRejected,
  validateAskOutput,
  validateAssessment,
} from '../../src/server/assessment/validate.ts';
import type { Support } from '../../src/shared/content.ts';

import { task } from './fixtures.ts';

/**
 * Invariants 10 and 11.
 *
 *  10. Never fabricate. No invented source support, feedback or passing checks.
 *  11. Model output is validated before it is trusted. An invented quote is a
 *      **rejected assessment**, not a logged warning.
 *
 * Every case below is a thing a fluent model actually does. The one that
 * matters most is `paraphrases the learner` — it looks correct, reads well, and
 * is the model putting words in someone's mouth.
 */

const RESPONSE = 'Because customers can walk to another cafe, total revenue falls.';

const ITEM = task('t1', {
  required_claim_ids: ['CLAIM'],
  clarification_task_ids: ['t2'],
});

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    interpretation_status: 'clear',
    claims: [
      { claim_id: 'CLAIM', status: 'supported', evidence_quote: 'total revenue falls' },
    ],
    ambiguities: [],
    suggested_clarification_id: null,
    answered_correctly: true,
    ...overrides,
  };
}

function reasonOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AssessmentRejected) return error.reason;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('invariant 11 — assessments are validated before they are trusted', () => {
  it('accepts a well-formed assessment quoting the learner verbatim', () => {
    const result = validateAssessment(assessment(), ITEM, RESPONSE, []);
    expect(result.assessment.claims[0]!.status).toBe('supported');
    expect(result.countsAsIndependent).toBe(true);
  });

  it('rejects an invented quote — the paraphrase case', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({
            claims: [
              {
                claim_id: 'CLAIM',
                status: 'supported',
                // Fluent, plausible, and not what the learner wrote.
                evidence_quote: 'the shop will earn less money overall',
              },
            ],
          }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVENTED_EVIDENCE_QUOTE');
  });

  it('rejects a supported claim with nothing quoted', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({
            claims: [{ claim_id: 'CLAIM', status: 'supported', evidence_quote: null }],
          }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('MISSING_EVIDENCE_QUOTE');
  });

  it('rejects an observation set that is not exactly the required claims', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({
            claims: [
              { claim_id: 'CLAIM', status: 'supported', evidence_quote: 'revenue falls' },
              { claim_id: 'INVENTED', status: 'supported', evidence_quote: 'revenue falls' },
            ],
          }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVALID_CLAIM_IDS');

    expect(
      reasonOf(() => validateAssessment(assessment({ claims: [] }), ITEM, RESPONSE, [])),
    ).toBe('INVALID_CLAIM_IDS');
  });

  it('rejects a duplicated claim id', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({
            claims: [
              { claim_id: 'CLAIM', status: 'supported', evidence_quote: 'revenue falls' },
              { claim_id: 'CLAIM', status: 'contradicted', evidence_quote: 'revenue falls' },
            ],
          }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVALID_CLAIM_IDS');
  });

  it('rejects a clarification the item does not offer', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({ suggested_clarification_id: 'not-an-item' }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVALID_CLARIFICATION_ID');
  });

  it('rejects extra fields rather than ignoring them', () => {
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({ confidence: 0.92, grade: 'B+' }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVALID_SHAPE');
  });

  it('checks a quote attached to a not_observed claim too', () => {
    // A quote on a "not observed" claim is still an assertion about what the
    // learner wrote, so it is held to the same rule.
    expect(
      reasonOf(() =>
        validateAssessment(
          assessment({
            claims: [
              {
                claim_id: 'CLAIM',
                status: 'not_observed',
                evidence_quote: 'something they never said',
              },
            ],
          }),
          ITEM,
          RESPONSE,
          [],
        ),
      ),
    ).toBe('INVENTED_EVIDENCE_QUOTE');
  });

  it('tolerates only whitespace differences in a quote', () => {
    const wrapped = 'Because customers can walk to another cafe,\n  total revenue falls.';
    const result = validateAssessment(assessment(), ITEM, wrapped, []);
    expect(result.assessment.claims[0]!.evidence_quote).toBe('total revenue falls');
  });
});

describe('invariant 2 — answer-bearing support downgrades independence', () => {
  const frame: Support = {
    id: 'frame',
    type: 'sentence_frame',
    text: 'Because demand is ______, revenue ______.',
  };
  const vocabulary: Support = {
    id: 'vocab',
    type: 'vocabulary',
    text: 'Elastic means buyers respond a lot.',
  };

  it('downgrades under a sentence frame, whatever the model thinks', () => {
    const result = validateAssessment(assessment(), ITEM, RESPONSE, [frame]);
    expect(result.assessment.answered_correctly).toBe(true);
    expect(result.countsAsIndependent).toBe(false);
  });

  it('does not downgrade under support that carries no answer', () => {
    const result = validateAssessment(assessment(), ITEM, RESPONSE, [vocabulary]);
    expect(result.countsAsIndependent).toBe(true);
  });
});

describe('invariant 10 — a grounded answer cannot cite what it was not given', () => {
  const chunks = [
    { id: 'chunk-1', text: 'Elastic demand means buyers respond strongly to price.' },
  ];

  it('accepts a citation quoting a retrieved passage', () => {
    const result = validateAskOutput(
      {
        answer: 'Buyers respond strongly.',
        citations: [{ chunk_id: 'chunk-1', quote: 'buyers respond strongly to price' }],
        grounded: true,
      },
      chunks,
    );
    expect(result.citations).toHaveLength(1);
  });

  it('rejects a citation naming a passage that was not retrieved', () => {
    expect(() =>
      validateAskOutput(
        {
          answer: 'Something.',
          citations: [{ chunk_id: 'chunk-99', quote: 'anything' }],
          grounded: true,
        },
        chunks,
      ),
    ).toThrow(AssessmentRejected);
  });

  it('rejects a quote that is not in the passage it cites', () => {
    expect(() =>
      validateAskOutput(
        {
          answer: 'Something.',
          citations: [{ chunk_id: 'chunk-1', quote: 'a sentence nobody wrote' }],
          grounded: true,
        },
        chunks,
      ),
    ).toThrow(AssessmentRejected);
  });

  it('rejects claiming groundedness while citing nothing', () => {
    expect(() =>
      validateAskOutput({ answer: 'Yes.', citations: [], grounded: true }, chunks),
    ).toThrow(AssessmentRejected);
  });

  it('accepts an honest refusal to ground', () => {
    const result = validateAskOutput(
      { answer: '', citations: [], grounded: false },
      chunks,
    );
    expect(result.grounded).toBe(false);
  });
});
