import { describe, expect, it } from 'vitest';

import {
  earningAttempt,
  evidenceState,
  nextReviewDue,
  submitAttempt,
  type RecordedAttempt,
} from '../../src/server/learning/rules.ts';

import { task, sessionWith } from './fixtures.ts';

/**
 * Invariants 4 and 6.
 *
 *   4. Recorded attempts are immutable, including the review date anchored to
 *      them. Reading the same evidence later does not move it.
 *   6. No mastery percentage. Evidence is a described state.
 */

function attempt(overrides: Partial<RecordedAttempt> = {}): RecordedAttempt {
  return {
    id: 'a1',
    conceptId: 'c1',
    itemId: 't1',
    familyId: 'fam-a',
    purpose: 'check',
    stage: 'check',
    correct: true,
    assistance: 'none',
    countsAsIndependent: true,
    usedAsk: false,
    at: '2026-09-01T10:00:00.000Z',
    reviewDue: '2026-09-08',
    idempotencyKey: 'k1',
    ...overrides,
  };
}

describe('invariant 4 — attempts and their dates are immutable', () => {
  it('replays the recorded attempt rather than re-judging it', () => {
    const first = submitAttempt({
      state: sessionWith(task('t1')),
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now: new Date('2026-09-01T10:00:00.000Z'),
      reviewIntervalDays: 7,
    });

    // The learner reveals the answer AFTER submitting, then the submission is
    // replayed. Reading assistance from the item's current state would describe
    // a past result using help taken afterwards.
    const afterReveal = {
      ...first.state,
      items: {
        ...first.state.items,
        t1: { ...first.state.items['t1']!, assistance: 'revealed' as const },
      },
    };

    const replay = submitAttempt({
      state: afterReveal,
      task: task('t1'),
      correct: false,
      attemptId: 'a2',
      idempotencyKey: 'k2',
      now: new Date('2026-09-20T10:00:00.000Z'),
      reviewIntervalDays: 7,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.attempt.assistance).toBe('none');
    expect(replay.attempt.correct).toBe(true);
    expect(replay.attempt.reviewDue).toBe('2026-09-08');
    expect(replay.state.attempts).toHaveLength(1);
  });

  it('reads the stored due date rather than recomputing from the clock', () => {
    const attempts = [attempt({ reviewDue: '2026-09-08' })];
    // Called on two different "days" — the answer must not move.
    expect(nextReviewDue(attempts)).toBe('2026-09-08');
    expect(nextReviewDue(attempts)).toBe('2026-09-08');
  });

  it('anchors the date to the moment of the attempt', () => {
    const { attempt: recorded } = submitAttempt({
      state: sessionWith(task('t1')),
      task: task('t1'),
      correct: true,
      attemptId: 'a1',
      idempotencyKey: 'k1',
      now: new Date('2026-09-15T23:59:00.000Z'),
      reviewIntervalDays: 7,
    });
    expect(recorded.reviewDue).toBe('2026-09-22');
  });
});

describe('invariant 6 — evidence is a state, never a number', () => {
  it('is not-checked with no attempts', () => {
    expect(evidenceState([])).toBe('not-checked');
  });

  it('is practicing when attempts exist but none was unaided and correct', () => {
    expect(
      evidenceState([attempt({ correct: false, countsAsIndependent: false })]),
    ).toBe('practicing');
  });

  it('is independent-once after one correct unaided answer', () => {
    expect(evidenceState([attempt()])).toBe('independent-once');
  });

  it('requires a DIFFERENT family for retained-on-review', () => {
    const first = attempt({ familyId: 'fam-a' });

    const sameFamily = evidenceState([
      first,
      attempt({
        id: 'a2',
        purpose: 'review',
        familyId: 'fam-a',
        at: '2026-09-10T10:00:00.000Z',
      }),
    ]);
    // The whole point of the delayed re-check: the same question in different
    // clothes tests recall of an answer, not understanding of a concept.
    expect(sameFamily).toBe('independent-once');

    const differentFamily = evidenceState([
      first,
      attempt({
        id: 'a2',
        purpose: 'review',
        familyId: 'fam-b',
        at: '2026-09-10T10:00:00.000Z',
      }),
    ]);
    expect(differentFamily).toBe('retained-on-review');
  });

  it('requires the review to come after the attempt it corroborates', () => {
    const later = attempt({ at: '2026-09-10T10:00:00.000Z' });
    const earlierReview = attempt({
      id: 'a2',
      purpose: 'review',
      familyId: 'fam-b',
      at: '2026-09-01T10:00:00.000Z',
    });
    expect(evidenceState([later, earlierReview])).toBe('independent-once');
  });

  it('returns one of exactly four states, and none of them is a number', () => {
    const states = new Set(
      [[], [attempt({ countsAsIndependent: false })], [attempt()]].map(evidenceState),
    );
    for (const state of states) {
      expect(typeof state).toBe('string');
      expect(Number.isFinite(Number(state))).toBe(false);
    }
  });

  it('points at the attempt that earned the state', () => {
    const first = attempt({ familyId: 'fam-a' });
    const review = attempt({
      id: 'a2',
      purpose: 'review',
      familyId: 'fam-b',
      at: '2026-09-10T10:00:00.000Z',
    });
    expect(earningAttempt([first, review])?.id).toBe('a2');
    expect(earningAttempt([first])?.id).toBe('a1');
    expect(earningAttempt([])).toBeNull();
  });
});
