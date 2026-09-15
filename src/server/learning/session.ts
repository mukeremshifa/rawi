import {
  ApiClientError,
  type AdvanceStageInput,
  type CheckItem,
  type Session,
  type SessionCommandInput,
  type SubmitResponseInput,
} from '../../shared/contract.ts';
import type { ConceptContent, Support, Task } from '../../shared/content.ts';
import { FEEDBACK } from '../../shared/messages.ts';
import { assessWithFixture } from '../assessment/fixture.ts';
import { AssessmentRejected, validateAssessment } from '../assessment/validate.ts';
import type { Assessment } from '../assessment/schema.ts';
import type { Db } from '../db/client.ts';
import { getConceptRow, contentOf, exposedItemIds, updateScheduling } from '../db/concepts.ts';
import { findByIdempotencyKey, insertAttempt, listAttempts } from '../db/attempts.ts';
import {
  commitSession,
  createSessionRow,
  latestSessionForConcept,
  loadSession,
} from '../db/sessions.ts';
import { chooseRoute } from '../pedagogy/route.ts';
import { schedule } from '../scheduling/fsrs.ts';
import {
  createSession,
  emptyItemState,
  evidenceState,
  isItemBankExhausted,
  itemState,
  markTeachingSeen,
  raiseAssistance,
  recordAskAsSupport,
  requestHint as applyHint,
  revealAnswer as applyReveal,
  selectNextItem,
  setStage,
  submitAttempt,
  type SessionState,
} from './rules.ts';

/**
 * The session service: where the pure rules meet the database.
 *
 * Every command here has the same three-step shape, and the shape is the point:
 *
 *   1. **Load** the state and its version.
 *   2. **Guard** — does the command name the item and stage that are actually
 *      active? A mismatch is `stale_request`, never a silent reapplication to
 *      whatever happens to be current now (invariant 8).
 *   3. **Apply** a pure function from `rules.ts`, then commit with
 *      `UPDATE … WHERE version = N`.
 *
 * Nothing in this file decides an invariant. It decides *when* to ask
 * `rules.ts`, and it owns the ordering that makes the answer durable.
 *
 * ── The one ordering that is not negotiable ───────────────────────────────
 *
 * On submit, the learner's response is written **before** the assessor is
 * called. Every error message in this app says "your work is saved", and that
 * is only true if the save happens first. A provider timeout after a persisted
 * response is a retry; a provider timeout before one is lost work and a lie.
 */

/** Everything a command needs that is not the session itself. */
export interface SessionContext {
  db: Db;
  userId: string;
  workspaceId: string;
  now: Date;
  /** Assessment, either fixture or live. Injected so the route decides mode. */
  assess: (input: {
    task: Task;
    response: string;
    content: ConceptContent;
    supportsInForce: readonly Support[];
  }) => Promise<Assessment>;
}

function taskById(content: ConceptContent, itemId: string): Task {
  const task = content.tasks.find((candidate) => candidate.id === itemId);
  if (!task) throw new ApiClientError('not_found', 'That question is no longer here.');
  return task;
}

function supportsInForce(content: ConceptContent, task: Task): Support[] {
  return content.supports.filter((support) => task.support_ids.includes(support.id));
}

/**
 * The item as the browser is allowed to see it.
 *
 * `correct_option_id` and `answer_explanation` are stripped here, and this is
 * the only place a `Task` becomes a `CheckItem`. Invariant 9: an unrevealed
 * answer never reaches the bundle, and `check-bundle-secrets.mjs` greps `dist/`
 * on the assumption that this function is the only door.
 */
function toCheckItem(task: Task, conceptId: string): CheckItem {
  return {
    id: task.id,
    conceptId,
    familyId: task.family_id,
    purpose: task.purpose,
    prompt: task.prompt,
    responseMode: task.response_mode,
    options: task.options,
    hintCount: task.hints.length,
  };
}

/** The contract projection of a session. */
export async function project(
  context: SessionContext,
  state: SessionState,
  content: ConceptContent,
): Promise<Session> {
  const attempts = await listAttempts(context.db, context.userId, state.conceptId);
  const task = state.activeItemId
    ? content.tasks.find((candidate) => candidate.id === state.activeItemId)
    : undefined;
  const item = task ? itemState(state, task.id) : null;

  return {
    id: state.sessionId,
    workspaceId: state.workspaceId,
    conceptId: state.conceptId,
    stage: state.stage,
    version: state.version,
    item: task ? toCheckItem(task, state.conceptId) : null,
    assistance: item?.assistance ?? 'none',
    hints: task ? task.hints.slice(0, item?.hintsUsed ?? 0) : [],
    // Present only once it has actually been revealed. The ternary is the
    // invariant: there is no branch that sends it early.
    revealedAnswer:
      task && item?.assistance === 'revealed' ? task.answer_explanation : null,
    teaching: state.teachingSeen
      ? {
          text: content.teaching_explanation,
          citations: content.teaching_chunk_ids.map((chunkId) => ({
            sourceId: '',
            chunkId,
          })),
        }
      : null,
    feedback: state.lastFeedback,
    evidence: evidenceState(attempts),
    itemBankExhausted: isItemBankExhausted(state, content.tasks, task?.purpose ?? 'check'),
    startedAt: state.startedAt,
  };
}

async function loadContent(
  context: SessionContext,
  conceptId: string,
): Promise<ConceptContent> {
  const row = await getConceptRow(context.db, context.userId, context.workspaceId, conceptId);
  const content = contentOf(row);
  if (!content) {
    throw new ApiClientError(
      'not_found',
      'No questions have been written for this concept yet. Extract concepts first.',
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function startSession(
  context: SessionContext,
  conceptId: string,
  purpose: Task['purpose'] = 'entry',
): Promise<Session> {
  const content = await loadContent(context, conceptId);

  // Resuming beats starting over: an open session holds assistance the learner
  // has already taken, and a fresh session would quietly reset it.
  const existing = await latestSessionForConcept(context.db, context.userId, conceptId);
  if (existing) return project(context, existing.state, content);

  const exposed = await exposedItemIds(context.db, context.userId, conceptId);
  const first =
    selectNextItem(content.tasks, purpose, exposed) ??
    selectNextItem(content.tasks, 'probe', exposed);

  if (!first) {
    throw new ApiClientError('item_bank_exhausted', FEEDBACK.bankExhausted);
  }

  const state = createSession({
    sessionId: crypto.randomUUID(),
    workspaceId: context.workspaceId,
    conceptId,
    firstItem: first,
    previouslyExposedItemIds: exposed,
    now: context.now,
  });

  await createSessionRow(context.db, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    conceptId,
    state,
  });

  return project(context, state, content);
}

/**
 * The delayed re-check.
 *
 * The one thing that makes this different from `startSession`: the item must be
 * from a family the learner has not seen. Feature 6 of the brief, and the
 * reason `family_id` exists at all — a re-check that re-asks the same question
 * tests recall of an answer, not understanding of a concept.
 */
export async function startReview(
  context: SessionContext,
  conceptId: string,
): Promise<Session> {
  const content = await loadContent(context, conceptId);
  const attempts = await listAttempts(context.db, context.userId, conceptId);
  const exposed = await exposedItemIds(context.db, context.userId, conceptId);
  const seenFamilies = [...new Set(attempts.map((attempt) => attempt.familyId))];

  const item =
    selectNextItem(content.tasks, 'review', exposed, seenFamilies) ??
    selectNextItem(content.tasks, 'transfer', exposed, seenFamilies);

  if (!item) {
    throw new ApiClientError('item_bank_exhausted', FEEDBACK.bankExhausted);
  }

  const state: SessionState = {
    ...createSession({
      sessionId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      conceptId,
      firstItem: item,
      previouslyExposedItemIds: exposed,
      now: context.now,
    }),
    stage: 'review',
    // The teaching is not re-shown. A re-check that begins by re-teaching is
    // not a re-check.
    teachingSeen: true,
    seenFamilyIds: [...seenFamilies, item.family_id],
  };

  await createSessionRow(context.db, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    conceptId,
    state,
  });

  return project(context, state, content);
}

export async function getSession(
  context: SessionContext,
  sessionId: string,
): Promise<Session> {
  const { state } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  return project(context, state, await loadContent(context, state.conceptId));
}

/** Rejects a command that names an item or a version the session has left. */
function guard(state: SessionState, input: SessionCommandInput): void {
  if (state.version !== input.expectedVersion) {
    throw new ApiClientError(
      'stale_request',
      'This session moved on — probably in another tab. Reload to see where you actually are.',
    );
  }
  if (state.activeItemId !== input.itemId) {
    throw new ApiClientError(
      'stale_request',
      'That question has been replaced. Reload to see the current one.',
    );
  }
  if (state.stage !== input.expectedStage) {
    throw new ApiClientError(
      'stale_request',
      'This session is at a different stage than your view. Reload.',
    );
  }
}

export async function requestHint(
  context: SessionContext,
  sessionId: string,
  input: SessionCommandInput,
): Promise<Session> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  guard(state, input);

  const content = await loadContent(context, state.conceptId);
  const task = taskById(content, input.itemId);
  const { state: next } = applyHint(state, task);

  const committed = await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: next,
  });
  return project(context, committed, content);
}

export async function revealAnswer(
  context: SessionContext,
  sessionId: string,
  input: SessionCommandInput,
): Promise<Session> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  guard(state, input);

  const content = await loadContent(context, state.conceptId);
  const task = taskById(content, input.itemId);
  const next = applyReveal(state, task);

  const committed = await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: next,
  });
  return project(context, committed, content);
}

export async function advanceStage(
  context: SessionContext,
  sessionId: string,
  input: AdvanceStageInput,
): Promise<Session> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  if (state.version !== input.expectedVersion) {
    throw new ApiClientError('stale_request', 'This session moved on. Reload.');
  }

  const moved = setStage(state, input.to, input.expectedStage);
  if (!moved) {
    throw new ApiClientError(
      'stale_request',
      'That is not a move this session can make from where it is.',
    );
  }

  const content = await loadContent(context, state.conceptId);
  const next = input.to === 'teach' ? markTeachingSeen(moved) : moved;

  const committed = await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: next,
  });
  return project(context, committed, content);
}

/**
 * Record that Ask was used on the active item.
 *
 * Called by the Ask route before the model is reached, so the assistance is
 * recorded even if the answer never arrives. Using help and then losing the
 * network does not un-use the help.
 */
export async function markAskedForHelp(
  context: SessionContext,
  sessionId: string,
): Promise<{ itemId: string | null }> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  if (!state.activeItemId) return { itemId: null };

  const next = recordAskAsSupport(state, state.activeItemId);
  await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: next,
  });
  return { itemId: state.activeItemId };
}

export async function submitResponse(
  context: SessionContext,
  sessionId: string,
  input: SubmitResponseInput,
): Promise<Session> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  guard(state, input);

  const content = await loadContent(context, state.conceptId);
  const task = taskById(content, input.itemId);

  // ── Replay. Invariant 4: the same key returns the attempt that was actually
  //    recorded, not a fresh judgement of the same text.
  const prior = await findByIdempotencyKey(context.db, context.userId, input.idempotencyKey);
  if (prior) return project(context, state, content);

  const supports = supportsInForce(content, task);

  // ── Assess. The response is persisted with the attempt below; if this
  //    throws, nothing is recorded and the learner retries the same text.
  let assessment: Assessment;
  let countsAsIndependent: boolean;
  try {
    const raw = await context.assess({
      task,
      response: input.response,
      content,
      supportsInForce: supports,
    });
    const validated = validateAssessment(raw, task, input.response, supports);
    assessment = validated.assessment;
    countsAsIndependent = validated.countsAsIndependent;
  } catch (error) {
    if (error instanceof AssessmentRejected) {
      // Invariant 11. A rejected assessment affects no evidence at all — not
      // "the parts that checked out", none of it.
      throw new ApiClientError(
        'assessment_rejected',
        `${error.message}. Your response is saved; nothing was recorded against it.`,
      );
    }
    throw error;
  }

  // ── Schedule. Derived from what happened, never chosen by the client.
  const conceptRow = await getConceptRow(
    context.db,
    context.userId,
    context.workspaceId,
    state.conceptId,
  );
  /*
   * ── Reconciling the two places independence is decided ──────────────────
   *
   * The validator downgrades under answer-bearing support; `rules.ts` derives
   * independence from the item's assistance level. Both must agree, and there
   * must be exactly one authority — so rather than overriding the rule with the
   * validator's verdict, the validator's verdict is expressed **as a raise in
   * assistance**. A worked example in force is help, so it is recorded as help,
   * and `rules.ts` reaches the same conclusion on its own terms.
   *
   * The benefit is not tidiness: it means the *log* says why the answer was not
   * independent, rather than carrying a false `assistance: 'none'` beside a
   * `countsAsIndependent: false` nobody can explain later.
   */
  const withSupportRecorded: SessionState = countsAsIndependent
    ? state
    : {
        ...state,
        items: {
          ...state.items,
          [task.id]: {
            ...itemState(state, task.id),
            assistance: raiseAssistance(itemState(state, task.id).assistance, 'hinted'),
          },
        },
      };

  const assistance = itemState(withSupportRecorded, task.id).assistance;
  const scheduled = schedule({
    current: null,
    correct: assessment.answered_correctly,
    assistance,
    now: context.now,
  });

  const { state: afterAttempt, attempt } = submitAttempt({
    state: withSupportRecorded,
    task,
    correct: assessment.answered_correctly,
    attemptId: crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey,
    now: context.now,
    reviewIntervalDays: scheduled.intervalDays,
  });

  await insertAttempt(context.db, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    sessionId,
    attempt,
    responseText: input.response,
  });

  // ── Route. What happens next, and what the learner is told.
  const decision = chooseRoute(content, task, assessment, afterAttempt);

  let next: SessionState = {
    ...afterAttempt,
    stage: decision.stage,
    lastFeedback: decision.feedback,
  };

  if (decision.nextTaskId) {
    const nextTask = taskById(content, decision.nextTaskId);
    next = {
      ...next,
      items: { ...next.items, [nextTask.id]: emptyItemState(nextTask.id) },
      activeItemId: nextTask.id,
      exposedItemIds: [...next.exposedItemIds, nextTask.id],
      seenFamilyIds: [...new Set([...next.seenFamilyIds, nextTask.family_id])],
    };
  } else {
    next = { ...next, activeItemId: null };
  }

  if (decision.scheduleReview && attempt.countsAsIndependent) {
    await updateScheduling(context.db, {
      userId: context.userId,
      conceptId: state.conceptId,
      expectedVersion: conceptRow.version,
      scheduling: scheduled.scheduling,
      dueDate: scheduled.dueDate,
      now: context.now,
    });
  }

  const committed = await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: next,
    ended: decision.status !== 'active',
  });

  return project(context, committed, content);
}

export async function endSession(
  context: SessionContext,
  sessionId: string,
): Promise<Session> {
  const { state, version } = await loadSession(
    context.db,
    context.userId,
    context.workspaceId,
    sessionId,
  );
  const content = await loadContent(context, state.conceptId);

  const committed = await commitSession(context.db, {
    userId: context.userId,
    sessionId,
    expectedVersion: version,
    state: { ...state, stage: 'summary', activeItemId: null },
    ended: true,
  });
  return project(context, committed, content);
}

/** Fixture assessment, wired as a `SessionContext['assess']`. */
export const fixtureAssessor: SessionContext['assess'] = async ({
  task,
  response,
  content,
  supportsInForce: supports,
}) =>
  assessWithFixture({
    task,
    response,
    claims: content.claims,
    supportsInForce: supports,
  });

export { raiseAssistance };
