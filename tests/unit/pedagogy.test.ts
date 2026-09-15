import { describe, expect, it } from 'vitest';

import { chooseRoute } from '../../src/server/pedagogy/route.ts';
import { assessWithFixture, askWithFixture } from '../../src/server/assessment/fixture.ts';
import { conceptContentSchema } from '../../src/shared/content.ts';

import { content, sessionWith, task } from '../invariants/fixtures.ts';

const TASKS = [
  task('entry', { purpose: 'entry', family_id: 'fam-a' }),
  task('probe', { purpose: 'probe', family_id: 'fam-b' }),
  task('clarify', { purpose: 'clarification', family_id: 'fam-c' }),
  task('practice', { purpose: 'practice', family_id: 'fam-d' }),
  task('transfer', { purpose: 'transfer', family_id: 'fam-e' }),
];

const CONTENT = content(TASKS);

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    interpretation_status: 'clear' as const,
    claims: [
      { claim_id: 'CLAIM', status: 'supported' as const, evidence_quote: 'yes it does' },
    ],
    ambiguities: [],
    suggested_clarification_id: null,
    answered_correctly: true,
    ...overrides,
  };
}

describe('the pedagogy router', () => {
  const state = sessionWith(TASKS[0]!);

  it('resolves ambiguity before recording anything', () => {
    // The most important ordering in the file: nothing is concluded about a
    // response we are not sure we understood.
    const decision = chooseRoute(
      CONTENT,
      TASKS[0]!,
      assessment({ interpretation_status: 'ambiguous' }),
      state,
    );
    expect(decision.nextTaskId).toBe('clarify');
    expect(decision.scheduleReview).toBe(false);
  });

  it('treats an unclear claim as ambiguity even when interpretation is clear', () => {
    const decision = chooseRoute(
      CONTENT,
      TASKS[0]!,
      assessment({
        claims: [{ claim_id: 'CLAIM', status: 'unclear', evidence_quote: null }],
      }),
      state,
    );
    expect(decision.nextTaskId).toBe('clarify');
  });

  it('routes a contradiction back through teaching', () => {
    const decision = chooseRoute(
      CONTENT,
      TASKS[0]!,
      assessment({
        claims: [{ claim_id: 'CLAIM', status: 'contradicted', evidence_quote: 'no' }],
      }),
      state,
    );
    expect(decision.stage).toBe('teach');
    expect(decision.feedback.tone).toBe('revisit');
  });

  it('distinguishes omission from contradiction', () => {
    // not_observed is not a wrong answer; it is a partial one, and it probes
    // rather than re-teaches.
    const decision = chooseRoute(
      CONTENT,
      TASKS[0]!,
      assessment({
        claims: [{ claim_id: 'CLAIM', status: 'not_observed', evidence_quote: null }],
      }),
      state,
    );
    expect(decision.stage).toBe('check');
    expect(decision.feedback.tone).toBe('uncertain');
  });

  it('only schedules a re-check after a transfer or a review', () => {
    expect(chooseRoute(CONTENT, TASKS[0]!, assessment(), state).scheduleReview).toBe(false);
    expect(chooseRoute(CONTENT, TASKS[3]!, assessment(), state).scheduleReview).toBe(false);
    expect(chooseRoute(CONTENT, TASKS[4]!, assessment(), state).scheduleReview).toBe(true);
  });

  it('ends honestly when nothing unseen remains, rather than repeating', () => {
    const exhausted = { ...state, exposedItemIds: TASKS.map((item) => item.id) };
    const decision = chooseRoute(CONTENT, TASKS[0]!, assessment(), exhausted);
    expect(decision.nextTaskId).toBeNull();
    expect(decision.status).toBe('partial');
  });

  it('gives up as partial rather than cycling forever', () => {
    const many = {
      ...state,
      attempts: Array.from({ length: 9 }, (_, index) => ({
        id: `a${index}`,
        conceptId: 'c1',
        itemId: 'entry',
        familyId: 'fam-a',
        purpose: 'check' as const,
        stage: 'check' as const,
        correct: false,
        assistance: 'none' as const,
        countsAsIndependent: false,
        usedAsk: false,
        at: '2026-09-01T10:00:00.000Z',
        reviewDue: null,
        idempotencyKey: `k${index}`,
      })),
    };
    const decision = chooseRoute(CONTENT, TASKS[0]!, assessment(), many);
    expect(decision.status).toBe('partial');
    expect(decision.nextTaskId).toBeNull();
  });
});

describe('the fixture assessor', () => {
  it('quotes the learner, so the validator runs over fixture output too', () => {
    const result = assessWithFixture({
      task: TASKS[0]!,
      response: 'I think yes it does, for that reason.',
      claims: CONTENT.claims,
      supportsInForce: [],
    });
    expect(result.claims[0]!.status).toBe('supported');
    expect(result.claims[0]!.evidence_quote).toBeTruthy();
    expect('I think yes it does, for that reason.').toContain(
      result.claims[0]!.evidence_quote!.slice(0, 12),
    );
  });

  it('detects a contradiction rather than calling everything supported', () => {
    const result = assessWithFixture({
      task: TASKS[0]!,
      response: 'Actually no it does not.',
      claims: CONTENT.claims,
      supportsInForce: [],
    });
    expect(result.claims[0]!.status).toBe('contradicted');
    expect(result.answered_correctly).toBe(false);
  });

  it('calls a very short response ambiguous rather than wrong', () => {
    const result = assessWithFixture({
      task: TASKS[0]!,
      response: 'maybe',
      claims: CONTENT.claims,
      supportsInForce: [],
    });
    expect(result.interpretation_status).toBe('ambiguous');
  });

  it('exercises the "sources do not cover this" path', () => {
    const output = askWithFixture({
      question: 'What about photosynthesis?',
      chunks: [{ id: 'c1', text: 'Elastic demand means buyers respond a lot.' }],
    });
    expect(output.grounded).toBe(false);
    expect(output.citations).toHaveLength(0);
  });
});

describe('the content schema', () => {
  it('rejects content with only one item family', () => {
    // A concept whose every task shares a family makes the delayed re-check
    // structurally impossible. Worth failing at authoring time.
    const single = content([
      task('a', { family_id: 'same' }),
      task('b', { family_id: 'same' }),
    ]);
    const parsed = conceptContentSchema.safeParse(single);
    expect(parsed.success).toBe(false);
  });

  it('rejects a task requiring a claim that does not exist', () => {
    const broken = content([
      task('a', { family_id: 'f1', required_claim_ids: ['NOPE'] }),
      task('b', { family_id: 'f2' }),
    ]);
    expect(conceptContentSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a choice task with no options', () => {
    const broken = content([
      task('a', { family_id: 'f1', response_mode: 'choice', options: null }),
      task('b', { family_id: 'f2' }),
    ]);
    expect(conceptContentSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts well-formed content', () => {
    expect(conceptContentSchema.safeParse(CONTENT).success).toBe(true);
  });
});
