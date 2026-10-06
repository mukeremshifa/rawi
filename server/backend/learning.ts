import { transaction } from './db';
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { createSetInput, metadataInput, questionInput, runWriteInput, transitionInput, validResponse, sameAnswer, type VersionedQuestion, type LearningRun, type LearningAttempt } from '../../src/shared/learning';
import { attemptTotals, toQuestionAttempt } from '../../src/shared/marking';
import { sectionLocked, locate } from '../../src/shared/exam';
import { uuid } from '../../src/shared/online';
import { questionVersions, questionSources, learningSets, setItems, learningRuns, runAnswers, learningAttempts, learningOperations, workspaces, topics, passages, plannedSessions } from './schema';
import { hash, lockCourse } from './materials';
import { bumpPlanner } from './planning';
import { withFeedback } from './feedback';
import { getCourse } from './service';
import { ApiError, conflict, notFound } from './errors';
import type { ReadDb, SocketDb, Transaction } from './db';

type Db = ReadDb | Transaction;
export const importBankInput = z.strictObject({ operationId: uuid, questions: z.array(questionInput).min(1).max(50) });
// Short workspace serialization makes operation receipts atomic with their writes.
// Provider calls and file transfers never run in this transaction.
export async function operation<T>(db: SocketDb, workspaceId: string, id: string, input: unknown, execute: (tx: Transaction) => Promise<T>): Promise<T> {
  const fingerprint = await hash(JSON.stringify(input));
  return transaction(db, async tx => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update');
    const [prior] = await tx.select().from(learningOperations).where(and(eq(learningOperations.workspaceId, workspaceId), eq(learningOperations.id, id)));
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This request ID belongs to different changes. Resolve the previous request before editing.');
      return prior.result as T;
    }
    const result = await execute(tx);
    await tx.insert(learningOperations).values({ workspaceId, id, fingerprint, result });
    return result;
  });
}
export async function importBank(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof importBankInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'import-bank', courseId, input }, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    const ownTopics = await tx.select().from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId)));
    const records: { id: string; workspaceId: string; courseId: string; content: VersionedQuestion }[] = [];
    for (const q of input.questions) {
      const topic = ownTopics.find(t => t.id === q.topicId);
      if (!topic) throw notFound();
      if (q.source) {
        const [source] = await tx.select({ id: passages.id }).from(passages).where(and(eq(passages.workspaceId, workspaceId), eq(passages.courseId, courseId), eq(passages.materialId, q.source.materialId), eq(passages.versionId, q.source.versionId), eq(passages.id, q.source.passageId)));
        if (!source) throw notFound();
      }
      const id = crypto.randomUUID();
      records.push({ id, workspaceId, courseId, content: { ...q, id, courseId, topicLabel: topic.title, origin: 'imported' } });
    }
    await tx.insert(questionVersions).values(records);
    const sources = records.flatMap(r => r.content.source ? [{ workspaceId, courseId, questionId: r.id, ...r.content.source }] : []);
    if (sources.length) await tx.insert(questionSources).values(sources);
    return { questions: records.map(r => r.content) };
  });
}
export async function bank(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select().from(questionVersions).where(and(eq(questionVersions.workspaceId, workspaceId), eq(questionVersions.courseId, courseId), cursor ? gt(questionVersions.id, cursor) : undefined)).orderBy(asc(questionVersions.id)).limit(limit + 1);
  return { questions: rows.slice(0, limit).map(r => r.content), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function ownSet(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select().from(learningSets).where(and(eq(learningSets.workspaceId, workspaceId), eq(learningSets.id, id)));
  if (!row) throw notFound();
  const { fingerprint: _fingerprint, workspaceId: _workspace, ...visible } = row;
  return visible;
}
export async function setQuestions(db: Db, workspaceId: string, setId: string) {
  return db.select({ id: setItems.id, question: questionVersions.content }).from(setItems).innerJoin(questionVersions, and(eq(questionVersions.id, setItems.questionId), eq(questionVersions.workspaceId, setItems.workspaceId), eq(questionVersions.courseId, setItems.courseId))).where(and(eq(setItems.workspaceId, workspaceId), eq(setItems.setId, setId))).orderBy(asc(setItems.position));
}
export async function createSet(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof createSetInput>) {
  return operation(db, workspaceId, input.id, { action: 'create-set', courseId, input }, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    const found = await tx.select({ id: questionVersions.id }).from(questionVersions).where(and(eq(questionVersions.workspaceId, workspaceId), eq(questionVersions.courseId, courseId), inArray(questionVersions.id, input.questionIds)));
    if (found.length !== input.questionIds.length) throw notFound();
    if (input.remediatesAttemptId) { const original = await attempt(tx, workspaceId, input.remediatesAttemptId); if (original.courseId !== courseId || input.questionIds.some(id => !original.questions.some(q => q.question.id === id))) throw notFound(); }
    const { questionIds, ...fields } = input;
    const [inserted] = await tx.insert(learningSets).values({ ...fields, workspaceId, courseId, fingerprint: await hash(JSON.stringify(input)) }).onConflictDoNothing().returning();
    if (!inserted) throw notFound();
    await tx.insert(setItems).values(questionIds.map((questionId, position) => ({ id: crypto.randomUUID(), workspaceId, courseId, setId: input.id, questionId, position })));
    return ownSet(tx, workspaceId, input.id);
  });
}
export async function listSets(db: Db, workspaceId: string, courseId: string, archived: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select({ id: learningSets.id, courseId: learningSets.courseId, name: learningSets.name, archived: learningSets.archived, revision: learningSets.revision, feedback: learningSets.feedback, hintsAllowed: learningSets.hintsAllowed }).from(learningSets).where(and(eq(learningSets.workspaceId, workspaceId), eq(learningSets.courseId, courseId), eq(learningSets.purpose, 'practice'), archived === 'all' ? undefined : eq(learningSets.archived, archived === 'true'), cursor ? gt(learningSets.id, cursor) : undefined)).orderBy(asc(learningSets.id)).limit(limit + 1);
  return { sets: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function patchSet(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof metadataInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'set-metadata', id, input }, async tx => {
    const row = await ownSet(tx, workspaceId, id);
    if (row.revision !== input.expectedRevision) throw conflict();
    await tx.update(learningSets).set({ name: input.name, archived: input.archived, revision: row.revision + 1, updatedAt: new Date() }).where(eq(learningSets.id, id));
    return ownSet(tx, workspaceId, id);
  });
}
export async function ownRun(tx: Transaction, workspaceId: string, id: string) {
  const [run] = await tx.select().from(learningRuns).where(and(eq(learningRuns.workspaceId, workspaceId), eq(learningRuns.id, id))).for('update');
  if (!run) throw notFound();
  return run;
}
export function publicQuestion(q: VersionedQuestion, show: boolean, hinted: boolean) {
  if (show) return q;
  // Supply only answer controls. Sorting choice pools does not encode a key.
  return { id: q.id, courseId: q.courseId, topicId: q.topicId, format: q.format, difficulty: q.difficulty, marks: q.marks, prompt: q.prompt, options: q.options, template: q.template, extract: q.extract,
    explanation: hinted ? q.explanation.split(/(?<=\.)\s+/)[0]! : '',
    ...(q.sequence ? { sequence: [...q.sequence].sort() } : {}),
    ...(q.pairs ? { pairs: [...q.pairs].map(p => p.left).sort().map((left, i) => ({ left, right: q.pairs!.map(p => p.right).sort()[i]! })) } : {}),
  };
}
export async function runView(tx: Transaction, workspaceId: string, id: string): Promise<LearningRun> {
  const run = await reconcileRun(tx, await ownRun(tx, workspaceId, id));
  const set = await ownSet(tx, workspaceId, run.setId);
  const items = await setQuestions(tx, workspaceId, set.id);
  const answers = await tx.select().from(runAnswers).where(and(eq(runAnswers.workspaceId, workspaceId), eq(runAnswers.runId, id)));
  const [attempt] = await tx.select({ id: learningAttempts.id }).from(learningAttempts).where(and(eq(learningAttempts.workspaceId, workspaceId), eq(learningAttempts.runId, id)));
  return { id, courseId: run.courseId, setId: set.id, title: run.title, revision: run.revision, state: run.state, position: run.position, feedback: set.feedback, hintsAllowed: set.hintsAllowed, startedAt: run.startedAt.toISOString(), deadlineAt: run.deadlineAt?.toISOString(), exam: run.exam, serverNow: new Date().toISOString(), attemptId: attempt?.id ?? null,
    items: items.map(item => {
      const a = answers.find(a => a.itemId === item.id);
      const response = a?.response ?? { kind: 'none' as const };
      const show = run.state === 'submitted' || (!run.exam && (!!a?.checked || !!a?.revealed));
      return { id: item.id, question: publicQuestion(item.question, show, !!a?.hinted), response, checked: !!a?.checked, revealed: !!a?.revealed, hinted: !!a?.hinted,
        ...((!run.exam && a?.checked) || run.state === 'submitted' ? { feedback: toQuestionAttempt(item.question, response, !!a?.hinted) } : {}) };
    }) };
}
export async function getRun(db: SocketDb, workspaceId: string, id: string) { return transaction(db, tx => runView(tx, workspaceId, id)); }
export async function startRun(db: SocketDb, workspaceId: string, setId: string, id: string, plannedSessionId?: string) {
  return operation(db, workspaceId, id, { action: 'start-run', setId, id, plannedSessionId }, async tx => {
    const set = await ownSet(tx, workspaceId, setId);
    if (set.archived) throw new ApiError(409, 'archived', 'Restore this set before starting a new attempt.');
    if (plannedSessionId) await validatePlannedLink(tx, workspaceId, set.courseId, plannedSessionId, false);
    const [saved] = await tx.insert(learningRuns).values({ id, workspaceId, courseId: set.courseId, setId, title: set.name, plannedSessionId }).onConflictDoNothing().returning();
    if (!saved) throw notFound();
    return runView(tx, workspaceId, id);
  });
}
async function saveBatch(tx: Transaction, run: typeof learningRuns.$inferSelect, input: z.infer<typeof runWriteInput>) {
  const items = await setQuestions(tx, run.workspaceId, run.setId);
  if (run.exam && input.position !== run.position) throw new ApiError(400, 'exam_navigation', 'Use exam navigation to change position.');
  if (input.position >= items.length) throw new ApiError(400, 'invalid_input', 'Choose a question in this run.');
  const answers = await tx.select().from(runAnswers).where(eq(runAnswers.runId, run.id));
  for (const entry of input.answers) {
    const item = items.find(i => i.id === entry.itemId);
    if (!item) throw notFound();
    if (!validResponse(item.question, entry.response)) throw new ApiError(400, 'invalid_response', 'The answer does not match this question.');
    if (run.exam) {
      const runtime = { ...run.exam, answers: {} }; const loc = locate(runtime, item.question.id);
      if (!loc || sectionLocked(runtime, loc.sectionIndex) || (runtime.configSnapshot.navigation === 'sequential' && items.findIndex(i => i.id === item.id) < run.position)) throw new ApiError(409, 'section_locked', 'This section or question is locked.');
    }
    const prior = answers.find(a => a.itemId === entry.itemId);
    if (prior?.checked && !sameAnswer(prior.response, entry.response)) throw new ApiError(409, 'answer_locked', 'This answer was checked. Start a new attempt to answer it again.');
    if (entry.response.kind === 'self-rating' && !prior?.revealed) throw new ApiError(409, 'reveal_required', 'Reveal the flashcard before rating your recall.');
    await tx.insert(runAnswers).values({ workspaceId: run.workspaceId, courseId: run.courseId, runId: run.id, setId: run.setId, itemId: item.id, response: entry.response }).onConflictDoUpdate({ target: [runAnswers.runId, runAnswers.itemId], set: { response: entry.response } });
  }
}
export async function writeRun(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof runWriteInput>, submit: boolean) {
  // Commit deadline reconciliation even when the following write is rejected.
  await getRun(db, workspaceId, id);
  return operation(db, workspaceId, input.operationId, { action: submit ? 'submit' : 'save-answers', id, input }, async tx => {
    const run = await reconcileRun(tx, await ownRun(tx, workspaceId, id));
    if (run.state === 'submitted') {
      if (submit) return runView(tx, workspaceId, id);
      throw new ApiError(409, 'run_submitted', 'This run is submitted. Open its result.');
    }
    if (run.revision !== input.expectedRevision) throw conflict();
    await saveBatch(tx, run, input);
    if (submit) await finalizeRun(tx, run, 'manual');
    else await tx.update(learningRuns).set({ revision: run.revision + 1, position: input.position }).where(eq(learningRuns.id, id));
    return runView(tx, workspaceId, id);
  });
}
export async function transition(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof transitionInput>) {
  await getRun(db, workspaceId, id);
  return operation(db, workspaceId, input.operationId, { action: 'transition', id, input }, async tx => {
    const run = await reconcileRun(tx, await ownRun(tx, workspaceId, id));
    if (run.exam) throw new ApiError(409, 'exam_feedback_locked', 'Exam feedback is available only after submitting the whole paper.');
    if (run.state !== 'active' || run.revision !== input.expectedRevision) throw conflict();
    const set = await ownSet(tx, workspaceId, run.setId);
    const item = (await setQuestions(tx, workspaceId, set.id)).find(i => i.id === input.itemId);
    if (!item) throw notFound();
    if (input.action === 'reveal' && item.question.format !== 'flashcard' || input.action === 'hint' && (!set.hintsAllowed || item.question.format === 'flashcard') || input.action === 'check' && set.feedback !== 'immediate') throw new ApiError(400, 'invalid_transition', 'This action is unavailable for this question.');
    const flag = input.action === 'check' ? { checked: true } : input.action === 'reveal' ? { revealed: true } : { hinted: true };
    await tx.insert(runAnswers).values({ workspaceId, courseId: run.courseId, runId: id, setId: set.id, itemId: item.id, response: { kind: 'none' }, ...flag }).onConflictDoUpdate({ target: [runAnswers.runId, runAnswers.itemId], set: flag });
    await tx.update(learningRuns).set({ revision: run.revision + 1 }).where(eq(learningRuns.id, id));
    return runView(tx, workspaceId, id);
  });
}
export async function history(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select({ id: learningAttempts.id, snapshot: learningAttempts.snapshot }).from(learningAttempts).where(and(eq(learningAttempts.workspaceId, workspaceId), eq(learningAttempts.courseId, courseId), cursor ? gt(learningAttempts.id, cursor) : undefined)).orderBy(asc(learningAttempts.id)).limit(limit + 1);
  const current = await withFeedback(db, workspaceId, rows.slice(0, limit).map(r => r.snapshot));
  return { attempts: current.map(a => ({ id: a.id, title: a.title, completedAt: a.completedAt, marksAwarded: a.marksAwarded, marksAvailable: a.marksAvailable, pending: a.pending })), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function attempt(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select({ snapshot: learningAttempts.snapshot }).from(learningAttempts).where(and(eq(learningAttempts.workspaceId, workspaceId), eq(learningAttempts.id, id)));
  if (!row) throw notFound();
  return (await withFeedback(db, workspaceId, [row.snapshot]))[0]!;
}
export async function activeRuns(db: Db, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select({ id: learningRuns.id, title: learningRuns.title, startedAt: learningRuns.startedAt }).from(learningRuns).where(and(eq(learningRuns.workspaceId, workspaceId), eq(learningRuns.courseId, courseId), eq(learningRuns.state, 'active'), cursor ? gt(learningRuns.id, cursor) : undefined)).orderBy(asc(learningRuns.id)).limit(limit + 1);
  return { runs: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}

export async function finalizeRun(tx: Transaction, run: typeof learningRuns.$inferSelect, finish: 'manual' | 'expired') {
  if (run.state === 'submitted') return;
  const completedAt = new Date();
  const items = await setQuestions(tx, run.workspaceId, run.setId);
  const answers = await tx.select().from(runAnswers).where(eq(runAnswers.runId, run.id));
  const questions = items.map(item => { const a = answers.find(a => a.itemId === item.id); return { question: item.question, result: toQuestionAttempt(item.question, a?.response ?? { kind: 'none' }, !!a?.hinted) }; });
  const set = await ownSet(tx, run.workspaceId, run.setId);
  const snapshot: LearningAttempt = { id: crypto.randomUUID(), runId: run.id, courseId: run.courseId, title: run.title, startedAt: run.startedAt.toISOString(), completedAt: completedAt.toISOString(), markingVersion: 'objective-v1', questions, ...attemptTotals(questions.map(q => q.result)), exam: run.exam, plannedSessionId: run.plannedSessionId ?? undefined, remediatesAttemptId: set.remediatesAttemptId ?? undefined, ...(run.exam ? { finish } : {}) };
  await tx.insert(learningAttempts).values({ id: snapshot.id, workspaceId: run.workspaceId, courseId: run.courseId, runId: run.id, setId: run.setId, snapshot });
  await tx.update(learningRuns).set({ revision: run.revision + 1, state: 'submitted', completedAt }).where(eq(learningRuns.id, run.id));
  if (run.plannedSessionId) {
    const [planned] = await tx.select().from(plannedSessions).where(and(eq(plannedSessions.workspaceId, run.workspaceId), eq(plannedSessions.courseId, run.courseId), eq(plannedSessions.id, run.plannedSessionId))).for('update');
    if (planned && !planned.content.completedBy) await tx.update(plannedSessions).set({ content: { ...planned.content, status: 'completed', completedBy: snapshot.id, completedAt: completedAt.toISOString() }, revision: planned.revision + 1 }).where(eq(plannedSessions.id, planned.id));
  }
  await bumpPlanner(tx, run.workspaceId);
}
export async function reconcileRun(tx: Transaction, run: typeof learningRuns.$inferSelect) {
  if (run.state !== 'active' || !run.exam) return run;
  const now = Date.now();
  if (run.deadlineAt && run.deadlineAt.getTime() <= now) {
    await finalizeRun(tx, run, 'expired');
    return ownRun(tx, run.workspaceId, run.id);
  }
  const exam = structuredClone(run.exam);
  let changed = false;
  for (const [sectionId, deadline] of Object.entries(exam.sectionDeadlines)) {
    if (new Date(deadline).getTime() <= now && !exam.lockedSectionIds.includes(sectionId)) {
      exam.lockedSectionIds.push(sectionId); exam.sectionOutcomes.push({ sectionId, ended: 'expired', endedAt: deadline }); changed = true;
    }
  }
  if (exam.configSnapshot.sections.every(s => exam.lockedSectionIds.includes(s.id))) {
    await finalizeRun(tx, { ...run, exam }, 'expired'); return ownRun(tx, run.workspaceId, run.id);
  }
  if (changed) {
    const [next] = await tx.update(learningRuns).set({ exam, revision: run.revision + 1 }).where(eq(learningRuns.id, run.id)).returning(); return next!;
  }
  return run;
}
export async function reconcileExams(db: SocketDb) {
  const due = await db.select({ id: learningRuns.id, workspaceId: learningRuns.workspaceId }).from(learningRuns).where(and(eq(learningRuns.state, 'active'), lte(learningRuns.deadlineAt, new Date()))).orderBy(asc(learningRuns.deadlineAt), asc(learningRuns.id)).limit(25);
  for (const row of due) await transaction(db, async tx => { await reconcileRun(tx, await ownRun(tx, row.workspaceId, row.id)); });
  return { reconciled: due.length };
}

export async function validatePlannedLink(tx: Transaction, workspaceId: string, courseId: string, id: string, exam: boolean) {
  const [row] = await tx.select().from(plannedSessions).where(and(eq(plannedSessions.workspaceId, workspaceId), eq(plannedSessions.courseId, courseId), eq(plannedSessions.id, id)));
  if (!row || (exam ? row.content.activity !== 'exam' : !['practice', 'flashcards', 'review'].includes(row.content.activity))) throw notFound();
  return row;
}
