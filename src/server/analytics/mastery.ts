import type { PlanEntry, StudyPlan } from '../../shared/contract.ts';
import { evidenceState, type RecordedAttempt } from '../learning/rules.ts';
import { isDue } from '../scheduling/fsrs.ts';

/**
 * The study plan: what to do next, and why.
 *
 * ── The name of this file is a warning, not a feature ─────────────────────
 *
 * It is called `mastery.ts` because that is where it came from in SynapseDeck,
 * and keeping the name makes the *deletion* visible: the donor computed a
 * per-topic mastery estimate and this does not, because invariant 6 forbids it.
 * What is left is the part that was always the useful half — ordering.
 *
 * ── Why every entry carries a reason ──────────────────────────────────────
 *
 * A plan that cannot say why it chose something is a plan the learner has to
 * trust blindly, and a learner who does not trust the ordering will ignore it
 * and pick a concept at random. Each `reason` below is a sentence derived from
 * the log, so it is defensible: "you answered this unaided on the 3rd, and a
 * re-check is due today" points at two rows.
 *
 * ── The ordering, and the argument for it ─────────────────────────────────
 *
 * 1. **Due re-checks first.** A re-check has an expiry in a way nothing else
 *    does: the whole point is the delay, and a re-check done a fortnight late
 *    tests something different from the one that was scheduled.
 * 2. **Then concepts with practice but no independent evidence.** These are the
 *    ones the learner has already invested in and has not yet finished.
 * 3. **Then unstarted concepts, in prerequisite order.** A concept whose
 *    prerequisites are unchecked goes after them — the map orders the work, it
 *    does not gate it. Rawi will not refuse to teach something because of a box
 *    that is not ticked.
 * 4. **Never `retained-on-review` concepts that are not due.** There is nothing
 *    to do, and offering something to do would manufacture work.
 */

export interface PlanInput {
  conceptId: string;
  conceptName: string;
  prerequisiteIds: readonly string[];
  attempts: readonly RecordedAttempt[];
  dueDate: string | null;
  /** Whether the learner has seen this concept's teaching text. */
  taught: boolean;
  /** Whether any unseen item remains. Invariant 5: no item, no offer. */
  hasUnseenItems: boolean;
}

export function buildStudyPlan(
  workspaceId: string,
  concepts: readonly PlanInput[],
  now: Date,
): StudyPlan {
  const entries: (PlanEntry & { rank: number })[] = [];
  const byId = new Map(concepts.map((concept) => [concept.conceptId, concept]));

  for (const concept of concepts) {
    const state = evidenceState(concept.attempts);
    const due = isDue(concept.dueDate, now);

    if (due && (state === 'independent-once' || state === 'retained-on-review')) {
      entries.push({
        rank: 0,
        conceptId: concept.conceptId,
        conceptName: concept.conceptName,
        action: 'review',
        reason: concept.hasUnseenItems
          ? `Due today. You solved this unaided before; this asks a different question to see whether it held.`
          : `Due today, but every question written for this concept has been used. Add a source covering it to get more.`,
        evidence: state,
        dueAt: concept.dueDate,
      });
      continue;
    }

    if (state === 'retained-on-review' || state === 'independent-once') {
      // Nothing to do. Deliberately produces no entry rather than an entry that
      // says "keep it up" — a plan is a list of actions, not encouragement.
      continue;
    }

    if (!concept.hasUnseenItems) {
      entries.push({
        rank: 3,
        conceptId: concept.conceptId,
        conceptName: concept.conceptName,
        action: 'learn',
        reason:
          'Every question written for this concept has been used, so there is nothing left to check. Re-read the explanation, or add a source that covers it.',
        evidence: state,
        dueAt: null,
      });
      continue;
    }

    if (state === 'practicing') {
      entries.push({
        rank: 1,
        conceptId: concept.conceptId,
        conceptName: concept.conceptName,
        action: concept.taught ? 'check' : 'learn',
        reason: concept.taught
          ? `${concept.attempts.length} attempt${concept.attempts.length === 1 ? '' : 's'} recorded, none yet correct without help. A check is the next thing.`
          : 'You have attempted this but not yet read the explanation.',
        evidence: state,
        dueAt: null,
      });
      continue;
    }

    // not-checked. Prerequisites first, if any of them are also unstarted.
    const blockedBy = concept.prerequisiteIds
      .map((id) => byId.get(id))
      .filter(
        (prerequisite) =>
          prerequisite && evidenceState(prerequisite.attempts) === 'not-checked',
      );

    entries.push({
      rank: blockedBy.length > 0 ? 2.5 : 2,
      conceptId: concept.conceptId,
      conceptName: concept.conceptName,
      action: 'learn',
      reason:
        blockedBy.length > 0
          ? `Not started. It builds on ${blockedBy.map((item) => item!.conceptName).join(' and ')}, so those come first — but nothing stops you starting here.`
          : 'Not started, and nothing it depends on is outstanding.',
      evidence: state,
      dueAt: null,
    });
  }

  entries.sort(
    (left, right) => left.rank - right.rank || left.conceptName.localeCompare(right.conceptName),
  );

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    entries: entries.map(({ rank: _rank, ...entry }) => entry),
    allCaughtUp: entries.length === 0,
  };
}
