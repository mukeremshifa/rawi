import { describe, expect, it } from 'vitest';

import {
  canTransition,
  isItemBankExhausted,
  replaceActiveItem,
  selectNextItem,
  setStage,
} from '../../src/server/learning/rules.ts';

import { task, sessionWith } from './fixtures.ts';

/**
 * Invariants 5 and 8.
 *
 *   5. Exhausting the item bank is an honest terminal state. The server never
 *      recycles a seen item as fresh.
 *   8. Commands act on the item and stage they name.
 */

describe('invariant 5 — the bank is never recycled', () => {
  const tasks = [
    task('t1', { purpose: 'probe', family_id: 'fam-a' }),
    task('t2', { purpose: 'probe', family_id: 'fam-b' }),
  ];

  it('never returns an item that has been exposed', () => {
    expect(selectNextItem(tasks, 'probe', [])?.id).toBe('t1');
    expect(selectNextItem(tasks, 'probe', ['t1'])?.id).toBe('t2');
    expect(selectNextItem(tasks, 'probe', ['t1', 't2'])).toBeNull();
  });

  it('returns null rather than relaxing the family filter', () => {
    // The donor router fell back to "any task of this purpose" when nothing
    // unseen matched. That line is the one that re-serves a seen item, and it
    // is deliberately absent here.
    expect(selectNextItem(tasks, 'probe', [], ['fam-a', 'fam-b'])).toBeNull();
  });

  it('reports exhaustion rather than looping', () => {
    const state = sessionWith(tasks[0]!);
    expect(isItemBankExhausted(state, tasks, 'probe')).toBe(false);
    const exhausted = { ...state, exposedItemIds: ['t1', 't2'] };
    expect(isItemBankExhausted(exhausted, tasks, 'probe')).toBe(true);
  });

  it('replacing an item retires it and invents no graded attempt', () => {
    const state = sessionWith(tasks[0]!);
    const next = replaceActiveItem(state, tasks, 't1', 'probe');

    expect(next).not.toBeNull();
    expect(next!.activeItemId).toBe('t2');
    // Retired, permanently, so it can never count as an unseen check.
    expect(next!.items['t1']!.assistance).toBe('revealed');
    // And nothing was recorded: the learner did not answer it.
    expect(next!.attempts).toHaveLength(0);
  });

  it('returns null when there is no replacement, rather than reusing one', () => {
    const state = { ...sessionWith(tasks[0]!), exposedItemIds: ['t1', 't2'] };
    expect(replaceActiveItem(state, tasks, 't1', 'probe')).toBeNull();
  });

  it('rejects a replacement request naming a different item', () => {
    const state = sessionWith(tasks[0]!);
    expect(replaceActiveItem(state, tasks, 't2', 'probe')).toBeNull();
  });
});

describe('invariant 8 — commands name the stage they were built against', () => {
  it('rejects a command whose expected stage is stale', () => {
    const state = sessionWith(task('t1'));
    // The session is at `diagnose`; a tab that thought it was at `practice`
    // must not have its command applied to a different stage.
    expect(setStage(state, 'check', 'practice')).toBeNull();
  });

  it('allows the declared forward path and going back to teaching', () => {
    expect(canTransition('diagnose', 'teach')).toBe(true);
    expect(canTransition('teach', 'practice')).toBe(true);
    expect(canTransition('practice', 'check')).toBe(true);
    expect(canTransition('check', 'summary')).toBe(true);
    // Rereading an explanation is not cheating.
    expect(canTransition('check', 'teach')).toBe(true);
  });

  it('refuses to skip teaching and land on a check', () => {
    expect(canTransition('diagnose', 'check')).toBe(false);
    expect(canTransition('teach', 'check')).toBe(false);
  });

  it('treats a repeated navigation as a no-op rather than an error', () => {
    expect(canTransition('check', 'check')).toBe(true);
    const state = { ...sessionWith(task('t1')), stage: 'check' as const };
    expect(setStage(state, 'check', 'check')).toBe(state);
  });
});
