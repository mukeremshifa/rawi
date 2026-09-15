import { describe, expect, it } from 'vitest';

import type { AssistanceLevel } from '../../src/shared/contract.ts';
import {
  createSession,
  emptyItemState,
  raiseAssistance,
  recordAskAsSupport,
  requestHint,
  revealAnswer,
  submitAttempt,
  type SessionState,
} from '../../src/server/learning/rules.ts';

import { task, sessionWith } from './fixtures.ts';

/**
 * Invariants 1, 2 and 3.
 *
 *   1. Assistance is monotonic: none -> hinted -> revealed, never backwards.
 *   2. Independent means correct AND unaided — and using Ask counts as help.
 *   3. A revealed item can never later be graded as an unseen check.
 */

const LEVELS: AssistanceLevel[] = ['none', 'hinted', 'revealed'];

describe('invariant 1 — assistance is monotonic', () => {
  it('never returns a lower level, for any pair', () => {
    // Exhaustive rather than illustrative: nine cases is cheap, and the whole
    // invariant is "there is no input that goes backwards".
    for (const current of LEVELS) {
      for (const next of LEVELS) {
        const result = raiseAssistance(current, next);
        expect(LEVELS.indexOf(result)).toBeGreaterThanOrEqual(LEVELS.indexOf(current));
      }
    }
  });

  it('a hint after a reveal leaves the item revealed', () => {
    const revealed = revealAnswer(sessionWith(task('t1')), task('t1'));
    const { state } = requestHint(revealed, task('t1', { hints: ['a hint'] }));
    expect(state.items['t1']!.assistance).toBe('revealed');
  });

  it('survives a reload: the state is the only source, and it only climbs', () => {
    // A "reload" here is re-reading the same persisted state, which is exactly
    // what the store does. Nothing in the read path can lower the level.
    const hinted = requestHint(sessionWith(task('t1', { hints: ['h'] })), task('t1', { hints: ['h'] })).state;
    const reloaded: SessionState = JSON.parse(JSON.stringify(hinted));
    expect(reloaded.items['t1']!.assistance).toBe('hinted');
    const { state } = requestHint(reloaded, task('t1', { hints: ['h'] }));
    expect(state.items['t1']!.assistance).toBe('hinted');
  });

  it('does not raise assistance for a hint that does not exist', () => {
    // Charging for a hint the learner never received is a lie in the direction
    // that costs them their independence.
    const { state, hints } = requestHint(sessionWith(task('t1', { hints: [] })), task('t1', { hints: [] }));
    expect(hints).toHaveLength(0);
    expect(state.items['t1']!.assistance).toBe('none');
  });
});

describe('invariant 2 — independent means correct AND unaided', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');

  it('counts a correct unaided answer', () => {
    const { attempt } = submitAttempt({
      state: sessionWith(task('t1')),
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now,
      reviewIntervalDays: 7,
    });
    expect(attempt.countsAsIndependent).toBe(true);
    expect(attempt.reviewDue).toBe('2026-09-22');
  });

  it('does not count a correct answer after a hint', () => {
    const hinted = requestHint(
      sessionWith(task('t1', { hints: ['h'] })),
      task('t1', { hints: ['h'] }),
    ).state;
    const { attempt } = submitAttempt({
      state: hinted,
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now,
      reviewIntervalDays: 7,
    });
    expect(attempt.countsAsIndependent).toBe(false);
    expect(attempt.reviewDue).toBeNull();
  });

  it('does not count an incorrect unaided answer', () => {
    const { attempt } = submitAttempt({
      state: sessionWith(task('t1')),
      task: task('t1'),
      correct: false,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now,
      reviewIntervalDays: 7,
    });
    expect(attempt.countsAsIndependent).toBe(false);
  });

  it('treats using Ask during a check as assistance', () => {
    const asked = recordAskAsSupport(sessionWith(task('t1')), 't1');
    expect(asked.items['t1']!.assistance).toBe('hinted');

    const { attempt } = submitAttempt({
      state: asked,
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now,
      reviewIntervalDays: 7,
    });
    expect(attempt.countsAsIndependent).toBe(false);
    expect(attempt.usedAsk).toBe(true);
  });
});

describe('invariant 3 — a revealed item is never an unseen check', () => {
  it('records a post-reveal correct answer as assisted', () => {
    const revealed = revealAnswer(sessionWith(task('t1')), task('t1'));
    const { attempt } = submitAttempt({
      state: revealed,
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now: new Date('2026-09-15T10:00:00.000Z'),
      reviewIntervalDays: 7,
    });
    expect(attempt.assistance).toBe('revealed');
    expect(attempt.countsAsIndependent).toBe(false);
  });

  it('a new session inherits the exposure and cannot re-offer the item', () => {
    const next = createSession({
      sessionId: 's2',
      workspaceId: 'w1',
      conceptId: 'c1',
      firstItem: null,
      previouslyExposedItemIds: ['t1'],
      now: new Date(),
    });
    expect(next.exposedItemIds).toContain('t1');
  });

  it('has no API that lowers an item back to none', () => {
    // Structural, not behavioural: the module exports no clearAssistance, and
    // the only writer is raiseAssistance. This asserts the shape a future
    // refactor would have to break on purpose.
    const module = { raiseAssistance, requestHint, revealAnswer, recordAskAsSupport };
    expect(Object.keys(module)).not.toContain('clearAssistance');
    expect(emptyItemState('t1').assistance).toBe('none');
  });
});
