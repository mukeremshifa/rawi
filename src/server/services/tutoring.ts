import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../shared/contracts/tutor';
import { responseText } from '../../shared/domain/answer-review';
import { tutorMessages, tutorSessions, topics, aiOperations, plannedSessions } from '../db/schema';
import { validateCitation } from './materials';
import { citedPassage, contextMaterials } from './documents/context';
import { operation, attempt } from './learning';
import { recordBlocked } from './ai/operations';
import { summariseTutorTurns } from '../../shared/domain/tutor-summary';
import type { writeInput } from '../../shared/contracts/learning';
import { planningData, bumpPlanner } from './planning';
import { selectPassages, priorWorkLines } from '../../shared/domain/ai-context';
import { AI_LIMITS } from '../../shared/domain/ai';
import { tutorPrompts } from './ai/prompts';
import { tutorRequest } from './ai/validate';
import { getCourse } from './workspace';
import { conflict, notFound, ApiError } from '../errors';
import type { ReadDb, SocketDb, Transaction } from '../db/client';

const reason = 'Your message is saved. Tutor replies are not available yet. No AI request was sent.';
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
  const rows = await db.select().from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id), gt(tutorMessages.ordinal, cursor))).orderBy(asc(tutorMessages.ordinal)).limit(51);
  return { session, summary: session.endedAt ? await sessionSummary(db, workspaceId, session) : null, messages: rows.slice(0, 50).map(({ workspaceId: _w, courseId: _c, sessionId: _s, ...m }) => m), nextCursor: rows.length > 50 ? rows[49]!.ordinal : null, execution: { available: false, reason } };
}
export async function createSession(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof newTutorInput>) {
  return operation(db, workspaceId, input.id, { action: 'tutor-session', courseId, input }, async tx => {
    await getCourse(tx, workspaceId, courseId);
    const [topic] = await tx.select().from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
    let topicLabel = topic?.title;
    if (input.plannedSessionId) {
      const [planned] = await tx.select().from(plannedSessions).where(and(eq(plannedSessions.workspaceId, workspaceId), eq(plannedSessions.courseId, courseId), eq(plannedSessions.id, input.plannedSessionId)));
      if (!planned || planned.content.activity !== 'tutor') throw notFound();
    }
    if (input.source) await validateCitation(tx, workspaceId, courseId, input.source);
    let review = null;
    if (input.review) {
      const a = await attempt(tx, workspaceId, input.review.attemptId); if (a.courseId !== courseId) throw notFound();
      const q = a.questions.find(q => q.question.id === input.review!.questionId); if (!q || q.question.topicId !== input.topicId) throw notFound();
      const question = q.question; const result = q.result;
      topicLabel ??= question.topicLabel;
      review = { attemptId: a.id, questionId: question.id, courseId, topicId: input.topicId, prompt: question.prompt, response: responseText(result.response, question), answerKey: question.correctIndices?.map(i => question.options?.[i]).join('\n') ?? question.answer ?? question.sequence?.join('\n') ?? question.blanks?.map(b => b.join(' or ')).join('\n') ?? question.pairs?.map(p => `${p.left}: ${p.right}`).join('\n') ?? '', feedback: question.explanation, marksAwarded: result.marksAwarded, marksAvailable: result.marksAvailable, usedHint: result.usedHint, pending: result.outcome === 'pending' };
    }
    if (!topicLabel) throw notFound();
    const [saved] = await tx.insert(tutorSessions).values({ id: input.id, workspaceId, courseId, plannedSessionId: input.plannedSessionId, topicId: input.topicId, topicLabel, title: input.title, source: input.source ?? null, review }).onConflictDoNothing().returning(); if (!saved) throw notFound(); return detail(tx, workspaceId, saved.id);
  });
}
/** Snapshot only owned, bounded context. The cited focus blocks come first, from their own version. */
async function prepareTurn(tx: Transaction, workspaceId: string, session: Awaited<ReturnType<typeof ownSession>>, input: z.infer<typeof tutorMessageInput>) {
  const data = await planningData(tx, workspaceId);
  const course = data.courses.find(c => c.id === session.courseId); if (!course) throw notFound();
  const topic = data.topics.find(t => t.id === session.topicId);
  const focus = session.source ? await citedPassage(tx, workspaceId, session.courseId, session.source, [session.topicId]) : null;
  if (session.source && !focus) throw notFound();
  const materials = await contextMaterials(tx, workspaceId, session.courseId, data.materials);
  const picked = selectPassages({ courseId: session.courseId, materials, topicIds: [session.topicId], query: `${session.topicLabel} ${input.text}`, maxChars: 18000 - (focus?.text.length ?? 0) });
  const context = focus ? [focus, ...picked.filter(p => !p.blockIds.some(id => focus.blockIds.includes(id))).slice(0, 9)] : picked;
  const recent = await tx.select().from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, session.id))).orderBy(desc(tutorMessages.ordinal)).limit(AI_LIMITS.maxHistoryTurns);
  // History has its own total bound, in addition to the per-turn shared validator.
  let historyChars = 0;
  const history = recent.flatMap(m => {
    const text = m.text.slice(0, Math.min(AI_LIMITS.maxResponseChars, 12000 - historyChars)); historyChars += text.length;
    return text ? [{ role: m.role, text, ...(m.state === 'interrupted' || m.state === 'cancelled' ? { interrupted: true } : {}) }] : [];
  }).reverse();
  const review = session.review ? { ...session.review, prompt: session.review.prompt.slice(0, 6000), response: session.review.response.slice(0, 6000), answerKey: session.review.answerKey.slice(0, 6000), feedback: session.review.feedback.slice(0, 6000) } : undefined;
  const request = tutorRequest({ courseId: session.courseId, courseName: course.name, topic: { id: session.topicId, title: session.topicLabel, summary: topic?.summary ?? '' }, stage: session.stage, action: input.action, message: input.text, focusPassageId: focus?.id, passages: context, history, review, priorWork: priorWorkLines(session.topicId, data.attempts, new Map(data.questions.map(q => [q.id, q]))).map(line => line.slice(0, 400)) });
  const prompts = tutorPrompts(request);
  if (prompts.system.length + prompts.prompt.length > 64000) throw new ApiError(413, 'context_limit', 'This session exceeds the reply context limit. Start a new focused session.');
  return { sessionRevision: session.revision, request, prompts };
}
export async function saveMessage(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof tutorMessageInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-message', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true); if (session.revision !== input.expectedRevision) throw conflict(); if (session.endedAt) throw new ApiError(409, 'session_ended', 'This session has ended. Start a new session to continue studying.'); if (session.archived) throw new ApiError(409, 'archived', 'Restore the session before adding messages.');
    const [active] = await tx.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), eq(aiOperations.state, 'running'))).limit(1);
    if (active) throw new ApiError(409, 'tutor_busy', 'A reply is still running. Stop it or recover its saved status before sending another question.');
    const prepared = await prepareTurn(tx, workspaceId, session, input);
    const [last] = await tx.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(eq(tutorMessages.sessionId, id)).orderBy(desc(tutorMessages.ordinal)).limit(1);
    await tx.insert(tutorMessages).values({ id: crypto.randomUUID(), workspaceId, courseId: session.courseId, sessionId: id, ordinal: (last?.ordinal ?? -1) + 1, text: input.text, role: 'student', state: 'blocked', operationId: input.operationId, failure: reason });
    await recordBlocked(tx, workspaceId, session.courseId, input.operationId, id, 'tutor', prepared);
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
  return db.select({ role: tutorMessages.role, state: tutorMessages.state, stage: sql<SessionStage | null>`${tutorMessages.provenance}->>'stage'`, imported: sql<boolean>`coalesce(${tutorMessages.provenance}->>'imported' = 'true', false)`, count: sql<number>`count(*)::int` }).from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id))).groupBy(tutorMessages.role, tutorMessages.state, sql`${tutorMessages.provenance}->>'stage'`, sql`coalesce(${tutorMessages.provenance}->>'imported' = 'true', false)`);
}
type SessionStage = Awaited<ReturnType<typeof ownSession>>['stage'];
async function sessionSummary(db: Db, workspaceId: string, session: Awaited<ReturnType<typeof ownSession>>) {
  const counts = await messageCounts(db, workspaceId, session.id);
  return summariseTutorTurns({ id: session.id, topicId: session.topicId, stage: session.stage, stages: counts.flatMap(m => m.stage && m.state === 'complete' ? [m.stage] : []), studentTurns: counts.filter(m => m.role === 'student').reduce((n, m) => n + m.count, 0) });
}
export async function endSession(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof writeInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'end-tutor', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id, true);
    if (session.endedAt) return detail(tx, workspaceId, id);
    if (session.revision !== input.expectedRevision) throw conflict();
    const [running] = await tx.select({ id: aiOperations.id }).from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.targetId, id), eq(aiOperations.state, 'running'))).limit(1);
    if (running) throw new ApiError(409, 'tutor_busy', 'Stop the active reply before ending this session.');
    const counts = await messageCounts(tx, workspaceId, id);
    const complete = counts.filter(m => !m.imported && m.state === 'complete');
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
