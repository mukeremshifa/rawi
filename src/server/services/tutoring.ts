import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../shared/contracts/tutor';
import { answerKey, responseText } from '../../shared/domain/answer-review';
import { tutorMessages, tutorSessions, topics, aiOperations, plannedSessions, scopes } from '../db/schema';
import { citationBlocks, validateCitation } from './materials';
import { spansText } from '../../shared/domain/document-text';
import { operation, attempt } from './learning';
import { queueReply, recoverReplies } from './ai/tutor';
import { summariseTutorTurns } from '../../shared/domain/tutor-summary';
import type { writeInput } from '../../shared/contracts/learning';
import { bumpPlanner } from './planning';
import { getCourse } from './workspace';
import { sectionTopic } from './outline/links';
import { conflict, notFound, ApiError } from '../errors';
import type { ReadDb, SocketDb, Transaction } from '../db/client';

type Db = ReadDb | Transaction;
async function ownSession(db: Db, workspaceId: string, id: string, lock = false) {
  const query = db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, id)));
  const [row] = await (lock ? query.for('update') : query); if (!row) throw notFound();
  const { workspaceId: _workspace, ...session } = row; return session;
}
export async function listSessions(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const [pivot] = cursor ? await db.select({ at: sql<string>`${tutorSessions.createdAt}::text` }).from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.courseId, courseId), eq(tutorSessions.id, cursor))) : [];
  if (cursor && !pivot) throw notFound();
  const rows = await db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.courseId, courseId), pivot ? sql`(${tutorSessions.createdAt}, ${tutorSessions.id}) < (${pivot.at}::timestamptz, ${cursor}::uuid)` : undefined)).orderBy(desc(tutorSessions.createdAt), desc(tutorSessions.id)).limit(limit + 1);
  return { sessions: rows.slice(0, limit).map(({ workspaceId: _w, ...row }) => row), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function detail(db: Db, workspaceId: string, id: string, cursor = -1) {
  const session = await ownSession(db, workspaceId, id);
  const [pending] = await db.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), eq(aiOperations.task, 'tutor'), inArray(aiOperations.state, ['queued', 'running']))).orderBy(desc(aiOperations.createdAt)).limit(1);
  const rows = await db.select().from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id), gt(tutorMessages.ordinal, cursor))).orderBy(asc(tutorMessages.ordinal)).limit(51);
  return { session, summary: session.endedAt ? await sessionSummary(db, workspaceId, session) : null, messages: rows.slice(0, 50).map(({ workspaceId: _w, courseId: _c, sessionId: _s, ...m }) => m), nextCursor: rows.length > 50 ? rows[49]!.ordinal : null, pendingReply: pending?.id ?? null };
}
export async function createSession(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof newTutorInput>) {
  return operation(db, workspaceId, input.id, { action: 'tutor-session', courseId, input }, async tx => {
    await getCourse(tx, workspaceId, courseId);
    // A session is about a topic, or about a source that may sit in no topic.
    let topicId = input.topicId ?? null, topicLabel: string | null = null;
    if (input.topicId) {
      const [topic] = await tx.select().from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
      topicLabel = topic?.title ?? null;
    }
    if (input.plannedSessionId) {
      const [planned] = await tx.select().from(plannedSessions).where(and(eq(plannedSessions.workspaceId, workspaceId), eq(plannedSessions.courseId, courseId), eq(plannedSessions.id, input.plannedSessionId)));
      if (!planned || planned.content.activity !== 'tutor') throw notFound();
    }
    if (input.source) {
      await validateCitation(tx, workspaceId, courseId, input.source);
      if (!topicId) { const section = await sectionTopic(tx, { workspaceId, courseId }, input.source); topicId = section.topicId; topicLabel = section.title; }
    }
    let review = null;
    if (input.review) {
      const a = await attempt(tx, workspaceId, input.review.attemptId); if (a.courseId !== courseId) throw notFound();
      const q = a.questions.find(q => q.question.id === input.review!.questionId); if (!q || (input.topicId && q.question.topicId !== input.topicId)) throw notFound();
      const question = q.question; const result = q.result;
      topicId ??= question.topicId ?? null;
      topicLabel ??= question.topicLabel ?? null;
      review = { attemptId: a.id, questionId: question.id, courseId, ...(topicId ? { topicId } : {}), prompt: question.prompt, response: responseText(result.response, question), answerKey: answerKey(question), feedback: question.explanation, marksAwarded: result.marksAwarded, marksAvailable: result.marksAvailable, usedHint: result.usedHint };
    }
    if (input.topicId && !topicLabel) throw notFound();
    let scopeId = input.scopeId ?? null;
    if (scopeId) {
      const [scope] = await tx.select({ id: scopes.id, topicId: scopes.topicId }).from(scopes).where(and(eq(scopes.workspaceId, workspaceId), eq(scopes.courseId, courseId), eq(scopes.id, scopeId)));
      if (!scope) throw notFound();
      topicId ??= scope.topicId;
    } else if (topicId) {
      // A topic session works on the topic's scope, made on first use like any topic scope.
      await tx.insert(scopes).values({ id: crypto.randomUUID(), workspaceId, courseId, name: topicLabel ?? 'Topic', kind: 'topic', topicId }).onConflictDoNothing();
      const [scope] = await tx.select({ id: scopes.id }).from(scopes).where(and(eq(scopes.courseId, courseId), eq(scopes.kind, 'topic'), eq(scopes.topicId, topicId)));
      scopeId = scope?.id ?? null;
    }
    const focus = input.source ? await citationBlocks(tx, workspaceId, courseId, input.source) : null;
    const heading = focus?.blocks.find(b => b.type === 'heading');
    const title = (input.title || topicLabel || (heading?.type === 'heading' ? spansText(heading.content.spans) : '') || focus?.title || 'Tutor session').slice(0, 200);
    if (!topicId && !scopeId && !input.source && !review) throw new ApiError(400, 'invalid_input', 'Choose a topic, or start the session from a section of a material.');
    const [saved] = await tx.insert(tutorSessions).values({ id: input.id, workspaceId, courseId, plannedSessionId: input.plannedSessionId, topicId, topicLabel, scopeId, title, source: input.source ?? null, review }).onConflictDoNothing().returning(); if (!saved) throw notFound(); return detail(tx, workspaceId, saved.id);
  });
}
export async function saveMessage(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof tutorMessageInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-message', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true); if (session.revision !== input.expectedRevision) throw conflict(); if (session.endedAt) throw new ApiError(409, 'session_ended', 'This session has ended. Start a new session to continue studying.'); if (session.archived) throw new ApiError(409, 'archived', 'Restore the session before adding messages.');
    // A reply whose Worker went away would otherwise hold the session busy for good, so an active
    // reply is checked for staleness before it blocks the question.
    let [active] = await tx.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), inArray(aiOperations.state, ['queued', 'running']))).limit(1);
    if (active && await recoverReplies(tx, { workspaceId, sessionId: id })) [active] = await tx.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), inArray(aiOperations.state, ['queued', 'running']))).limit(1);
    if (active) throw new ApiError(409, 'tutor_busy', 'A reply is still being written. Wait for it before sending another question.');
    const [last] = await tx.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(eq(tutorMessages.sessionId, id)).orderBy(desc(tutorMessages.ordinal)).limit(1);
    await tx.insert(tutorMessages).values({ id: crypto.randomUUID(), workspaceId, courseId: session.courseId, sessionId: id, ordinal: (last?.ordinal ?? -1) + 1, text: input.text, role: 'student', state: 'pending', operationId: input.operationId, failure: null });
    await queueReply(tx, workspaceId, session, input.operationId, { text: input.text, action: input.action });
    await tx.update(tutorSessions).set({ revision: session.revision + 1, updatedAt: new Date() }).where(eq(tutorSessions.id, id));
    return detail(tx, workspaceId, id, Math.max(-1, (last?.ordinal ?? -1) - 48));
  });
}
export async function patchSession(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof tutorMetadataInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-metadata', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true); if (session.revision !== input.expectedRevision) throw conflict();
    await tx.update(tutorSessions).set({ title: input.title, archived: input.archived, revision: session.revision + 1, updatedAt: new Date() }).where(eq(tutorSessions.id, id)); return detail(tx, workspaceId, id);
  });
}

async function messageCounts(db: Db, workspaceId: string, id: string) {
  return db.select({ role: tutorMessages.role, state: tutorMessages.state, stage: sql<SessionStage | null>`${tutorMessages.provenance}->>'stage'`, count: sql<number>`count(*)::int` }).from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id))).groupBy(tutorMessages.role, tutorMessages.state, sql`${tutorMessages.provenance}->>'stage'`);
}
type SessionStage = Awaited<ReturnType<typeof ownSession>>['stage'];
async function sessionSummary(db: Db, workspaceId: string, session: Awaited<ReturnType<typeof ownSession>>) {
  const counts = await messageCounts(db, workspaceId, session.id);
  return summariseTutorTurns({ id: session.id, courseId: session.courseId, scopeId: session.scopeId, topicId: session.topicId, stage: session.stage, stages: counts.flatMap(m => m.stage && m.state === 'complete' ? [m.stage] : []), studentTurns: counts.filter(m => m.role === 'student').reduce((n, m) => n + m.count, 0) });
}
export async function endSession(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof writeInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'end-tutor', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true);
    if (session.endedAt) return detail(tx, workspaceId, id);
    if (session.revision !== input.expectedRevision) throw conflict();
    await recoverReplies(tx, { workspaceId, sessionId: id });
    const [running] = await tx.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), inArray(aiOperations.state, ['queued', 'running']))).limit(1);
    if (running) throw new ApiError(409, 'tutor_busy', 'Wait for the reply to finish before ending this session.');
    const counts = await messageCounts(tx, workspaceId, id);
    const complete = counts.filter(m => m.state === 'complete');
    const completedLearning = complete.filter(m => m.role === 'student').reduce((n, m) => n + m.count, 0) >= 2 && complete.some(m => m.role === 'tutor' && m.count > 0);
    const endedAt = new Date();
    await tx.update(tutorSessions).set({ endedAt, completedLearning, updatedAt: endedAt, revision: session.revision + 1 }).where(eq(tutorSessions.id, id));
    if (completedLearning && session.plannedSessionId) {
      const [planned] = await tx.select().from(plannedSessions).where(and(eq(plannedSessions.workspaceId, workspaceId), eq(plannedSessions.courseId, session.courseId), eq(plannedSessions.id, session.plannedSessionId))).for('update');
      if (planned && !planned.content.completedBy) await tx.update(plannedSessions).set({ content: { ...planned.content, status: 'completed', completedBy: id, completedAt: endedAt.toISOString() }, revision: planned.revision + 1 }).where(eq(plannedSessions.id, planned.id));
    }
    await bumpPlanner(tx, workspaceId); return detail(tx, workspaceId, id);
  });
}
