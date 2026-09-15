import type { EvidenceSummary } from '../../shared/contract.ts';
import { evidenceState, type RecordedAttempt } from '../learning/rules.ts';
import { isDue } from '../scheduling/fsrs.ts';

/**
 * Everything the app is willing to say about progress, derived from the
 * append-only log.
 *
 * ── Read from the log; estimate nothing ───────────────────────────────────
 *
 * This is the rule the whole module exists to keep. Every number below is a row
 * count over attempts the server actually recorded. There is no smoothing, no
 * projection, no "based on your pace", and no decay curve. If something has not
 * been observed, the answer is a smaller number, not an inferred one.
 *
 * The donor's `progress.ts` and `mastery.ts` computed retention curves and
 * per-topic mastery estimates. Those came across as *counts* and nothing more,
 * because invariant 6 forbids the interesting half: a mastery percentage is a
 * claim about what someone knows, and this product does not make that claim.
 * What it will say is "four concepts have a correct unaided answer on record",
 * which you could verify by reading four rows.
 */

export interface ConceptAttempts {
  conceptId: string;
  attempts: readonly RecordedAttempt[];
  dueDate: string | null;
}

export function summarise(
  workspaceId: string,
  concepts: readonly ConceptAttempts[],
  now: Date,
): EvidenceSummary {
  const counts = {
    'not-checked': 0,
    practicing: 0,
    'independent-once': 0,
    'retained-on-review': 0,
  };

  let totalAttempts = 0;
  let independentAttempts = 0;
  let dueToday = 0;

  for (const concept of concepts) {
    counts[evidenceState(concept.attempts)] += 1;
    totalAttempts += concept.attempts.length;
    independentAttempts += concept.attempts.filter(
      (attempt) => attempt.countsAsIndependent,
    ).length;
    if (isDue(concept.dueDate, now)) dueToday += 1;
  }

  return { workspaceId, counts, totalAttempts, independentAttempts, dueToday };
}

/**
 * Attempts per day, for the evidence view's activity strip.
 *
 * Days with no attempts are present with a zero — an absent day and a day with
 * nothing on it look identical in a chart that omits both, and only one of them
 * is true.
 */
export function attemptsByDay(
  attempts: readonly RecordedAttempt[],
  days: number,
  now: Date,
): { date: string; total: number; independent: number }[] {
  const buckets = new Map<string, { total: number; independent: number }>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    buckets.set(day, { total: 0, independent: 0 });
  }

  for (const attempt of attempts) {
    const day = attempt.at.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    bucket.total += 1;
    if (attempt.countsAsIndependent) bucket.independent += 1;
  }

  return [...buckets.entries()].map(([date, bucket]) => ({ date, ...bucket }));
}
