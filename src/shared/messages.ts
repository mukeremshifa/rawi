import type { ApiErrorCode, AssistanceLevel, EvidenceState } from './contract.ts';

/**
 * Every user-facing string that more than one surface says.
 *
 * ── Why they are here and not inline ──────────────────────────────────────
 *
 * Concept Bridge hardcoded its feedback strings inside the pedagogy router,
 * which meant the state machine and the copy could not be changed
 * independently — and the copy was bilingual, so the router also carried a
 * language decision it had no business making. Lifting them out leaves
 * `route.ts` deciding *what happened* and this file deciding *how to say it*.
 *
 * ── The rules these strings obey ──────────────────────────────────────────
 *
 * 1. **Nothing here is a lie.** Unknown is written as unknown. No string
 *    congratulates a learner for something the log does not show.
 * 2. **No score, no percentage, no "mastery".** Evidence is described
 *    (invariant 6). If a sentence here needs a number, it is a count of rows.
 * 3. **Every provider failure says the learner's work is saved**, because it
 *    is: the response is persisted before the model is ever called.
 * 4. Shared between client and server, so an error the Worker raises and an
 *    error the fake injects read identically.
 */

/** How each evidence state is described. Four states, four sentences. */
export const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  'not-checked': 'Not checked yet',
  practicing: 'Practising',
  'independent-once': 'Solved once, unaided',
  'retained-on-review': 'Still solid on a later, different question',
};

export const EVIDENCE_DETAIL: Record<EvidenceState, string> = {
  'not-checked': 'Nothing has been asked about this yet.',
  practicing:
    'You have worked on this, but not yet answered a check correctly without help.',
  'independent-once':
    'You answered a check correctly with no hint and no reveal. A later re-check is scheduled to see whether it holds.',
  'retained-on-review':
    'You answered a different question about this, correctly and unaided, after a delay.',
};

export const ASSISTANCE_LABEL: Record<AssistanceLevel, string> = {
  none: 'No help used',
  hinted: 'Hint used',
  revealed: 'Answer revealed',
};

/**
 * Said *before* the learner asks, not after. Ask during a check is support and
 * support is recorded; the learner finds that out while they still have the
 * choice.
 */
export const ASK_DURING_CHECK_WARNING =
  'You are in the middle of a check. Asking here counts as help, so this answer will be recorded as assisted rather than independent.';

export const ASK_NO_GROUNDING =
  'Nothing in this workspace’s sources answers that. Add a source that covers it, or ask something the sources do speak to — this will not guess.';

/** The routing feedback, one per decision the pedagogy router can make. */
export const FEEDBACK = {
  clarifyBeforeRecording:
    'I want to be sure what you mean before recording this as evidence.',
  clarifyDifferentFormat: 'Let’s check the same idea in a different format.',
  contradicted:
    'Part of that goes against what the sources say. Here is the explanation again, then a different question.',
  partiallySupported:
    'Part of the idea is there. Let’s check the missing part in another situation.',
  entryUnderstood:
    'That shows the idea. Let’s check it in a different question before it counts.',
  probeUnderstood: 'That holds up. Now practise using it.',
  practiceDone:
    'Practice saved, along with the help you used. Now try a new context unaided.',
  transferComplete:
    'You solved something new with no help. A delayed re-check is scheduled.',
  reviewComplete:
    'Recorded as a separate re-check, not merged into your earlier work.',
  sessionPartial:
    'Saved as partial. Your evidence stays exactly as it was; nothing has been lost.',
  bankExhausted:
    'Every question written for this concept has been used. Nothing will be re-served as if it were new — add a source covering this concept to get more.',
} as const;

/** What each failure code says to a person. */
export const ERROR_MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: 'You are signed out. Sign in again to continue.',
  forbidden: 'That belongs to a different account.',
  not_found: 'That is not here any more.',
  invalid_input: 'Something in that request was not valid.',
  quota_exceeded:
    'The AI allowance for this month is used up. Your work is saved, and everything already recorded stays available.',
  rate_limited:
    'The model is busy right now. Your work is saved; try again in a moment.',
  input_too_long: 'That is longer than the model can be given at once.',
  refused:
    'The model declined to answer that. Your work is saved; retrying will not change it.',
  provider_error:
    'The model could not be reached. Your work is saved; try again in a moment.',
  assessment_rejected:
    'The assessment did not hold up to checking — it quoted something you did not write — so it was thrown away rather than recorded. Your response is saved. Try again.',
  stale_request:
    'This question moved on — probably in another tab. Reload to see where you actually are.',
  item_bank_exhausted: FEEDBACK.bankExhausted,
  network: 'The request did not reach the server. Your work is saved; try again.',
  not_implemented: 'That part is not built yet.',
  internal: 'Something failed on our side. Your work is saved.',
};

/** Job stages, as sentences rather than step numbers. */
export const JOB_STAGE = {
  reading: 'Reading your source',
  chunking: 'Splitting it into searchable passages',
  indexing: 'Making it searchable',
  extracting: 'Finding the concepts in it',
  writingItems: 'Writing questions for each concept',
  done: 'Done',
} as const;

/** Empty states. Each says what to do next, not only what is absent. */
export const EMPTY = {
  workspaces: {
    title: 'No workspaces yet',
    description:
      'A workspace is one subject you are trying to understand. Everything — sources, concepts, evidence — belongs to exactly one.',
  },
  sources: {
    title: 'No sources yet',
    description:
      'Paste your course notes or upload a .txt or .md file. Everything Rawi teaches is grounded in what you add here, and it cites it.',
  },
  concepts: {
    title: 'No concepts yet',
    description:
      'Concepts are pulled out of your sources. Add a source, then extract.',
  },
  evidence: {
    title: 'Nothing recorded yet',
    description:
      'Evidence appears here after you answer a check. It records what you did and whether you did it unaided — never a score.',
  },
  plan: {
    title: 'Nothing due',
    description:
      'Every concept with evidence is either scheduled or not yet due. That is the healthy state, not an empty one.',
  },
  ask: {
    title: 'Ask about your sources',
    description:
      'Answers come only from the sources in this workspace, with citations. If the sources do not cover it, you will be told so.',
  },
} as const;
