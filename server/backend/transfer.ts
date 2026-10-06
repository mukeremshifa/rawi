import { transaction } from './db';
import { and, asc, eq } from 'drizzle-orm';
import { localTransferInput, type LocalTransfer, type ImportReview } from '../../src/shared/transfer';
import { questionInput, type LearningAttempt, type VersionedQuestion } from '../../src/shared/learning';
import { attemptTotals } from '../../src/shared/marking';
import { ApiError, notFound } from './errors';
import { hash } from './materials';
import { operation } from './learning';
import { bumpPlanner } from './planning';
import * as s from './schema';
import type { SocketDb, Transaction } from './db';

const fail = (message: string): never => { throw new ApiError(400, 'invalid_import', message); };
function validate(input: unknown) {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 6 * 1048576) fail('Choose a Rawi export up to 6 MiB. Keep the original export for recovery.');
  const data = localTransferInput.parse(input); const state = data.state;
  const entities = [state.courses, state.topics, state.retiredTopics, state.materials, state.questions, state.savedPractice, state.attempts, state.examConfigs, state.assessments, state.sessions, state.tutorSessions];
  for (const rows of entities) if (new Set(rows.map(r => r.id)).size !== rows.length) fail('The export has duplicate record IDs.');
  const courseIds = new Set(state.courses.map(c => c.id));
  const topics = new Map([...state.topics, ...state.retiredTopics].map(t => [t.id, t]));
  const materials = new Map(state.materials.map(m => [m.id, m]));
  const questions = new Map(state.questions.map(q => [q.id, q]));
  function topic(id: string, courseId: string) { if (topics.get(id)?.courseId !== courseId) fail('A topic reference is missing or belongs to another course.'); }
  function source(ref: { materialId: string; passageId: string } | undefined, courseId: string) {
    if (!ref) return;
    const m = materials.get(ref.materialId); if (!m || m.origin === 'preview' || m.courseId !== courseId || ![...m.passages, ...m.priorPassages].some(p => p.id === ref.passageId)) fail('A source passage is missing or belongs to another course.');
  }
  for (const rows of entities.slice(1)) for (const record of rows) if ('courseId' in record && !courseIds.has(record.courseId)) fail('Every imported record must belong to an imported course.');
  for (const t of state.topics) for (const id of t.relatedTopicIds) topic(id, t.courseId);
  for (const m of state.materials) {
    for (const id of m.topicIds) topic(id, m.courseId); source(m.noteSource, m.courseId);
    const passages = [...m.priorPassages, ...m.passages];
    if (new Set(passages.map(p => p.id)).size !== passages.length) fail('A material has duplicate passage IDs.');
    for (const p of passages) for (const id of p.topicIds) topic(id, m.courseId);
  }
  for (const q of state.questions) {
    topic(q.topicId, q.courseId); source(q.source, q.courseId);
    const { id: _id, courseId: _course, provenance: _provenance, source: _source, ...content } = q;
    // Historical rubrics may omit totals. Keep them as recorded, never invent a grade.
    const normalized = { ...content, topicId: crypto.randomUUID(), ...(q.format === 'written-recall' || q.format === 'source-analysis' || q.format === 'essay' ? { rubric: [{ id: 'overall', label: 'Overall', marks: q.marks, keywords: [], missedAdvice: '' }] } : {}) };
    if (!questionInput.safeParse(normalized).success) fail(`Question ${q.id} has invalid answer content. Keep its original export for recovery.`);
  }
  for (const set of state.savedPractice) {
    if (!set.questionIds.length || set.questionIds.length > 50 || new Set(set.questionIds).size !== set.questionIds.length) fail('Saved sets must contain 1 to 50 distinct questions.');
    for (const id of set.questionIds) if (questions.get(id)?.courseId !== set.courseId) fail('A saved set references a missing or foreign question.');
  }
  for (const a of state.attempts) {
    for (const result of a.questions) { const q = questions.get(result.questionId); if (!q || q.courseId !== a.courseId || q.topicId !== result.topicId || q.format !== result.format || result.marksAwarded > result.marksAvailable) fail('An attempt has an invalid question reference or recorded marks.'); }
  }
  function owned(rows: { id: string; courseId: string }[], id: string, courseId: string) { if (!rows.some(r => r.id === id && r.courseId === courseId)) fail('A linked activity is missing or belongs to another course.'); }
  for (const t of state.tutorSessions) { if (t.plannedSessionId) owned(state.sessions, t.plannedSessionId, t.courseId); topic(t.topicId, t.courseId); source(t.source, t.courseId); if (new Set(t.messages.map(m => m.id)).size !== t.messages.length) fail('A tutor session has duplicate message IDs.'); for (const m of t.messages) { source(m.source, t.courseId); for (const c of m.citations ?? []) source(c, t.courseId); } if (t.fromAttemptId) owned(state.attempts, t.fromAttemptId, t.courseId); if (t.fromQuestionId) owned(state.questions, t.fromQuestionId, t.courseId); }
  for (const a of state.assessments) for (const id of a.topicIds) topic(id, a.courseId);
  for (const e of state.examConfigs) { for (const id of e.sections.flatMap(s => s.topicIds)) topic(id, e.courseId); for (const id of e.allowedMaterialIds) owned(state.materials, id, e.courseId); for (const id of e.assessmentIds ?? []) owned(state.assessments, id, e.courseId); }
  for (const s of state.sessions) { for (const id of s.topicIds) topic(id, s.courseId); if (s.assessmentId) owned(state.assessments, s.assessmentId, s.courseId);
    const l = s.link; if (l?.kind === 'material') owned(state.materials, l.materialId, s.courseId); if (l?.kind === 'practice-set') owned(state.savedPractice, l.setId, s.courseId); if (l?.kind === 'exam-config') owned(state.examConfigs, l.configId, s.courseId); if (l?.kind === 'tutor') topic(l.topicId, s.courseId); if (l?.kind === 'practice-new') for (const id of l.topicIds) topic(id, s.courseId); if (l?.kind === 'mistake-review') { owned(state.attempts, l.attemptId, s.courseId); for (const id of l.questionIds) owned(state.questions, id, s.courseId); }
  }
  if (new Set(state.checkIns.map(c => c.id)).size !== state.checkIns.length) fail('The export has duplicate check-in IDs.');
  for (const c of state.checkIns) { if (c.courseId && !courseIds.has(c.courseId)) fail('A check-in course is missing.'); if (c.topicId) { if (!c.courseId) fail('A check-in topic needs a course.'); topic(c.topicId, c.courseId!); } }
  return data;
}
function reviewFor(id: string, data: LocalTransfer): ImportReview {
  const st = data.state;
  const unsupported: string[] = [];
  for (const [label, records] of [['Unfinished practice', st.practiceRuns]] as const) if (records.length) unsupported.push(`${label}: ${records.length} records stay in the recovery original and will not appear as online activity.`);
  unsupported.push(`${st.tutorSessions.length} tutor histories, ${st.examConfigs.length} rehearsal configurations, ${st.assessments.length} assessments, ${st.sessions.length} planner sessions and ${st.checkIns.length} check-ins will also be imported. Tutor provenance and historical planner completion are labelled as imported activity. Extra local tutor actions remain in the recovery original.`);
  if (st.activeExam) unsupported.push('An unfinished local exam cannot establish a server timer. It stays in the recovery original.');
  if (Object.keys(st.drafts ?? {}).length) unsupported.push('Local UI drafts stay in the recovery original.');
  if (st.carriedForward) unsupported.push('Previously carried-forward recovery data stays in the recovery original.');
  unsupported.push('Online preferences and availability are kept. Local preferences and availability stay in the recovery original.');
  const placeholders = st.materials.filter(m => m.origin === 'preview').length;
  if (placeholders) unsupported.push(`${placeholders} placeholder files remain unreadable and have no downloadable original.`);
  unsupported.push('Browser exports do not contain original file bytes. Imported materials have no downloadable original.');
  const incomplete = st.attempts.filter(a => !a.completedAt).length;
  if (incomplete) unsupported.push(`${incomplete} incomplete attempts stay in the recovery original.`);
  return { id, state: 'review', courses: st.courses.length, materials: st.materials.length, questions: st.questions.length, sets: st.savedPractice.length, attempts: st.attempts.length - incomplete, unsupported };
}
export async function prepareImport(db: SocketDb, workspaceId: string, input: unknown) {
  const data = validate(input); const fingerprint = await hash(JSON.stringify(input));
  return transaction(db, async tx => {
    const id = crypto.randomUUID();
    await tx.insert(s.workspaceImports).values({ id, workspaceId, fingerprint, original: input, review: reviewFor(id, data) }).onConflictDoNothing();
    const [row] = await tx.select().from(s.workspaceImports).where(and(eq(s.workspaceImports.workspaceId, workspaceId), eq(s.workspaceImports.fingerprint, fingerprint))); return row!.review;
  });
}
export async function importOriginal(db: SocketDb, workspaceId: string, id: string) {
  const [row] = await db.select({ original: s.workspaceImports.original }).from(s.workspaceImports).where(and(eq(s.workspaceImports.workspaceId, workspaceId), eq(s.workspaceImports.id, id))); if (!row) throw notFound(); return row.original;
}
export async function commitImport(db: SocketDb, workspaceId: string, id: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'commit-import', id }, async tx => {
    const [row] = await tx.select().from(s.workspaceImports).where(and(eq(s.workspaceImports.workspaceId, workspaceId), eq(s.workspaceImports.id, id))).for('update'); if (!row) throw notFound();
    if (row.review.state === 'complete') return row.review;
    const state = validate(row.original).state;
    const map = new Map<string, string>(); const remap = (kind: string, old: string) => { const key = `${kind}:${old}`; if (!map.has(key)) map.set(key, crypto.randomUUID()); return map.get(key)!; };
    for (const c of state.courses) await tx.insert(s.courses).values({ ...c, id: remap('course', c.id), workspaceId, createFingerprint: row.fingerprint, createdAt: new Date(c.createdAt) });
    const allTopics = [...state.topics, ...state.retiredTopics];
    for (const t of state.topics) { const { relatedTopicIds: _related, ...fields } = t; await tx.insert(s.topics).values({ ...fields, id: remap('topic', t.id), courseId: remap('course', t.courseId), workspaceId, module: t.module ?? '' }); }
    const topicIds = new Set(state.topics.map(t => t.id));
    for (const t of state.topics) { const links = t.relatedTopicIds.filter(id => topicIds.has(id) && id !== t.id).map(id => ({ workspaceId, courseId: remap('course', t.courseId), sourceId: remap('topic', t.id), targetId: remap('topic', id) })); if (links.length) await tx.insert(s.topicLinks).values(links); }
    const sources = new Map<string, { materialId: string; versionId: string; passageId: string }>();
    for (const m of state.materials) {
      const materialId = remap('material', m.id), courseId = remap('course', m.courseId);
      await tx.insert(s.materials).values({ id: materialId, workspaceId, courseId, title: m.title, kind: m.kind === 'reading' ? 'reading' : 'notes', attribution: `${m.attribution ?? ''}${m.origin === 'authored' ? '\nImported fictional demo content.' : ''}`, archived: m.archived ?? false, createFingerprint: row.fingerprint, createdAt: new Date(m.addedAt) });
      let number = 0;
      for (const group of [m.priorPassages, m.passages]) {
        if (!group.length && number) continue;
        const versionId = crypto.randomUUID(); number++;
        await tx.insert(s.materialVersions).values({ id: versionId, workspaceId, courseId, materialId, number, requestId: crypto.randomUUID(), fingerprint: row.fingerprint, origin: 'paste', contentStatus: m.origin === 'preview' ? 'not_extracted' : 'readable', format: 'md', createdAt: new Date(m.updatedAt ?? m.addedAt) });
        if (group.length && m.origin !== 'preview') {
          await tx.insert(s.passages).values(group.map((p, order) => { const passageId = remap('passage', `${m.id}:${p.id}`); sources.set(`${m.id}:${p.id}`, { materialId, versionId, passageId }); return { id: passageId, workspaceId, courseId, materialId, versionId, heading: p.heading, text: p.text, order }; }));
        }
        await tx.update(s.materials).set({ currentVersionId: versionId }).where(eq(s.materials.id, materialId));
      }
      const links = m.topicIds.filter(id => topicIds.has(id)).map(id => ({ workspaceId, courseId, materialId, topicId: remap('topic', id) })); if (links.length) await tx.insert(s.materialTopicLinks).values(links);
    }
    for (const m of state.materials) if (m.noteSource) await tx.update(s.materials).set({ noteSource: sources.get(`${m.noteSource.materialId}:${m.noteSource.passageId}`) }).where(eq(s.materials.id, remap('material', m.id)));
    for (const a of state.assessments) { const content = { ...a, id: remap('assessment', a.id), courseId: remap('course', a.courseId), topicIds: a.topicIds.map(id => remap('topic', id)) }; await tx.insert(s.assessments).values({ id: content.id, workspaceId, courseId: content.courseId, date: content.date, content }); }
    for (const e of state.examConfigs) { const config = { ...e, id: remap('exam', e.id), courseId: remap('course', e.courseId), sections: e.sections.map(v => ({ ...v, id: remap('section', `${e.id}:${v.id}`), topicIds: v.topicIds.map(id => remap('topic', id)) })), allowedMaterialIds: e.allowedMaterialIds.map(id => remap('material', id)), assessmentIds: e.assessmentIds?.map(id => remap('assessment', id)) }; await tx.insert(s.examConfigs).values({ id: config.id, workspaceId, courseId: config.courseId, config, archived: e.archived }); }
    for (const planned of state.sessions) {
      let link = planned.link;
      if (link?.kind === 'material') link = { ...link, materialId: remap('material', link.materialId) };
      if (link?.kind === 'practice-set') link = { ...link, setId: remap('set', link.setId) };
      if (link?.kind === 'exam-config') link = { ...link, configId: remap('exam', link.configId) };
      if (link?.kind === 'tutor') link = { ...link, topicId: remap('topic', link.topicId) };
      if (link?.kind === 'practice-new') link = { ...link, topicIds: link.topicIds.map(id => remap('topic', id)) };
      if (link?.kind === 'mistake-review') link = { ...link, attemptId: remap('attempt', link.attemptId), questionIds: link.questionIds.map(id => remap('question', id)) };
      const completedBy = planned.completedBy ? state.attempts.some(a => a.id === planned.completedBy) ? remap('attempt', planned.completedBy) : state.tutorSessions.some(t => t.id === planned.completedBy) ? remap('tutor', planned.completedBy) : undefined : undefined;
      const content = { ...planned, id: remap('planned', planned.id), courseId: remap('course', planned.courseId), topicIds: planned.topicIds.map(id => remap('topic', id)), assessmentId: planned.assessmentId ? remap('assessment', planned.assessmentId) : undefined, completedBy, link };
      await tx.insert(s.plannedSessions).values({ id: content.id, workspaceId, courseId: content.courseId, date: content.date, content });
    }
    for (const c of state.checkIns) await tx.insert(s.checkIns).values({ id: remap('check', c.id), workspaceId, content: { ...c, id: remap('check', c.id), courseId: c.courseId ? remap('course', c.courseId) : undefined, topicId: c.topicId ? remap('topic', c.topicId) : undefined } });
    for (const tutor of state.tutorSessions) {
      const id = remap('tutor', tutor.id), courseId = remap('course', tutor.courseId);
      const source = tutor.source ? sources.get(`${tutor.source.materialId}:${tutor.source.passageId}`) : undefined;
      const label = allTopics.find(t => t.id === tutor.topicId)!.title;
      await tx.insert(s.tutorSessions).values({ id, workspaceId, courseId, topicId: remap('topic', tutor.topicId), topicLabel: label, title: tutor.title ?? label, stage: tutor.stage, plannedSessionId: tutor.plannedSessionId ? remap('planned', tutor.plannedSessionId) : undefined, archived: tutor.archived, source, imported: true, createdAt: new Date(tutor.startedAt), updatedAt: new Date(tutor.updatedAt), endedAt: tutor.endedAt ? new Date(tutor.endedAt) : null });
      if (tutor.messages.length) await tx.insert(s.tutorMessages).values(tutor.messages.map((m, ordinal) => ({ id: remap('message', `${tutor.id}:${m.id}`), workspaceId, courseId, sessionId: id, ordinal, text: m.text, role: m.role, state: m.status === 'interrupted' ? 'interrupted' as const : 'complete' as const, operationId: crypto.randomUUID(), createdAt: new Date(tutor.startedAt), provenance: { imported: true as const, stage: m.stage, model: m.model, grounding: m.grounding, droppedCitations: m.droppedCitations, citations: [...(m.citations ?? []), ...(m.source ? [m.source] : [])].map(ref => sources.get(`${ref.materialId}:${ref.passageId}`)!) } })));
    }
    const questionMap = new Map<string, VersionedQuestion>();
    for (const q of state.questions) {
      const source = q.source ? sources.get(`${q.source.materialId}:${q.source.passageId}`) : undefined;
      if (q.source && !source) fail('Questions cannot cite unreadable placeholder content. Keep the original export.');
      const content: VersionedQuestion = { ...q, id: remap('question', q.id), courseId: remap('course', q.courseId), topicId: remap('topic', q.topicId), topicLabel: allTopics.find(t => t.id === q.topicId)!.title, origin: 'imported', originalId: q.id, source, provenance: q.provenance ? { ...q.provenance, materialIds: q.provenance.materialIds.map(id => remap('material', id)) } : undefined };
      await tx.insert(s.questionVersions).values({ id: content.id, workspaceId, courseId: content.courseId, content }); questionMap.set(q.id, content);
      if (source) await tx.insert(s.questionSources).values({ workspaceId, courseId: content.courseId, questionId: content.id, ...source });
    }
    async function saveSet(id: string, courseId: string, name: string, questions: string[], feedback: 'immediate' | 'end', hintsAllowed: boolean, archived = false) {
      await tx.insert(s.learningSets).values({ id, workspaceId, courseId, name, archived, feedback, hintsAllowed, fingerprint: row!.fingerprint });
      if (questions.length) await tx.insert(s.setItems).values(questions.map((q, position) => ({ id: crypto.randomUUID(), workspaceId, courseId, setId: id, questionId: questionMap.get(q)!.id, position })));
    }
    for (const set of state.savedPractice) await saveSet(remap('set', set.id), remap('course', set.courseId), set.name, set.questionIds, set.config.feedback, set.config.hintsAllowed, set.archived);
    for (const a of state.attempts) {
      if (!a.completedAt) continue;
      const courseId = remap('course', a.courseId), runId = crypto.randomUUID(), setId = crypto.randomUUID(), attemptId = remap('attempt', a.id);
      await saveSet(setId, courseId, a.title, a.questions.map(q => q.questionId), 'end', false, true);
      const questions = a.questions.map(result => ({ question: questionMap.get(result.questionId)!, result: { ...result, questionId: remap('question', result.questionId), topicId: remap('topic', result.topicId) } }));
      const imported = { ...a, id: attemptId, courseId, topicIds: a.topicIds.map(id => remap('topic', id)), questions: questions.map(q => q.result), assistanceRecord: a.assistanceRecord ?? 'unknown' as const, practiceSetId: a.practiceSetId ? remap('set', a.practiceSetId) : undefined, examConfigId: a.examConfigId && state.examConfigs.some(e => e.id === a.examConfigId) ? remap('exam', a.examConfigId) : undefined, assessmentId: a.assessmentId && state.assessments.some(e => e.id === a.assessmentId) ? remap('assessment', a.assessmentId) : undefined, plannedSessionId: a.plannedSessionId && state.sessions.some(e => e.id === a.plannedSessionId) ? remap('planned', a.plannedSessionId) : undefined, remediatesAttemptId: a.remediatesAttemptId ? remap('attempt', a.remediatesAttemptId) : undefined };
      const snapshot: LearningAttempt = { id: attemptId, courseId, runId, title: a.title, startedAt: a.startedAt, completedAt: a.completedAt, markingVersion: 'imported-recorded', questions, ...attemptTotals(questions.map(q => q.result)), imported, finish: a.finish };
      await tx.insert(s.learningRuns).values({ id: runId, workspaceId, courseId, setId, title: a.title, state: 'submitted', startedAt: new Date(a.startedAt), completedAt: new Date(a.completedAt) });
      await tx.insert(s.learningAttempts).values({ id: attemptId, workspaceId, courseId, runId, setId, snapshot });
    }
    const review: ImportReview = { ...row.review, state: 'complete', courseIds: state.courses.map(c => remap('course', c.id)) };
    await tx.update(s.workspaceImports).set({ review }).where(eq(s.workspaceImports.id, id)); await bumpPlanner(tx, workspaceId); return review;
  });
}
async function exportRows(tx: Transaction, workspaceId: string) {
  // Explicit per-table account scope. Credentials, sessions, signed URLs and
  // storage object keys are excluded from the portable account export.
  return {
    courses: await tx.select({ id: s.courses.id, name: s.courses.name, description: s.courses.description, goal: s.courses.goal, accent: s.courses.accent, archived: s.courses.archived, createdAt: s.courses.createdAt }).from(s.courses).where(eq(s.courses.workspaceId, workspaceId)).orderBy(asc(s.courses.id)),
    topics: await tx.select().from(s.topics).where(eq(s.topics.workspaceId, workspaceId)), topicLinks: await tx.select().from(s.topicLinks).where(eq(s.topicLinks.workspaceId, workspaceId)),
    materials: await tx.select({ id: s.materials.id, courseId: s.materials.courseId, title: s.materials.title, kind: s.materials.kind, attribution: s.materials.attribution, archived: s.materials.archived, currentVersionId: s.materials.currentVersionId, noteSource: s.materials.noteSource }).from(s.materials).where(eq(s.materials.workspaceId, workspaceId)),
    versions: await tx.select({ id: s.materialVersions.id, courseId: s.materialVersions.courseId, materialId: s.materialVersions.materialId, number: s.materialVersions.number, origin: s.materialVersions.origin, contentStatus: s.materialVersions.contentStatus, format: s.materialVersions.format, createdAt: s.materialVersions.createdAt }).from(s.materialVersions).where(eq(s.materialVersions.workspaceId, workspaceId)),
    passages: await tx.select().from(s.passages).where(eq(s.passages.workspaceId, workspaceId)), materialTopics: await tx.select().from(s.materialTopicLinks).where(eq(s.materialTopicLinks.workspaceId, workspaceId)),
    questions: await tx.select({ content: s.questionVersions.content }).from(s.questionVersions).where(eq(s.questionVersions.workspaceId, workspaceId)), sets: await tx.select().from(s.learningSets).where(eq(s.learningSets.workspaceId, workspaceId)), setItems: await tx.select().from(s.setItems).where(eq(s.setItems.workspaceId, workspaceId)),
    runs: await tx.select().from(s.learningRuns).where(eq(s.learningRuns.workspaceId, workspaceId)), answers: await tx.select().from(s.runAnswers).where(eq(s.runAnswers.workspaceId, workspaceId)), attempts: await tx.select({ snapshot: s.learningAttempts.snapshot }).from(s.learningAttempts).where(eq(s.learningAttempts.workspaceId, workspaceId)),
    tutorSessions: await tx.select().from(s.tutorSessions).where(eq(s.tutorSessions.workspaceId, workspaceId)), tutorMessages: await tx.select().from(s.tutorMessages).where(eq(s.tutorMessages.workspaceId, workspaceId)),
    exams: await tx.select().from(s.examConfigs).where(eq(s.examConfigs.workspaceId, workspaceId)), assessments: await tx.select().from(s.assessments).where(eq(s.assessments.workspaceId, workspaceId)), plannedSessions: await tx.select().from(s.plannedSessions).where(eq(s.plannedSessions.workspaceId, workspaceId)), planner: await tx.select().from(s.plannerState).where(eq(s.plannerState.workspaceId, workspaceId)), checkIns: await tx.select().from(s.checkIns).where(eq(s.checkIns.workspaceId, workspaceId)), preferences: await tx.select().from(s.preferences).where(eq(s.preferences.workspaceId, workspaceId)),
    feedbackRevisions: await tx.select().from(s.feedbackRevisions).where(eq(s.feedbackRevisions.workspaceId, workspaceId)), aiOperations: await tx.select().from(s.aiOperations).where(eq(s.aiOperations.workspaceId, workspaceId)), aiExecutions: await tx.select().from(s.aiExecutions).where(eq(s.aiExecutions.workspaceId, workspaceId)), reminders: await tx.select().from(s.reminderStates).where(eq(s.reminderStates.workspaceId, workspaceId)),
    recoveryOriginals: await tx.select({ id: s.workspaceImports.id, original: s.workspaceImports.original, review: s.workspaceImports.review }).from(s.workspaceImports).where(eq(s.workspaceImports.workspaceId, workspaceId)),
  };
}
export async function exportWorkspace(db: SocketDb, workspaceId: string) {
  return transaction(db, async tx => {
    const data = await exportRows(tx, workspaceId); const result = { format: 'rawi-online-workspace', version: 1, exportedAt: new Date().toISOString(), data };
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 20 * 1048576) throw new ApiError(409, 'export_limit', 'This workspace exceeds the 20 MiB export limit. No partial export was produced.'); return result;
  }, { isolationLevel: 'repeatable read' });
}
