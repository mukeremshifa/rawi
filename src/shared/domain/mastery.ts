import { addDays, localISO } from './planner';

/**
 * Section mastery, read from marked answers.
 *
 * A described level and a review date, never a percentage. The rule is a
 * Leitner ladder over days, small enough to explain in one sentence: each day
 * the student answers a section right without a hint moves the next review
 * further out, and a day with a wrong answer brings it back to tomorrow.
 *
 * Self-marked answers (flashcards and self-checks) are attempts, but neither
 * raise nor lower mastery. A hinted right answer, or a partly right one, holds
 * the ladder where it is. Days are local, so "answered on three days" means
 * three days on the student's own calendar.
 */

export type MasteryLevel = 'not-checked' | 'shaky' | 'learning' | 'secure';

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  'not-checked': 'Not checked yet',
  shaky: 'Shaky',
  learning: 'Learning',
  secure: 'Secure',
};

export interface MarkedResult {
  score: number;
  at: Date | string;
  mode: 'practice' | 'exam' | 'self-rated' | 'tutored';
  usedHint: boolean;
}

export interface SectionMastery {
  level: MasteryLevel;
  /** Days in a row, since the last wrong answer, with a right unaided answer. */
  streak: number;
  /** Local date of the last marked answer, self-marked ones included. */
  lastDay: string | null;
  /** Local date the section is next due for review, or null before any marked answer. */
  dueOn: string | null;
  attempts: number;
  misses: number;
}

/** Days until the next review after a streak of this many right days. A miss means tomorrow. */
const INTERVALS = [1, 3, 7, 16, 35];
const RIGHT = 0.8;
const WRONG = 0.5;
/** Streak at which a section reads as secure. */
const SECURE = 3;

export function sectionMastery(results: MarkedResult[], timezone?: string): SectionMastery {
  const days = new Map<string, 'right' | 'wrong' | 'held'>();
  let lastDay: string | null = null,
    markedDay: string | null = null,
    misses = 0;
  for (const r of [...results].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) {
    const day = localISO(r.at, timezone);
    lastDay = day;
    if (r.mode === 'self-rated') continue;
    markedDay = day;
    const outcome = r.score < WRONG ? 'wrong' : r.score >= RIGHT && !r.usedHint ? 'right' : 'held';
    if (outcome === 'wrong') misses++;
    // A wrong answer settles the day. A right one counts only when nothing that day was wrong.
    const prior = days.get(day);
    if (prior !== 'wrong' && (outcome === 'wrong' || outcome === 'right' || !prior)) days.set(day, outcome);
  }
  const attempts = results.length;
  if (!markedDay) return { level: 'not-checked', streak: 0, lastDay, dueOn: null, attempts, misses };
  let streak = 0,
    missedLast = false;
  for (const outcome of days.values()) {
    if (outcome === 'wrong') {
      streak = 0;
      missedLast = true;
    } else if (outcome === 'right') {
      streak++;
      missedLast = false;
    }
  }
  const interval = streak ? INTERVALS[Math.min(streak, INTERVALS.length) - 1]! : 1;
  const level: MasteryLevel = missedLast ? 'shaky' : streak >= SECURE ? 'secure' : 'learning';
  return { level, streak, lastDay, dueOn: addDays(markedDay, interval), attempts, misses };
}

/** Whether a section is due for review on a local date. Unchecked sections are not reviews. */
export const isDue = (m: SectionMastery, today: string) => !!m.dueOn && m.dueOn <= today;
