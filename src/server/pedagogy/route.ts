import type { SessionStage } from '../../shared/contract.ts';
import { FEEDBACK } from '../../shared/messages.ts';
import type { ConceptContent, Task } from '../../shared/content.ts';
import type { Assessment } from '../assessment/schema.ts';
import { selectNextItem, type SessionState } from '../learning/rules.ts';

/**
 * The routing state machine, from Concept Bridge's `lib/server/pedagogy/route.ts`.
 *
 * ── What came across unchanged, and why ───────────────────────────────────
 *
 * The `purpose` vocabulary — entry / probe / clarification / practice /
 * transfer / review — was already subject-agnostic in the donor, and the shape
 * of the decisions is the valuable part: **ambiguity is resolved before
 * anything is recorded**, contradiction routes back through teaching, partial
 * support probes the missing half, and only a `transfer` item earns a
 * scheduled re-check. None of that is about water cycles or about
 * microeconomics; it is about what you are entitled to conclude from one
 * response.
 *
 * ── What changed ──────────────────────────────────────────────────────────
 *
 * The donor hardcoded bilingual feedback strings inline, which meant the state
 * machine and the copy could not move independently and the router carried a
 * language decision it had no business making. Those strings now live in
 * `src/shared/messages.ts`; this file decides *what happened* and that file
 * decides *how to say it*.
 *
 * The donor also had a hard attempt ceiling of 10. Kept, and kept for the same
 * reason: a session that cannot converge should end honestly as `partial`
 * rather than cycling a learner through items until the bank empties.
 */

const MAX_ATTEMPTS_PER_SESSION = 10;

export interface RouteDecision {
  /** The item to offer next, or `null` when the session ends here. */
  nextTaskId: string | null;
  /** Where the session goes. */
  stage: SessionStage;
  status: 'active' | 'complete' | 'partial';
  /** Only a genuinely independent transfer earns one. */
  scheduleReview: boolean;
  feedback: { tone: 'good' | 'uncertain' | 'revisit'; text: string };
}

function firstUnseen(
  content: ConceptContent,
  purpose: Task['purpose'],
  state: SessionState,
): Task | null {
  // Invariant 5: unseen means unseen. There is deliberately no fallback to
  // "any task of this purpose" — the donor had one, and it is exactly the line
  // that would let a session re-serve something the learner has already seen.
  return selectNextItem(content.tasks, purpose, state.exposedItemIds);
}

export function chooseRoute(
  content: ConceptContent,
  task: Task,
  assessment: Assessment,
  state: SessionState,
): RouteDecision {
  if (state.attempts.length + 1 >= MAX_ATTEMPTS_PER_SESSION) {
    return {
      nextTaskId: null,
      stage: 'summary',
      status: 'partial',
      scheduleReview: false,
      feedback: { tone: 'uncertain', text: FEEDBACK.sessionPartial },
    };
  }

  // ── Ambiguity first: nothing is recorded as evidence about a response we
  //    are not sure we understood. This ordering is the donor's and it is the
  //    single most important line in the file.
  const unclear =
    assessment.interpretation_status !== 'clear' ||
    assessment.claims.some((claim) => claim.status === 'unclear');

  if (unclear) {
    const clarificationCount = state.attempts.filter(
      (attempt) => attempt.purpose === 'clarification',
    ).length;

    if (clarificationCount >= 1) {
      const alternate = firstUnseen(content, 'clarification', state);
      return alternate
        ? {
            nextTaskId: alternate.id,
            stage: 'check',
            status: 'active',
            scheduleReview: false,
            feedback: { tone: 'uncertain', text: FEEDBACK.clarifyDifferentFormat },
          }
        : {
            nextTaskId: null,
            stage: 'summary',
            status: 'partial',
            scheduleReview: false,
            feedback: { tone: 'uncertain', text: FEEDBACK.sessionPartial },
          };
    }

    const suggested = assessment.suggested_clarification_id
      ? (content.tasks.find((item) => item.id === assessment.suggested_clarification_id) ??
        null)
      : null;
    const clarification = suggested ?? firstUnseen(content, 'clarification', state);
    return {
      nextTaskId: clarification?.id ?? null,
      stage: clarification ? 'check' : 'summary',
      status: clarification ? 'active' : 'partial',
      scheduleReview: false,
      feedback: { tone: 'uncertain', text: FEEDBACK.clarifyBeforeRecording },
    };
  }

  // ── Contradiction is not omission. Teach again, then probe elsewhere.
  if (assessment.claims.some((claim) => claim.status === 'contradicted')) {
    const probe =
      firstUnseen(content, 'probe', state) ?? firstUnseen(content, 'clarification', state);
    return {
      nextTaskId: probe?.id ?? null,
      stage: probe ? 'teach' : 'summary',
      status: probe ? 'active' : 'partial',
      scheduleReview: false,
      feedback: { tone: 'revisit', text: FEEDBACK.contradicted },
    };
  }

  // ── Partial support: some of the idea is visible, some is simply absent.
  if (!assessment.claims.every((claim) => claim.status === 'supported')) {
    const probe = firstUnseen(content, 'probe', state);
    return {
      nextTaskId: probe?.id ?? null,
      stage: probe ? 'check' : 'summary',
      status: probe ? 'active' : 'partial',
      scheduleReview: false,
      feedback: { tone: 'uncertain', text: FEEDBACK.partiallySupported },
    };
  }

  // ── Everything is supported. Where that takes the session depends on what
  //    kind of item it was — which is the whole reason `purpose` exists.
  switch (task.purpose) {
    case 'transfer':
      return {
        nextTaskId: null,
        stage: 'summary',
        status: 'complete',
        // A new context, solved. This is the only path that schedules one.
        scheduleReview: true,
        feedback: { tone: 'good', text: FEEDBACK.transferComplete },
      };

    case 'review':
      return {
        nextTaskId: null,
        stage: 'summary',
        status: 'complete',
        scheduleReview: true,
        feedback: { tone: 'good', text: FEEDBACK.reviewComplete },
      };

    case 'entry': {
      const probe = firstUnseen(content, 'probe', state);
      return {
        nextTaskId: probe?.id ?? null,
        stage: probe ? 'check' : 'summary',
        status: probe ? 'active' : 'partial',
        scheduleReview: false,
        feedback: { tone: 'good', text: FEEDBACK.entryUnderstood },
      };
    }

    case 'probe':
    case 'clarification': {
      const practice = firstUnseen(content, 'practice', state);
      return {
        nextTaskId: practice?.id ?? null,
        stage: practice ? 'practice' : 'summary',
        status: practice ? 'active' : 'partial',
        scheduleReview: false,
        feedback: { tone: 'good', text: FEEDBACK.probeUnderstood },
      };
    }

    case 'practice':
    default: {
      const transfer = firstUnseen(content, 'transfer', state);
      return {
        nextTaskId: transfer?.id ?? null,
        stage: transfer ? 'check' : 'summary',
        status: transfer ? 'active' : 'partial',
        scheduleReview: false,
        feedback: { tone: 'good', text: FEEDBACK.practiceDone },
      };
    }
  }
}
