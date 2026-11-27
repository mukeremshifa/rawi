import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../shared/contracts/tutor';
import { answerKey, responseText } from '../../shared/domain/answer-review';
import {
  courses,
  tutorMessages,
  tutorSessions,
  topics,
  aiOperations,
  plannedSessions,
  scopes,
  runAnswers,
  learningRuns,
  preferences,
} from '../db/schema';
import { citationBlocks, validateCitation } from './materials';
import { spansText } from '../../shared/domain/document-text';
import { operation, attempt, readRun } from './learning';
import { queueReply, recoverReplies } from './ai/tutor';
import { nextMove, nextReview, opening, ranked, recentTurns, type Ranking } from './guide';
import { reads } from '../db/reads';
import { summariseTutorTurns } from '../../shared/domain/tutor-summary';
import type { writeInput } from '../../shared/contracts/learning';
import { bumpPlanner } from './planning';
import { getCourse } from './workspace';
import { sectionTopic } from './outline/links';
import { conflict, notFound, ApiError } from '../errors';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { detectLanguage } from './knowledge/language';

type Db = ReadDb | Transaction;
async function ownSession(db: Db, workspaceId: string, id: string, lock = false) {
  const query = db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, id)));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw notFound();
  const { workspaceId: _workspace, ...session } = row;
  return session;
}
export async function listSessions(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const [pivot] = cursor
    ? await db
        .select({ at: sql<string>`${tutorSessions.createdAt}::text` })
        .from(tutorSessions)
        .where(
          and(
            eq(tutorSessions.workspaceId, workspaceId),
            eq(tutorSessions.courseId, courseId),
            eq(tutorSessions.id, cursor),
          ),
        )
    : [];
  if (cursor && !pivot) throw notFound();
  const rows = await db
    .select()
    .from(tutorSessions)
    .where(
      and(
        eq(tutorSessions.workspaceId, workspaceId),
        eq(tutorSessions.courseId, courseId),
        pivot
          ? sql`(${tutorSessions.createdAt}, ${tutorSessions.id}) < (${pivot.at}::timestamptz, ${cursor}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(tutorSessions.createdAt), desc(tutorSessions.id))
    .limit(limit + 1);
  return {
    sessions: rows.slice(0, limit).map(({ workspaceId: _w, ...row }) => row),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
  };
}
export async function detail(db: Db, workspaceId: string, id: string, cursor = -1, ranking?: Ranking) {
  // The session, its messages, and what the guide needs to start from, in one round trip.
  const r = await reads(db, {
    session: db
      .select()
      .from(tutorSessions)
      .where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, id))),
    pending: db
      .select({ id: aiOperations.id })
      .from(aiOperations)
      .where(
        and(
          eq(aiOperations.workspaceId, workspaceId),
          eq(aiOperations.targetId, id),
          eq(aiOperations.task, 'tutor'),
          inArray(aiOperations.state, ['queued', 'running']),
        ),
      )
      .orderBy(desc(aiOperations.createdAt))
      .limit(1),
    messages: db
      .select()
      .from(tutorMessages)
      .where(
        and(
          eq(tutorMessages.workspaceId, workspaceId),
          eq(tutorMessages.sessionId, id),
          gt(tutorMessages.ordinal, cursor),
        ),
      )
      .orderBy(asc(tutorMessages.ordinal))
      .limit(51),
    turns: recentTurns(db, workspaceId, id),
    scope: db
      .select()
      .from(scopes)
      .where(
        and(
          eq(scopes.workspaceId, workspaceId),
          sql`${scopes.id} = (select ${tutorSessions.scopeId} from ${tutorSessions} where ${tutorSessions.id} = ${id})`,
        ),
      ),
    prefs: db
      .select({ timezone: preferences.timezone })
      .from(preferences)
      .where(eq(preferences.workspaceId, workspaceId)),
  });
  const [row] = r.session;
  if (!row) throw notFound();
  const { workspaceId: _workspace, ...session } = row;
  const [pending] = r.pending;
  const rows = r.messages;
  // The guide reads the learner model, so a failure there leaves the session readable without a next step.
  const full = { ...session, workspaceId };
  const known = { scope: r.scope[0], timezone: r.prefs[0]?.timezone ?? 'UTC' };
  const rank =
    ranking ??
    (!session.endedAt && (pending || session.archived)
      ? undefined
      : await ranked(db, full, known).catch(() => undefined));
  const [next, review] = await Promise.all([
    pending || !rank ? null : nextMove(db, full, rank, r.turns).catch(() => null),
    session.endedAt && rank ? nextReview(db, full, rank).catch(() => null) : null,
  ]);
  const messages = rows.slice(0, 50);
  // The questions the tutor asked in these messages come with them, so the page does not ask for each.
  const runIds = [...new Set(messages.flatMap(m => (m.provenance?.check ? [m.provenance.check.runId] : [])))];
  const runs = [];
  for (const runId of runIds) runs.push(await readRun(db, workspaceId, runId).catch(() => null));
  return {
    session,
    next,
    nextReview: review,
    summary: session.endedAt ? await sessionSummary(db, workspaceId, session) : null,
    messages: messages.map(({ workspaceId: _w, courseId: _c, sessionId: _s, ...m }) => m),
    runs: runs.filter(r => r !== null),
    nextCursor: rows.length > 50 ? rows[49]!.ordinal : null,
    pendingReply: pending?.id ?? null,
  };
}
export async function createSession(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof newTutorInput>,
) {
  return operation(db, workspaceId, input.id, { action: 'tutor-session', courseId, input }, async tx => {
    // The course, the topic and the planned session it names, checked in one round trip.
    const own = await reads(tx, {
      course: tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, courseId))),
      topic: tx
        .select({ title: topics.title })
        .from(topics)
        .where(
          and(
            eq(topics.workspaceId, workspaceId),
            eq(topics.courseId, courseId),
            input.topicId ? eq(topics.id, input.topicId) : sql`false`,
          ),
        ),
      planned: tx
        .select({ content: plannedSessions.content })
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.workspaceId, workspaceId),
            eq(plannedSessions.courseId, courseId),
            input.plannedSessionId ? eq(plannedSessions.id, input.plannedSessionId) : sql`false`,
          ),
        ),
    });
    if (!own.course.length) throw notFound();
    // A session is about a topic, or about a source that may sit in no topic.
    let topicId = input.topicId ?? null,
      topicLabel: string | null = own.topic[0]?.title ?? null;
    if (input.plannedSessionId && own.planned[0]?.content.activity !== 'tutor') throw notFound();
    if (input.source) {
      await validateCitation(tx, workspaceId, courseId, input.source);
      if (!topicId) {
        const section = await sectionTopic(tx, { workspaceId, courseId }, input.source);
        topicId = section.topicId;
        topicLabel = section.title;
      }
    }
    let review = null;
    if (input.review) {
      const a = await attempt(tx, workspaceId, input.review.attemptId);
      if (a.courseId !== courseId) throw notFound();
      const q = a.questions.find(q => q.question.id === input.review!.questionId);
      if (!q || (input.topicId && q.question.topicId !== input.topicId)) throw notFound();
      const question = q.question;
      const result = q.result;
      topicId ??= question.topicId ?? null;
      topicLabel ??= question.topicLabel ?? null;
      review = {
        attemptId: a.id,
        questionId: question.id,
        courseId,
        ...(topicId ? { topicId } : {}),
        prompt: question.prompt,
        response: responseText(result.response, question),
        answerKey: answerKey(question),
        feedback: question.explanation,
        marksAwarded: result.marksAwarded,
        marksAvailable: result.marksAvailable,
        usedHint: result.usedHint,
      };
    }
    if (input.topicId && !topicLabel) throw notFound();
    let scopeId = input.scopeId ?? null;
    if (scopeId) {
      const [scope] = await tx
        .select({ id: scopes.id, topicId: scopes.topicId, name: scopes.name })
        .from(scopes)
        .where(and(eq(scopes.workspaceId, workspaceId), eq(scopes.courseId, courseId), eq(scopes.id, scopeId)));
      if (!scope) throw notFound();
      topicId ??= scope.topicId;
      topicLabel ??= scope.name;
    } else if (topicId) {
      // A topic session works on the topic's scope, made on first use like any topic scope. One round trip either way.
      const insert = tx
        .insert(scopes)
        .values({ id: crypto.randomUUID(), workspaceId, courseId, name: topicLabel ?? 'Topic', kind: 'topic', topicId })
        .onConflictDoNothing()
        .returning({ id: scopes.id });
      const found = await tx.execute(
        sql`with made as (${insert.getSQL()}) select id from made union all select ${scopes.id} from ${scopes} where ${scopes.courseId} = ${courseId} and ${scopes.kind} = 'topic' and ${scopes.topicId} = ${topicId} limit 1`,
      );
      scopeId = (found.rows[0] as { id: string } | undefined)?.id ?? null;
    }
    const focus = input.source ? await citationBlocks(tx, workspaceId, courseId, input.source) : null;
    const heading = focus?.blocks.find(b => b.type === 'heading');
    const title = (
      input.title ||
      topicLabel ||
      (heading?.type === 'heading' ? spansText(heading.content.spans) : '') ||
      focus?.title ||
      'Tutor session'
    ).slice(0, 200);
    if (!topicId && !scopeId && !input.source && !review)
      throw new ApiError(400, 'invalid_input', 'Choose a topic, or start the session from a section of a material.');
    const [saved] = await tx
      .insert(tutorSessions)
      .values({
        id: input.id,
        workspaceId,
        courseId,
        plannedSessionId: input.plannedSessionId,
        topicId,
        topicLabel,
        scopeId,
        title,
        source: input.source ?? null,
        review,
      })
      .onConflictDoNothing()
      .returning();
    if (!saved) throw notFound();
    // The ranking written into the opening is the one the first step comes from.
    const ranking = input.guided ? await ranked(tx, saved) : undefined;
    if (ranking)
      await tx.insert(tutorMessages).values({
        id: crypto.randomUUID(),
        workspaceId,
        courseId,
        sessionId: saved.id,
        ordinal: 0,
        role: 'tutor',
        state: 'complete',
        text: opening(ranking, topicLabel ?? title),
        operationId: crypto.randomUUID(),
        provenance: { model: 'none', stage: 'orient', citations: [], droppedCitations: 0 },
      });
    return detail(tx, workspaceId, saved.id, -1, ranking);
  });
}
/**
 * Save a student's question with its reply operation already claimed, so the reply streams straight
 * after it in the same request. Returns the session and the saved message, not the transcript the
 * page already holds.
 */
export async function saveMessage(
  db: SocketDb,
  workspaceId: string,
  id: string,
  input: z.infer<typeof tutorMessageInput>,
) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-message', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true);
    if (session.revision !== input.expectedRevision) throw conflict();
    if (session.endedAt)
      throw new ApiError(409, 'session_ended', 'This session has ended. Start a new session to continue studying.');
    if (session.archived) throw new ApiError(409, 'archived', 'Restore the session before adding messages.');
    // A reply whose Worker went away would otherwise hold the session busy for good, so an active
    // reply is checked for staleness before it blocks the question.
    let [active] = await tx
      .select({ id: aiOperations.id })
      .from(aiOperations)
      .where(
        and(
          eq(aiOperations.workspaceId, workspaceId),
          eq(aiOperations.targetId, id),
          inArray(aiOperations.state, ['queued', 'running']),
        ),
      )
      .limit(1);
    if (active && (await recoverReplies(tx, { workspaceId, sessionId: id })))
      [active] = await tx
        .select({ id: aiOperations.id })
        .from(aiOperations)
        .where(
          and(
            eq(aiOperations.workspaceId, workspaceId),
            eq(aiOperations.targetId, id),
            inArray(aiOperations.state, ['queued', 'running']),
          ),
        )
        .limit(1);
    if (active)
      throw new ApiError(
        409,
        'tutor_busy',
        'A reply is still being written. Wait for it before sending another question.',
      );
    const [message] = await tx
      .insert(tutorMessages)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        courseId: session.courseId,
        sessionId: id,
        ordinal: sql`(select coalesce(max(m.ordinal), -1) + 1 from tutor_messages m where m.session_id = ${id})`,
        text: input.text,
        role: 'student',
        state: 'pending',
        operationId: input.operationId,
        failure: null,
      })
      .returning();
    await queueReply(tx, workspaceId, session, input.operationId, {
      text: input.text,
      action: input.action,
      ...(input.focus ? { focus: input.focus } : {}),
      ...(input.reply ? { reply: input.reply } : {}),
    });
    // Asking in Arabic, or for an explanation in Arabic, while a bank question waits is language support.
    if (input.reply || detectLanguage(input.text) === 'ar') await markLanguageSupport(tx, id);
    const [updated] = await tx
      .update(tutorSessions)
      .set({ revision: session.revision + 1, updatedAt: new Date() })
      .where(eq(tutorSessions.id, id))
      .returning();
    const { workspaceId: _w, ...visible } = updated!;
    const { workspaceId: _mw, courseId: _c, sessionId: _s, ...saved } = message!;
    return { session: visible, message: saved, pendingReply: input.operationId };
  });
}
/** Record language support on the session's open bank question, if one waits for an answer. */
async function markLanguageSupport(tx: Transaction, sessionId: string) {
  const [message] = await tx
    .select({ provenance: tutorMessages.provenance })
    .from(tutorMessages)
    .where(and(eq(tutorMessages.sessionId, sessionId), sql`${tutorMessages.provenance} ? 'check'`))
    .orderBy(desc(tutorMessages.ordinal))
    .limit(1);
  const check = message?.provenance?.check;
  if (!check) return;
  const [run] = await tx
    .select({ workspaceId: learningRuns.workspaceId, courseId: learningRuns.courseId, setId: learningRuns.setId })
    .from(learningRuns)
    .where(eq(learningRuns.id, check.runId));
  if (!run) return;
  await tx
    .insert(runAnswers)
    .values({ ...run, runId: check.runId, itemId: check.itemId, response: { kind: 'none' }, languageSupport: true })
    .onConflictDoUpdate({
      target: [runAnswers.runId, runAnswers.itemId],
      set: { languageSupport: true },
      setWhere: sql`${runAnswers.checked} = false`,
    });
}
/** What the tutor remembers about the student in a course. */
export async function tutorNotes(db: Db, workspaceId: string, courseId: string) {
  await getCourse(db, workspaceId, courseId);
  const [row] = await db
    .select({ notes: courses.tutorNotes, at: courses.tutorNotesAt })
    .from(courses)
    .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, courseId)));
  return { notes: row?.notes ?? null, updatedAt: row?.notes ? (row.at?.toISOString() ?? null) : null };
}
/** Forget the notes. The time is kept, so notes a session is writing at this moment are not saved over the clearing. */
export async function clearNotes(db: SocketDb, workspaceId: string, courseId: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'clear-tutor-notes', courseId }, async tx => {
    await getCourse(tx, workspaceId, courseId);
    await tx
      .update(courses)
      .set({ tutorNotes: null, tutorNotesAt: new Date() })
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, courseId)));
    return tutorNotes(tx, workspaceId, courseId);
  });
}
export async function patchSession(
  db: SocketDb,
  workspaceId: string,
  id: string,
  input: z.infer<typeof tutorMetadataInput>,
) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-metadata', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true);
    if (session.revision !== input.expectedRevision) throw conflict();
    await tx
      .update(tutorSessions)
      .set({ title: input.title, archived: input.archived, revision: session.revision + 1, updatedAt: new Date() })
      .where(eq(tutorSessions.id, id));
    return detail(tx, workspaceId, id);
  });
}

async function messageCounts(db: Db, workspaceId: string, id: string) {
  return db
    .select({
      role: tutorMessages.role,
      state: tutorMessages.state,
      stage: sql<SessionStage | null>`${tutorMessages.provenance}->>'stage'`,
      count: sql<number>`count(*)::int`,
    })
    .from(tutorMessages)
    .where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id)))
    .groupBy(tutorMessages.role, tutorMessages.state, sql`${tutorMessages.provenance}->>'stage'`);
}
type SessionStage = Awaited<ReturnType<typeof ownSession>>['stage'];
async function sessionSummary(db: Db, workspaceId: string, session: Awaited<ReturnType<typeof ownSession>>) {
  const counts = await messageCounts(db, workspaceId, session.id);
  return summariseTutorTurns({
    id: session.id,
    courseId: session.courseId,
    scopeId: session.scopeId,
    topicId: session.topicId,
    stage: session.stage,
    stages: counts.flatMap(m => (m.stage && m.state === 'complete' ? [m.stage] : [])),
    studentTurns: counts.filter(m => m.role === 'student').reduce((n, m) => n + m.count, 0),
  });
}
export async function endSession(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof writeInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'end-tutor', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true);
    if (session.endedAt) return detail(tx, workspaceId, id);
    if (session.revision !== input.expectedRevision) throw conflict();
    await recoverReplies(tx, { workspaceId, sessionId: id });
    const [running] = await tx
      .select({ id: aiOperations.id })
      .from(aiOperations)
      .where(
        and(
          eq(aiOperations.workspaceId, workspaceId),
          eq(aiOperations.targetId, id),
          inArray(aiOperations.state, ['queued', 'running']),
        ),
      )
      .limit(1);
    if (running) throw new ApiError(409, 'tutor_busy', 'Wait for the reply to finish before ending this session.');
    const counts = await messageCounts(tx, workspaceId, id);
    const complete = counts.filter(m => m.state === 'complete');
    const completedLearning =
      complete.filter(m => m.role === 'student').reduce((n, m) => n + m.count, 0) >= 2 &&
      complete.some(m => m.role === 'tutor' && m.count > 0);
    const endedAt = new Date();
    await tx
      .update(tutorSessions)
      .set({ endedAt, completedLearning, updatedAt: endedAt, revision: session.revision + 1 })
      .where(eq(tutorSessions.id, id));
    if (completedLearning && session.plannedSessionId) {
      const [planned] = await tx
        .select()
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.workspaceId, workspaceId),
            eq(plannedSessions.courseId, session.courseId),
            eq(plannedSessions.id, session.plannedSessionId),
          ),
        )
        .for('update');
      if (planned && !planned.content.completedBy)
        await tx
          .update(plannedSessions)
          .set({
            content: { ...planned.content, status: 'completed', completedBy: id, completedAt: endedAt.toISOString() },
            revision: planned.revision + 1,
          })
          .where(eq(plannedSessions.id, planned.id));
    }
    await bumpPlanner(tx, workspaceId);
    return detail(tx, workspaceId, id);
  });
}
