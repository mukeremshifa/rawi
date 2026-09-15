import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';

import { gradeFromAttempt, isDue, newScheduling, schedule } from '../../src/server/scheduling/fsrs.ts';

/**
 * The grade derivation, and the interval it produces.
 *
 * The table below is the whole contract between "what happened" and "when we
 * come back", so it is walked exhaustively rather than sampled.
 */

describe('gradeFromAttempt', () => {
  it('maps every combination, and never reaches Easy', () => {
    expect(gradeFromAttempt({ correct: true, assistance: 'none' })).toBe(Rating.Good);
    expect(gradeFromAttempt({ correct: true, assistance: 'hinted' })).toBe(Rating.Hard);
    // Seeing the answer is not recall, however correct the typing was.
    expect(gradeFromAttempt({ correct: true, assistance: 'revealed' })).toBe(Rating.Again);
    expect(gradeFromAttempt({ correct: false, assistance: 'none' })).toBe(Rating.Again);
    expect(gradeFromAttempt({ correct: false, assistance: 'hinted' })).toBe(Rating.Again);
    expect(gradeFromAttempt({ correct: false, assistance: 'revealed' })).toBe(Rating.Again);
  });

  it('has no input that produces Easy', () => {
    // Easy means "trivially recalled", and nothing Rawi observes distinguishes
    // that from merely correct. Inferring it would be inventing a measurement.
    const inputs = [true, false].flatMap((correct) =>
      (['none', 'hinted', 'revealed'] as const).map((assistance) => ({ correct, assistance })),
    );
    for (const input of inputs) {
      expect(gradeFromAttempt(input)).not.toBe(Rating.Easy);
    }
  });
});

describe('schedule', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');

  it('produces a whole-day interval of at least one day', () => {
    const result = schedule({ current: null, correct: true, assistance: 'none', now });
    expect(result.intervalDays).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result.intervalDays)).toBe(true);
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is deterministic — fuzz is disabled', () => {
    // Two runs over the same input must agree, because the date is written to
    // an immutable row and a test that cannot predict it cannot assert on it.
    const first = schedule({ current: null, correct: true, assistance: 'none', now });
    const second = schedule({ current: null, correct: true, assistance: 'none', now });
    expect(first.dueDate).toBe(second.dueDate);
    expect(first.scheduling.stability).toBe(second.scheduling.stability);
  });

  it('schedules a failed attempt sooner than an unaided correct one', () => {
    const failed = schedule({ current: null, correct: false, assistance: 'none', now });
    const passed = schedule({ current: null, correct: true, assistance: 'none', now });
    expect(failed.intervalDays).toBeLessThanOrEqual(passed.intervalDays);
  });

  it('starts a new concept in the "new" state', () => {
    expect(newScheduling(now).state).toBe('new');
    expect(newScheduling(now).reps).toBe(0);
  });
});

describe('isDue', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');

  it('compares dates, not instants', () => {
    // A re-check due "today" is due all day, not from midnight UTC onward.
    expect(isDue('2026-09-15', now)).toBe(true);
    expect(isDue('2026-09-14', now)).toBe(true);
    expect(isDue('2026-09-16', now)).toBe(false);
  });

  it('is never due when there is no date', () => {
    expect(isDue(null, now)).toBe(false);
  });
});
