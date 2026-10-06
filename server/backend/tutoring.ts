import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { z } from 'zod';
import type { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../src/shared/online-tutor';
import { responseText } from '../../src/shared/answer-review';
import { tutorMessages, tutorSessions, topics, passages } from './schema';
import { operation, attempt } from './learning';
import { recordBlocked } from './ai';
import { getCourse } from './service';
import { conflict, notFound, ApiError } from './errors';
import type { ReadDb, SocketDb, Transaction } from './db';

const reason = 'Your message is saved. Tutor replies are not connected in this online workspace yet. No AI request was sent.';
type Db = ReadDb | Transaction;
async function ownSession(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, id))); if (!row) throw notFound();
  const { workspaceId: _workspace, ...session } = row; return session;
}
export async function listSessions(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.courseId, courseId), cursor ? gt(tutorSessions.id, cursor) : undefined)).orderBy(asc(tutorSessions.id)).limit(limit + 1);
  return { sessions: rows.slice(0, limit).map(({ workspaceId: _w, ...row }) => row), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function detail(db: Db, workspaceId: string, id: string, cursor = -1) {
  const session = await ownSession(db, workspaceId, id);
  const rows = await db.select().from(tutorMessages).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.sessionId, id), gt(tutorMessages.ordinal, cursor))).orderBy(asc(tutorMessages.ordinal)).limit(51);
  return { session, messages: rows.slice(0, 50).map(({ workspaceId: _w, courseId: _c, sessionId: _s, ...m }) => m), nextCursor: rows.length > 50 ? rows[49]!.ordinal : null, execution: { available: false, reason } };
}
export async function createSession(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof newTutorInput>) {
  return operation(db, workspaceId, input.id, { action: 'tutor-session', courseId, input }, async tx => {
    await getCourse(tx, workspaceId, courseId);
    const [topic] = await tx.select().from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
    let topicLabel = topic?.title;
    if (input.source) { const s = input.source; const [p] = await tx.select({ id: passages.id }).from(passages).where(and(eq(passages.workspaceId, workspaceId), eq(passages.courseId, courseId), eq(passages.materialId, s.materialId), eq(passages.versionId, s.versionId), eq(passages.id, s.passageId))); if (!p) throw notFound(); }
    let review = null;
    if (input.review) {
      const a = await attempt(tx, workspaceId, input.review.attemptId); if (a.courseId !== courseId) throw notFound();
      const q = a.questions.find(q => q.question.id === input.review!.questionId); if (!q || q.question.topicId !== input.topicId) throw notFound();
      const question = q.question; const result = q.result;
      topicLabel ??= question.topicLabel;
      review = { attemptId: a.id, questionId: question.id, courseId, topicId: input.topicId, prompt: question.prompt, response: responseText(result.response, question), answerKey: question.correctIndices?.map(i => question.options?.[i]).join('\n') ?? question.answer ?? question.sequence?.join('\n') ?? question.blanks?.map(b => b.join(' or ')).join('\n') ?? question.pairs?.map(p => `${p.left}: ${p.right}`).join('\n') ?? '', feedback: question.explanation, marksAwarded: result.marksAwarded, marksAvailable: result.marksAvailable, usedHint: result.usedHint, pending: result.outcome === 'pending' };
    }
    if (!topicLabel) throw notFound();
    const [saved] = await tx.insert(tutorSessions).values({ id: input.id, workspaceId, courseId, topicId: input.topicId, topicLabel, title: input.title, source: input.source ?? null, review }).onConflictDoNothing().returning(); if (!saved) throw notFound(); return detail(tx, workspaceId, saved.id);
  });
}
export async function saveMessage(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof tutorMessageInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-message', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id); if (session.revision !== input.expectedRevision) throw conflict(); if (session.archived) throw new ApiError(409, 'archived', 'Restore the session before adding messages.');
    const [last] = await tx.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(eq(tutorMessages.sessionId, id)).orderBy(desc(tutorMessages.ordinal)).limit(1);
    await tx.insert(tutorMessages).values({ id: crypto.randomUUID(), workspaceId, courseId: session.courseId, sessionId: id, ordinal: (last?.ordinal ?? -1) + 1, text: input.text, role: 'student', state: 'blocked', operationId: input.operationId, failure: reason });
    await recordBlocked(tx, workspaceId, session.courseId, input.operationId, id, 'tutor', { sessionRevision: session.revision, source: session.source, review: session.review, stage: session.stage, message: input.text });
    await tx.update(tutorSessions).set({ revision: session.revision + 1, updatedAt: new Date() }).where(eq(tutorSessions.id, id));
    return detail(tx, workspaceId, id, Math.max(-1, (last?.ordinal ?? -1) - 48));
  });
}
export async function patchSession(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof tutorMetadataInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'tutor-metadata', id, input }, async tx => {
    const session = await ownSession(tx, workspaceId, id); if (session.revision !== input.expectedRevision) throw conflict();
    await tx.update(tutorSessions).set({ title: input.title, archived: input.archived, revision: session.revision + 1, updatedAt: new Date() }).where(eq(tutorSessions.id, id)); return detail(tx, workspaceId, id);
  });
}
