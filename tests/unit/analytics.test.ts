import { describe, expect, it } from 'vitest';

import { buildStudyPlan } from '../../src/server/analytics/mastery.ts';
import { attemptsByDay, summarise } from '../../src/server/analytics/progress.ts';
import type { RecordedAttempt } from '../../src/server/learning/rules.ts';

const now = new Date('2026-09-15T10:00:00.000Z');

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
    at: '2026-09-14T10:00:00.000Z',
    reviewDue: '2026-09-21',
    idempotencyKey: 'k1',
    ...overrides,
  };
}

describe('summarise', () => {
  it('counts rows and nothing else', () => {
    const summary = summarise(
      'w1',
      [
        { conceptId: 'c1', attempts: [attempt()], dueDate: '2026-09-14' },
        { conceptId: 'c2', attempts: [], dueDate: null },
        {
          conceptId: 'c3',
          attempts: [attempt({ correct: false, countsAsIndependent: false })],
          dueDate: null,
        },
      ],
      now,
    );

    expect(summary.counts['independent-once']).toBe(1);
    expect(summary.counts['not-checked']).toBe(1);
    expect(summary.counts.practicing).toBe(1);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.independentAttempts).toBe(1);
    expect(summary.dueToday).toBe(1);
  });

  it('contains no field that could hold a percentage', () => {
    // Invariant 6, asserted structurally: if someone adds a `mastery` field
    // later, this fails and they have to argue with the test.
    const summary = summarise('w1', [], now);
    expect(Object.keys(summary).sort()).toEqual([
      'counts',
      'dueToday',
      'independentAttempts',
      'totalAttempts',
      'workspaceId',
    ]);
  });
});

describe('attemptsByDay', () => {
  it('includes days with no attempts as zero', () => {
    // An absent day and a day with nothing on it look identical in a chart that
    // omits both, and only one of them is true.
    const days = attemptsByDay([attempt()], 3, now);
    expect(days).toHaveLength(3);
    expect(days.map((day) => day.date)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
    expect(days[1]!.total).toBe(1);
    expect(days[2]!.total).toBe(0);
  });
});

describe('buildStudyPlan', () => {
  const base = {
    prerequisiteIds: [] as string[],
    attempts: [] as RecordedAttempt[],
    dueDate: null as string | null,
    taught: false,
    hasUnseenItems: true,
  };

  it('puts due re-checks first', () => {
    const plan = buildStudyPlan(
      'w1',
      [
        { ...base, conceptId: 'c1', conceptName: 'Unstarted' },
        {
          ...base,
          conceptId: 'c2',
          conceptName: 'Due',
          attempts: [attempt({ conceptId: 'c2' })],
          dueDate: '2026-09-14',
        },
      ],
      now,
    );
    expect(plan.entries[0]!.conceptName).toBe('Due');
    expect(plan.entries[0]!.action).toBe('review');
  });

  it('offers nothing for a concept that is settled and not due', () => {
    const plan = buildStudyPlan(
      'w1',
      [
        {
          ...base,
          conceptId: 'c1',
          conceptName: 'Done',
          attempts: [attempt()],
          dueDate: '2026-12-01',
        },
      ],
      now,
    );
    // A plan is a list of actions, not encouragement.
    expect(plan.entries).toHaveLength(0);
    expect(plan.allCaughtUp).toBe(true);
  });

  it('says so honestly when the item bank is empty', () => {
    const plan = buildStudyPlan(
      'w1',
      [{ ...base, conceptId: 'c1', conceptName: 'Empty', hasUnseenItems: false }],
      now,
    );
    expect(plan.entries[0]!.reason).toContain('every question');
  });

  it('gives every entry a reason', () => {
    const plan = buildStudyPlan(
      'w1',
      [
        { ...base, conceptId: 'c1', conceptName: 'A' },
        {
          ...base,
          conceptId: 'c2',
          conceptName: 'B',
          attempts: [attempt({ conceptId: 'c2', countsAsIndependent: false, correct: false })],
          taught: true,
        },
      ],
      now,
    );
    for (const entry of plan.entries) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it('orders a blocked prerequisite after the thing it depends on, without gating', () => {
    const plan = buildStudyPlan(
      'w1',
      [
        { ...base, conceptId: 'c1', conceptName: 'Advanced', prerequisiteIds: ['c2'] },
        { ...base, conceptId: 'c2', conceptName: 'Basic' },
      ],
      now,
    );
    expect(plan.entries.map((entry) => entry.conceptName)).toEqual(['Basic', 'Advanced']);
    // Both are still offered — the map orders the work, it does not lock it.
    expect(plan.entries).toHaveLength(2);
  });
});
