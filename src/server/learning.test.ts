/**
 * Tests for the learning invariants in docs/PRODUCT.md.
 *
 * These are the rules that make Rawi's evidence mean anything. If assistance
 * could be reset, or a revealed answer could count as independent, the progress
 * shown to a learner would be a lie. Each test names the invariant it defends.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { demoLesson } from '../content/demo-lesson.js';
import {
  createSession,
  evidenceState,
  nextReviewDue,
  questionState,
  raiseAssistance,
  requestHint,
  revealAnswer,
  setStage,
  submitAttempt,
  type SessionState,
} from './learning.js';
import type { Stage } from '../shared/types.js';
import {
  clearSessions,
  questionForStage,
  toSessionView,
} from './lesson-store.js';

const NOW = new Date('2026-09-13T10:00:00.000Z');

function freshSession() {
  return createSession('s1', demoLesson);
}

/**
 * Move a session to `stage` along the declared transitions.
 *
 * R02A made stage jumps explicit, so tests that want to start "at the check"
 * must walk the path a learner actually walks. Failing loudly here is the
 * point: if a transition stops being legal, the tests that depend on it say so.
 */
function advanceTo(state: SessionState, stage: Stage): SessionState {
  const path: Record<Stage, readonly Stage[]> = {
    diagnose: [],
    learn: ['learn'],
    practice: ['learn', 'practice'],
    check: ['learn', 'practice', 'check'],
    summary: ['learn', 'practice', 'check', 'summary'],
  };
  let current = state;
  for (const step of path[stage]) {
    const next = setStage(current, step);
    if (!next) throw new Error(`illegal test transition ${current.stage} -> ${step}`);
    current = next;
  }
  return current;
}

/** setStage where the transition is expected to be legal. */
function mustSetStage(state: SessionState, stage: Stage): SessionState {
  const next = setStage(state, stage);
  if (!next) throw new Error(`illegal transition ${state.stage} -> ${stage}`);
  return next;
}

beforeEach(() => clearSessions());

describe('invariant 1: assistance is monotonic', () => {
  it('never falls back to a weaker level', () => {
    expect(raiseAssistance('revealed', 'none')).toBe('revealed');
    expect(raiseAssistance('revealed', 'hinted')).toBe('revealed');
    expect(raiseAssistance('hinted', 'none')).toBe('hinted');
  });

  it('rises through the levels in order', () => {
    expect(raiseAssistance('none', 'hinted')).toBe('hinted');
    expect(raiseAssistance('hinted', 'revealed')).toBe('revealed');
  });

  it('survives a stage change', () => {
    let state = advanceTo(freshSession(), 'practice');
    state = requestHint(state, demoLesson.practice).state;
    expect(questionState(state, demoLesson.practice.id).assistance).toBe('hinted');

    // Switching away and back must not clear the flag.
    state = mustSetStage(state, 'learn');
    state = mustSetStage(state, 'practice');
    expect(questionState(state, demoLesson.practice.id).assistance).toBe('hinted');
  });

  it('survives a reload, because the server holds it', () => {
    // A reload is a GET that re-projects the same server state.
    let state = freshSession();
    state = revealAnswer(state, demoLesson.diagnostic);
    const view = toSessionView(state, demoLesson);
    expect(view.assistance).toBe('revealed');
  });
});

describe('invariant 2: independence requires correct AND unaided', () => {
  it('records a correct unaided answer as independent', () => {
    const state = advanceTo(freshSession(), 'check');
    const { result } = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    );
    expect(result.correct).toBe(true);
    expect(result.countsAsIndependent).toBe(true);
  });

  it('does not count a correct answer that used a hint', () => {
    let state = advanceTo(freshSession(), 'practice');
    state = requestHint(state, demoLesson.practice).state;
    const { result } = submitAttempt(
      state,
      demoLesson.practice,
      'practice',
      demoLesson.practice.correctOptionId,
      NOW,
    );
    expect(result.correct).toBe(true);
    expect(result.countsAsIndependent).toBe(false);
    expect(result.assistance).toBe('hinted');
  });

  it('does not count a wrong unaided answer', () => {
    const state = advanceTo(freshSession(), 'check');
    const wrong = demoLesson.check.options.find(
      (o) => o.id !== demoLesson.check.correctOptionId,
    )!;
    const { result } = submitAttempt(state, demoLesson.check, 'check', wrong.id, NOW);
    expect(result.countsAsIndependent).toBe(false);
  });
});

describe('invariant 3: a revealed question cannot become independent evidence', () => {
  it('records an answer after reveal as assisted', () => {
    let state = advanceTo(freshSession(), 'check');
    state = revealAnswer(state, demoLesson.check);

    const { state: after, result } = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    );

    expect(result.correct).toBe(true);
    expect(result.assistance).toBe('revealed');
    expect(result.countsAsIndependent).toBe(false);
    // And the concept must not be promoted on the strength of it.
    expect(evidenceState(after.attempts, demoLesson.check.id)).toBe('practicing');
  });
});

describe('invariant 4: submission is idempotent', () => {
  it('records one attempt when the same question is submitted twice', () => {
    const state = advanceTo(freshSession(), 'check');
    const first = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    );
    expect(first.state.attempts).toHaveLength(1);

    const second = submitAttempt(
      first.state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    );
    expect(second.state.attempts).toHaveLength(1);
  });

  it('does not let a second, different answer overwrite the first result', () => {
    const state = advanceTo(freshSession(), 'check');
    const wrong = demoLesson.check.options.find(
      (o) => o.id !== demoLesson.check.correctOptionId,
    )!;

    // Learner answers wrongly first.
    const first = submitAttempt(state, demoLesson.check, 'check', wrong.id, NOW);
    expect(first.result.correct).toBe(false);

    // A replayed or retried submission with the right answer must not upgrade it.
    const second = submitAttempt(
      first.state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    );
    expect(second.result.correct).toBe(false);
    expect(second.result.countsAsIndependent).toBe(false);
    expect(second.state.attempts).toHaveLength(1);
  });
});

describe('evidence and review scheduling', () => {
  it('starts at not-checked', () => {
    expect(evidenceState([], demoLesson.check.id)).toBe('not-checked');
  });

  it('reaches independent-once only through an unaided correct check', () => {
    let state = advanceTo(freshSession(), 'check');
    state = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    ).state;
    expect(evidenceState(state.attempts, demoLesson.check.id)).toBe(
      'independent-once',
    );
  });

  it('does not promote on the practice question alone', () => {
    let state = advanceTo(freshSession(), 'practice');
    state = submitAttempt(
      state,
      demoLesson.practice,
      'practice',
      demoLesson.practice.correctOptionId,
      NOW,
    ).state;
    // Correct and unaided, but it is not the independent check item.
    expect(evidenceState(state.attempts, demoLesson.check.id)).toBe('practicing');
  });

  it('schedules review seven days out, and not before evidence exists', () => {
    expect(nextReviewDue([], demoLesson.check.id)).toBeUndefined();

    let state = advanceTo(freshSession(), 'check');
    state = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    ).state;
    expect(nextReviewDue(state.attempts, demoLesson.check.id)).toBe(
      '2026-09-20',
    );
  });

  it('crosses a month boundary correctly', () => {
    const lateInMonth = new Date('2026-09-28T22:00:00.000Z');
    let state = advanceTo(freshSession(), 'check');
    state = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      lateInMonth,
    ).state;
    expect(nextReviewDue(state.attempts, demoLesson.check.id)).toBe(
      '2026-10-05',
    );
  });
});

describe('the browser never receives unrevealed answers', () => {
  it('omits the answer and the correct option before submission', () => {
    const state = advanceTo(freshSession(), 'check');
    const view = toSessionView(state, demoLesson);

    expect(view.revealedAnswer).toBeUndefined();
    expect(view.question?.options.map((o) => o.id).sort()).toEqual(
      demoLesson.check.options.map((o) => o.id).sort(),
    );

    // No serialised field anywhere in the view may carry the answer key.
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain('correctOptionId');
    expect(serialised).not.toContain(demoLesson.check.answerExplanation);
  });

  it('omits hints the learner has not unlocked', () => {
    let state = advanceTo(freshSession(), 'practice');
    const view0 = toSessionView(state, demoLesson);
    expect(view0.revealedHints).toHaveLength(0);
    expect(JSON.stringify(view0)).not.toContain(demoLesson.practice.hints[0]!);

    state = requestHint(state, demoLesson.practice).state;
    const view1 = toSessionView(state, demoLesson);
    expect(view1.revealedHints).toEqual([demoLesson.practice.hints[0]]);
    // The second hint is still withheld.
    expect(JSON.stringify(view1)).not.toContain(demoLesson.practice.hints[1]!);
  });

  it('releases the answer once the learner has been graded', () => {
    let state = advanceTo(freshSession(), 'check');
    state = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      NOW,
    ).state;
    const view = toSessionView(state, demoLesson);
    expect(view.revealedAnswer).toBe(demoLesson.check.answerExplanation);
  });

  it('caps hints at the authored count', () => {
    let state = advanceTo(freshSession(), 'practice');
    for (let i = 0; i < 10; i += 1) {
      state = requestHint(state, demoLesson.practice).state;
    }
    const view = toSessionView(state, demoLesson);
    expect(view.revealedHints).toHaveLength(demoLesson.practice.hints.length);
  });
});

describe('stage routing', () => {
  it('maps each stage to the right question, and none to the teaching stages', () => {
    expect(questionForStage(demoLesson, 'diagnose')?.id).toBe(demoLesson.diagnostic.id);
    expect(questionForStage(demoLesson, 'practice')?.id).toBe(demoLesson.practice.id);
    expect(questionForStage(demoLesson, 'check')?.id).toBe(demoLesson.check.id);
    expect(questionForStage(demoLesson, 'learn')).toBeUndefined();
    expect(questionForStage(demoLesson, 'summary')).toBeUndefined();
  });

  it('uses a different item for practice and check', () => {
    // A check that repeats the practice question is not fresh evidence.
    expect(demoLesson.check.id).not.toBe(demoLesson.practice.id);
    expect(demoLesson.check.prompt).not.toBe(demoLesson.practice.prompt);
  });
});
