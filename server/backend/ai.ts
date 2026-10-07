import { promptKey } from '../../src/shared/prompt-key';
import { transaction } from './db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { finishTutorText } from '../../src/shared/tutor-output';
import type { TutorMessageProvenance } from '../../src/shared/online-tutor';
import { uuid } from '../../src/shared/online';
import { selectPassages } from '../../src/shared/ai-context';
import { generatePrompts, gradePrompts } from '../prompts';
import { generateRequest, gradeRequest, generatedQuestion, gradeOutput, tutorRequest } from '../validate';
import { aiOperations, aiExecutions, passages, materials, feedbackRevisions, questionVersions, questionSources, learningSets, setItems, tutorSessions, tutorMessages } from './schema';
import { planningData, bumpPlanner } from './planning';
import { questionInput, type VersionedQuestion } from '../../src/shared/learning';
import { operation, attempt } from './learning';
import { hash } from './materials';
import { ApiError, notFound } from './errors';
import type { ReadDb, SocketDb, Transaction } from './db';

export const unavailable = 'Hosted AI replies are not connected. This request is saved, but no provider request or charge was made.';
export const generateInput = z.strictObject({ operationId: uuid, name: z.string().trim().min(1).max(200), format: z.enum(['flashcard', 'multiple-choice', 'written-recall']), count: z.number().int().min(1).max(10), topicIds: z.array(uuid).min(1).max(20), materialIds: z.array(uuid).min(1).max(20), difficulties: z.array(z.enum(['recall', 'reasoning', 'stretch'])).min(1).max(3) });
export const gradeInput = z.strictObject({ operationId: uuid, questionId: uuid });
// Retains the chosen model and engineering budget defaults. No
// workstation credentials, SDK client, filesystem ledger or paid call lives here.
export const engineeringLimits = { model: 'gemini-3.8-flash', userConcurrent: 1, globalConcurrent: 2, userDailyMicros: 5_000_000, globalDailyMicros: 5_000_000, userTotalMicros: 80_000_000, globalTotalMicros: 80_000_000, maxAttempts: 2 };
export async function recordBlocked(tx: Transaction, workspaceId: string, courseId: string, id: string, targetId: string, task: 'tutor' | 'generate' | 'grade', input: unknown) {
  const serialized = JSON.stringify(input);
  if (serialized.length > 200000) throw new ApiError(413, 'context_limit', 'This request exceeds the context limit. Choose fewer materials or a shorter response.');
  const fingerprint = await hash(serialized);
  const [prior] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id)));
  if (prior) { if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This AI request ID belongs to different input.'); return prior; }
  const [row] = await tx.insert(aiOperations).values({ id, workspaceId, courseId, targetId, task, fingerprint, input, state: 'blocked', model: engineeringLimits.model, promptVersion: 'rawi-v1', reason: unavailable }).returning(); return row!;
}
export async function viewOperation(db: ReadDb | Transaction, workspaceId: string, id: string) {
  const [row] = await db.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id))); if (!row) throw notFound();
  const executions = await db.select({ id: aiExecutions.id, state: aiExecutions.state, partial: aiExecutions.partial, createdAt: aiExecutions.createdAt, settledAt: aiExecutions.settledAt }).from(aiExecutions).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.operationId, id))).orderBy(asc(aiExecutions.createdAt), asc(aiExecutions.id));
  return { id: row.id, task: row.task, targetId: row.targetId, state: row.state, model: row.model, promptVersion: row.promptVersion, reason: row.reason, result: row.result, executions };
}
export async function prepareGeneration(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof generateInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'generate', courseId, input }, async tx => {
    const data = await planningData(tx, workspaceId); const course = data.courses.find(c => c.id === courseId); if (!course) throw notFound();
    const topics = input.topicIds.map(id => { const t = data.topics.find(t => t.id === id && t.courseId === courseId); if (!t) throw notFound(); return { id: t.id, title: t.title, summary: t.summary }; });
    const selected = input.materialIds.map(id => { const m = data.materials.find(m => m.id === id && m.courseId === courseId); if (!m) throw notFound(); return m; });
    const context = selectPassages({ courseId, materials: selected, topicIds: input.topicIds, query: topics.map(t => t.title).join(' ') });
    if (!context.length) throw new ApiError(400, 'no_content', 'Choose readable material linked to these topics.');
    const request = generateRequest({ courseId, courseName: course.name, format: input.format, count: input.count, difficulties: input.difficulties, topics, passages: context });
    const prompts = generatePrompts(request);
    if (prompts.system.length + prompts.prompt.length > 48000) throw new ApiError(413, 'context_limit', 'Choose fewer passages for this request.');
    await recordBlocked(tx, workspaceId, courseId, input.operationId, input.operationId, 'generate', { name: input.name, request, prompts });
    return viewOperation(tx, workspaceId, input.operationId);
  });
}
export async function prepareGrade(db: SocketDb, workspaceId: string, attemptId: string, input: z.infer<typeof gradeInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'grade', attemptId, input }, async tx => {
    const saved = await attempt(tx, workspaceId, attemptId); const item = saved.questions.find(q => q.question.id === input.questionId); if (!item) throw notFound();
    const q = item.question;
    if (!q.rubric?.length || item.result.response.kind !== 'text' || !item.result.response.text.trim()) throw new ApiError(400, 'no_written_response', 'This answer has no written response and rubric to grade.');
    const context = q.source ? await tx.select({ id: passages.id, courseId: passages.courseId, materialId: passages.materialId, materialTitle: materials.title, heading: passages.heading, text: passages.text }).from(passages).innerJoin(materials, eq(materials.id, passages.materialId)).where(and(eq(passages.workspaceId, workspaceId), eq(passages.courseId, saved.courseId), eq(passages.versionId, q.source.versionId), eq(passages.id, q.source.passageId))).limit(1) : [];
    const request = gradeRequest({ courseId: saved.courseId, prompt: q.prompt, modelAnswer: q.answer ?? '', rubric: q.rubric, passages: context.map(p => ({ ...p, text: p.text.slice(0, 6000), topicIds: [q.topicId] })), response: item.result.response.text });
    await recordBlocked(tx, workspaceId, saved.courseId, input.operationId, attemptId, 'grade', { questionId: q.id, markingVersion: saved.markingVersion, request, prompts: gradePrompts(request) });
    return viewOperation(tx, workspaceId, input.operationId);
  });
}

async function budgetLock(tx: Transaction) { await tx.execute(sql`select pg_advisory_xact_lock(714290031)`); }
/** Reserve before a provider call. Callers must not send until this commits. */
export async function reserveExecution(db: SocketDb, workspaceId: string, operationId: string, executionId: string, reservedMicros: number) {
  if (!Number.isSafeInteger(reservedMicros) || reservedMicros < 0 || reservedMicros > engineeringLimits.userDailyMicros) throw new ApiError(400, 'invalid_reservation', 'The request exceeds the allowed cost estimate.');
  return transaction(db, async tx => {
    await budgetLock(tx);
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, operationId))).for('update'); if (!op) throw notFound();
    const [prior] = await tx.select().from(aiExecutions).where(eq(aiExecutions.id, executionId));
    if (prior) { if (prior.workspaceId !== workspaceId || prior.operationId !== operationId) throw notFound(); if (prior.reservedMicros !== reservedMicros) throw new ApiError(409, 'operation_conflict', 'This execution has a different reservation.'); return { execution: prior, send: false }; }
    if (op.state === 'complete' || op.state === 'cancelled' || op.state === 'interrupted' || op.activeExecutionId) throw new ApiError(409, 'ai_operation_locked', 'This operation already has an execution. Recover its saved state.');
    if (op.task === 'tutor') {
      const [session] = await tx.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, op.targetId))).for('update');
      const [latest] = await tx.select({ operationId: tutorMessages.operationId }).from(tutorMessages).where(and(eq(tutorMessages.sessionId, op.targetId), eq(tutorMessages.role, 'student'))).orderBy(desc(tutorMessages.ordinal)).limit(1);
      if (!session || session.archived || session.endedAt || latest?.operationId !== op.id || session.revision !== (op.input as { sessionRevision: number }).sessionRevision + 1) throw new ApiError(409, 'stale_execution', 'The tutor session has changed. Save a new question using its current context.');
    }
    const ownExecutions = await tx.select({ id: aiExecutions.id, state: aiExecutions.state, partial: aiExecutions.partial }).from(aiExecutions).where(eq(aiExecutions.operationId, operationId));
    if (ownExecutions.length >= engineeringLimits.maxAttempts || ownExecutions.some(e => e.state === 'ambiguous' || e.state === 'reserved' || !!e.partial)) throw new ApiError(409, 'ai_retry_locked', 'This operation cannot be retried while its provider outcome is uncertain.');
    const totals = await tx.execute(sql`select
      coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released'),0)::float8 as total,
      coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),0)::float8 as daily,
      count(*) filter (where state in ('reserved', 'ambiguous'))::int as concurrent,
      coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${workspaceId}),0)::float8 as own_total,
      coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${workspaceId} and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),0)::float8 as own_daily,
      count(*) filter (where state in ('reserved', 'ambiguous') and workspace_id = ${workspaceId})::int as own_concurrent from ai_executions`);
    const n = totals.rows[0] as Record<string, number>;
    if (n.concurrent! >= engineeringLimits.globalConcurrent || n.own_concurrent! >= engineeringLimits.userConcurrent) throw new ApiError(429, 'ai_busy', 'The AI concurrency limit is reached. Recover existing operations before starting more.');
    if (n.total! + reservedMicros > engineeringLimits.globalTotalMicros || n.own_total! + reservedMicros > engineeringLimits.userTotalMicros || n.daily! + reservedMicros > engineeringLimits.globalDailyMicros || n.own_daily! + reservedMicros > engineeringLimits.userDailyMicros) throw new ApiError(429, 'ai_budget', 'The AI engineering budget is reached.');
    const [execution] = await tx.insert(aiExecutions).values({ id: executionId, workspaceId, operationId, state: 'reserved', reservedMicros }).returning();
    await tx.update(aiOperations).set({ state: 'running', activeExecutionId: executionId, reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, operationId));
    return { execution: execution!, send: true };
  });
}
/** Unknown usage stays charged at its reservation. No automatic retry follows. */
export async function settleExecution(db: SocketDb, workspaceId: string, executionId: string, outcome: { state: 'settled'; chargedMicros: number; usage: unknown } | { state: 'ambiguous' } | { state: 'released' }) {
  if (outcome.state === 'settled' && (!Number.isSafeInteger(outcome.chargedMicros) || outcome.chargedMicros < 0)) throw new Error('Invalid usage charge');
  return transaction(db, async tx => {
    await budgetLock(tx);
    const [e] = await tx.select().from(aiExecutions).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.id, executionId))).for('update'); if (!e) throw notFound();
    if (e.state === 'settled' || e.state === 'released') {
      if (e.state !== outcome.state || (outcome.state === 'settled' && e.chargedMicros !== outcome.chargedMicros)) throw new ApiError(409, 'settlement_conflict', 'This execution already has a different settlement.'); return e;
    }
    if (e.state === 'ambiguous' && outcome.state === 'released') throw new ApiError(409, 'uncertain_charge', 'An uncertain provider outcome cannot be released as uncharged.');
    const [saved] = await tx.update(aiExecutions).set({ state: outcome.state, chargedMicros: outcome.state === 'settled' ? outcome.chargedMicros : outcome.state === 'released' ? 0 : null, usage: outcome.state === 'settled' ? outcome.usage : null, settledAt: outcome.state === 'ambiguous' ? null : new Date() }).where(eq(aiExecutions.id, executionId)).returning();
    await tx.update(aiOperations).set({ state: 'failed', activeExecutionId: null, reason: outcome.state === 'ambiguous' ? 'The provider outcome is uncertain. Its reservation is retained and this operation cannot regenerate automatically.' : 'Execution ended. Read the saved result before considering another request.', updatedAt: new Date() }).where(and(eq(aiOperations.id, e.operationId), eq(aiOperations.activeExecutionId, executionId)));
    return saved!;
  });
}
/** A stale execution cannot checkpoint or publish over a newer operation. */
export async function checkpoint(db: SocketDb, workspaceId: string, executionId: string, text: string) {
  if (text.length > 12000) throw new ApiError(413, 'output_limit', 'The reply reached its output limit.');
  return transaction(db, async tx => {
    const [e] = await tx.select().from(aiExecutions).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.id, executionId))); if (!e) throw notFound();
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.id, e.operationId), eq(aiOperations.workspaceId, workspaceId))).for('update');
    if (op?.activeExecutionId !== executionId || e.state !== 'reserved') throw new ApiError(409, 'stale_execution', 'This execution no longer owns the reply.');
    await tx.update(aiExecutions).set({ partial: text }).where(eq(aiExecutions.id, executionId)); return { saved: true };
  });
}

/** Internal publication boundary. Never accepts model output from the browser. */
export async function publishStructured(db: SocketDb, workspaceId: string, executionId: string, raw: unknown) {
  return transaction(db, async tx => {
    const [execution] = await tx.select().from(aiExecutions).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.id, executionId))); if (!execution) throw notFound();
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, execution.operationId))).for('update'); if (!op) throw notFound();
    if (op.state === 'complete') return op.result;
    if (op.activeExecutionId !== executionId || execution.state !== 'reserved') throw new ApiError(409, 'stale_execution', 'This execution no longer owns publication.');
    const input = op.input as { request: unknown; name?: string; questionId?: string };
    let result: unknown;
    if (op.task === 'grade') {
      const req = gradeRequest(input.request), checked = gradeOutput(raw, req);
      if (!checked) throw new ApiError(502, 'invalid_output', 'The feedback did not match the saved rubric. Your response is unchanged.');
      const original = await attempt(tx, workspaceId, op.targetId);
      const item = original.questions.find(q => q.question.id === input.questionId); if (!item) throw notFound();
      const prior = await tx.select().from(feedbackRevisions).where(and(eq(feedbackRevisions.workspaceId, workspaceId), eq(feedbackRevisions.attemptId, op.targetId), eq(feedbackRevisions.questionId, item.question.id)));
      const revision = Math.max(0, ...prior.map(r => r.revision)) + 1;
      const grading = { method: 'ai' as const, status: 'graded' as const, model: op.model, gradedAt: new Date().toISOString(), summary: checked.summary, points: checked.points.map(p => ({ ...p, max: req.rubric.find(r => r.id === p.rubricId)!.marks })) };
      await tx.insert(feedbackRevisions).values({ id: crypto.randomUUID(), workspaceId, courseId: op.courseId, attemptId: op.targetId, questionId: item.question.id, operationId: op.id, revision, grading });
      result = { attemptId: op.targetId, questionId: item.question.id, revision };
    } else if (op.task === 'generate') {
      const req = generateRequest(input.request); const proposed = (raw as { questions?: unknown })?.questions;
      if (!Array.isArray(proposed) || proposed.length > 50) throw new ApiError(502, 'invalid_output', 'The generated set could not be validated.');
      const seen = new Set<string>(); const questions: VersionedQuestion[] = [];
      for (const row of proposed) {
        const q = generatedQuestion(row, req); if (!q) continue;
        const key = promptKey(q.prompt); if (seen.has(key)) continue; seen.add(key);
        const [source] = await tx.select().from(passages).where(and(eq(passages.workspaceId, workspaceId), eq(passages.courseId, op.courseId), eq(passages.id, q.sourcePassageId))); if (!source) throw notFound();
        const id = crypto.randomUUID(); const rubric = q.rubric?.map((r, i) => ({ ...r, id: `${id}:${i}`, keywords: [] }));
        const content = questionInput.parse({ format: req.format, topicId: q.topicId, difficulty: q.difficulty, marks: rubric?.reduce((n, p) => n + p.marks, 0) ?? 1, prompt: q.prompt, explanation: q.explanation, answer: q.answer, options: q.options, correctIndices: q.correctIndex === undefined ? undefined : [q.correctIndex], rubric, source: { materialId: source.materialId, versionId: source.versionId, passageId: source.id } });
        questions.push({ ...content, id, courseId: op.courseId, topicLabel: req.topics.find(t => t.id === q.topicId)!.title, origin: 'generated', provenance: { kind: 'generated', model: op.model, generatedAt: new Date().toISOString(), materialIds: [source.materialId] } });
        if (questions.length === req.count) break;
      }
      if (!questions.length) throw new ApiError(502, 'invalid_output', 'None of the generated questions passed validation. No set was saved.');
      await tx.insert(questionVersions).values(questions.map(content => ({ id: content.id, workspaceId, courseId: op.courseId, content })));
      await tx.insert(questionSources).values(questions.map(q => ({ workspaceId, courseId: op.courseId, questionId: q.id, ...q.source! })));
      const id = crypto.randomUUID();
      await tx.insert(learningSets).values({ id, workspaceId, courseId: op.courseId, name: input.name!, fingerprint: op.fingerprint, hintsAllowed: true, feedback: 'immediate' });
      await tx.insert(setItems).values(questions.map((q, position) => ({ id: crypto.randomUUID(), workspaceId, courseId: op.courseId, setId: id, questionId: q.id, position })));
      result = { setId: id, count: questions.length, rejected: proposed.length - questions.length };
    } else throw new ApiError(400, 'invalid_task', 'This operation requires the tutor publication path.');
    await tx.update(aiOperations).set({ state: 'complete', activeExecutionId: null, result, reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, op.id));
    await bumpPlanner(tx, workspaceId); return result;
  });
}

/** Internal reply publication. Only supplied immutable references become citations. */
export async function publishTutor(db: SocketDb, workspaceId: string, executionId: string, raw: string, outcome: 'complete' | 'interrupted' = 'complete') {
  if (!raw.trim() || raw.length > 12000) throw new ApiError(502, 'invalid_output', 'The tutor reply is empty or exceeds its output limit.');
  return transaction(db, async tx => {
    const [e] = await tx.select().from(aiExecutions).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.id, executionId))); if (!e) throw notFound();
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, e.operationId))).for('update'); if (!op || op.task !== 'tutor') throw notFound();
    if (op.state === 'complete' && op.result) return op.result;
    if (op.activeExecutionId !== executionId || e.state !== 'reserved') throw new ApiError(409, 'stale_execution', 'This execution no longer owns the tutor reply.');
    const [session] = await tx.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, op.targetId))).for('update'); if (!session) throw notFound();
    const input = op.input as { request: unknown; sessionRevision: number; sources: TutorMessageProvenance['citations'] };
    if (session.revision !== input.sessionRevision + 1 || session.archived || session.endedAt) throw new ApiError(409, 'stale_execution', 'The session changed before this reply could be published. Its partial text remains recoverable.');
    const req = tutorRequest(input.request);
    const checked = finishTutorText(raw, new Set(req.passages.map(p => p.id)), req.stage);
    if (!checked.text) throw new ApiError(502, 'invalid_output', 'No readable tutor reply was returned.');
    const provenance: TutorMessageProvenance = { model: op.model, stage: outcome === 'complete' ? checked.meta.stage : req.stage, grounding: checked.meta.grounding, droppedCitations: checked.dropped, imported: false, citations: checked.citations.map(id => { const source = input.sources.find(p => p.passageId === id); if (!source) throw new ApiError(502, 'invalid_citation', 'A cited passage is missing its saved version.'); return source; }) };
    const [last] = await tx.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(eq(tutorMessages.sessionId, session.id)).orderBy(desc(tutorMessages.ordinal)).limit(1);
    const id = crypto.randomUUID();
    await tx.insert(tutorMessages).values({ id, workspaceId, courseId: session.courseId, sessionId: session.id, ordinal: (last?.ordinal ?? -1) + 1, role: 'tutor', state: outcome, text: checked.text, operationId: executionId, provenance });
    await tx.update(tutorMessages).set({ state: 'complete', failure: null }).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.operationId, op.id), eq(tutorMessages.role, 'student')));
    await tx.update(tutorSessions).set({ revision: session.revision + 1, stage: provenance.stage, updatedAt: new Date() }).where(eq(tutorSessions.id, session.id));
    const result = { sessionId: session.id, messageId: id };
    await tx.update(aiOperations).set({ state: outcome, activeExecutionId: null, result, reason: outcome === 'complete' ? null : 'The reply was interrupted. Its saved text will not regenerate automatically.', updatedAt: new Date() }).where(eq(aiOperations.id, op.id));
    return result;
  });
}

/** Cancellation revokes publication and retains any uncertain charge and partial. */
export async function cancelOperation(db: SocketDb, workspaceId: string, id: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'cancel-ai', id }, async tx => {
    await budgetLock(tx);
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id))).for('update'); if (!op) throw notFound();
    if (op.state === 'complete' || op.state === 'cancelled') return viewOperation(tx, workspaceId, id);
    if (op.activeExecutionId) await tx.update(aiExecutions).set({ state: 'ambiguous', settledAt: null }).where(and(eq(aiExecutions.workspaceId, workspaceId), eq(aiExecutions.id, op.activeExecutionId), eq(aiExecutions.state, 'reserved')));
    await tx.update(aiOperations).set({ state: 'cancelled', activeExecutionId: null, reason: 'Stopped. Saved partial text remains recoverable. Any uncertain provider charge remains reserved.', updatedAt: new Date() }).where(eq(aiOperations.id, id));
    if (op.task === 'tutor') await tx.update(tutorMessages).set({ state: 'cancelled', failure: null }).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.operationId, id), eq(tutorMessages.role, 'student')));
    return viewOperation(tx, workspaceId, id);
  });
}
