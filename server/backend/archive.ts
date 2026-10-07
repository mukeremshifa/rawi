import { z } from 'zod';
import { localTransferInput, legacyQuestion, legacyAttempt, questionAttempt, grading } from '../../src/shared/transfer';
import { sourceInput } from '../../src/shared/learning';
import { ApiError } from './errors';

const id = z.string().min(1).max(200), text = z.string().max(20000), instant = z.string().refine(s => Number.isFinite(Date.parse(s)));
const state = localTransferInput.shape.state.shape;
const source = sourceInput.nullish();
const question = legacyQuestion.omit({ source: true }).extend({ source, topicLabel: text, origin: z.enum(['generated', 'imported']) });
const course = state.courses.element;
const archive = z.object({ format: z.literal('rawi-online-workspace'), version: z.literal(1), exportedAt: instant, data: z.object({
  courses: z.array(course).max(50), topics: z.array(state.topics.element.omit({ relatedTopicIds: true })).max(2000),
  topicLinks: z.array(z.object({ courseId: id, sourceId: id, targetId: id })).max(5000),
  materials: z.array(z.object({ id, courseId: id, title: text, kind: z.enum(['reading', 'notes', 'slides', 'other']), attribution: text, archived: z.boolean(), currentVersionId: id.nullable(), noteSource: source })).max(500),
  versions: z.array(z.object({ id, courseId: id, materialId: id, number: z.number().int().positive(), origin: z.enum(['paste', 'upload', 'edit']), contentStatus: z.enum(['readable', 'not_extracted', 'failed']), format: z.enum(['txt', 'md', 'pdf', 'docx', 'pptx']), createdAt: instant })).max(5000),
  passages: z.array(z.object({ id, courseId: id, materialId: id, versionId: id, heading: text, text: z.string().max(1048576), order: z.number().int().min(0) })).max(20000),
  materialTopics: z.array(z.object({ courseId: id, materialId: id, topicId: id })).max(5000),
  questions: z.array(z.object({ content: question })).max(2000),
  sets: z.array(z.object({ id, courseId: id, name: text, feedback: z.enum(['immediate', 'end']), hintsAllowed: z.boolean(), archived: z.boolean(), purpose: z.enum(['practice', 'exam']), createdAt: instant })).max(5000),
  setItems: z.array(z.object({ id, courseId: id, setId: id, questionId: id, position: z.number().int().min(0) })).max(20000),
  runs: z.array(z.object({ id, courseId: id, setId: id, title: text, state: z.enum(['active', 'submitted']), position: z.number().int().min(0).max(49), startedAt: instant, exam: z.unknown().nullish() })).max(5000),
  answers: z.array(z.object({ runId: id, setId: id, courseId: id, itemId: id, response: questionAttempt.shape.response, hinted: z.boolean(), revealed: z.boolean(), checked: z.boolean() })).max(20000),
  attempts: z.array(z.object({ snapshot: z.object({ id, runId: id, courseId: id, title: text, startedAt: instant, completedAt: instant, markingVersion: text, questions: z.array(z.object({ question, result: questionAttempt })).max(200), marksAwarded: z.number().min(0), marksAvailable: z.number().min(0), finish: z.enum(['manual', 'expired']).optional(), imported: legacyAttempt.optional() }) })).max(2000),
  tutorSessions: z.array(z.object({ id, courseId: id, topicId: id, topicLabel: text, title: text, archived: z.boolean(), stage: state.tutorSessions.element.shape.stage, source, createdAt: instant, updatedAt: instant, endedAt: instant.nullish(), plannedSessionId: id.nullish() })).max(1000),
  tutorMessages: z.array(z.object({ id, sessionId: id, courseId: id, ordinal: z.number().int().min(0), text, role: z.enum(['student', 'tutor']), state: z.enum(['complete', 'blocked', 'cancelled', 'interrupted', 'failed']), provenance: z.object({ stage: state.tutorSessions.element.shape.stage.optional(), model: text.optional(), grounding: z.enum(['materials', 'mixed', 'general', 'insufficient']).optional(), citations: z.array(sourceInput).max(100) }).nullish() })).max(20000),
  exams: z.array(z.object({ config: state.examConfigs.element })).max(1000),
  assessments: z.array(z.object({ content: state.assessments.element })).max(1000),
  plannedSessions: z.array(z.object({ content: state.sessions.element })).max(2000),
  checkIns: z.array(z.object({ content: state.checkIns.element })).max(2000),
  feedbackRevisions: z.array(z.object({ id, attemptId: id, questionId: id, revision: z.number().int().positive(), grading, createdAt: instant })).max(10000),
}) });

/** Convert portable records through the same ownership and domain validator.
 * Exact material history is carried separately, never collapsed into current text.
 * Provider operations and local timers cannot establish new execution authority.
 */
export function archiveTransfer(input: unknown) {
  const { data: d } = archive.parse(input);
  const fail = (): never => { throw new ApiError(400, 'invalid_import', 'The archive has a missing or foreign record reference. Keep the original for recovery.'); };
  const materials = new Map(d.materials.map(m => [m.id, m]));
  const versions = new Map(d.versions.map(v => [v.id, v]));
  const questions = new Map(d.questions.map(q => [q.content.id, q.content]));
  const sets = new Map(d.sets.map(s => [s.id, s]));
  const runs = new Map(d.runs.map(r => [r.id, r]));
  const items = new Map(d.setItems.map(i => [i.id, i]));
  for (const rows of [d.versions, d.setItems, d.runs, d.tutorMessages]) if (new Set(rows.map(r => r.id)).size !== rows.length) fail();
  for (const v of d.versions) if (materials.get(v.materialId)?.courseId !== v.courseId) fail();
  for (const p of d.passages) { const v = versions.get(p.versionId); if (!v || v.materialId !== p.materialId || v.courseId !== p.courseId) fail(); }
  for (const m of d.materials) if (m.currentVersionId && versions.get(m.currentVersionId)?.materialId !== m.id) fail();
  for (const i of d.setItems) if (sets.get(i.setId)?.courseId !== i.courseId || questions.get(i.questionId)?.courseId !== i.courseId) fail();
  for (const r of d.runs) if (sets.get(r.setId)?.courseId !== r.courseId) fail();
  for (const a of d.answers) if (runs.get(a.runId)?.setId !== a.setId || runs.get(a.runId)?.courseId !== a.courseId || items.get(a.itemId)?.setId !== a.setId) fail();
  const exactSource = (ref: z.infer<typeof sourceInput> | null | undefined) => {
    if (!ref) return undefined;
    if (!d.passages.some(p => p.id === ref.passageId && p.materialId === ref.materialId && p.versionId === ref.versionId)) fail();
    return { materialId: ref.materialId, passageId: ref.passageId };
  };
  const topics = d.topics.map(t => ({ ...t, relatedTopicIds: d.topicLinks.filter(l => l.courseId === t.courseId && l.sourceId === t.id).map(l => l.targetId) }));
  const retiredTopics = [...new Map([...d.questions.map(q => ({ id: q.content.topicId, courseId: q.content.courseId, title: q.content.topicLabel })), ...d.tutorSessions.map(t => ({ id: t.topicId, courseId: t.courseId, title: t.topicLabel }))].filter(t => !topics.some(o => o.id === t.id)).map(t => [t.id, { ...t, summary: '', priority: 'normal', order: 0, relatedTopicIds: [] }])).values()];
  const savedPractice = d.sets.filter(s => s.purpose === 'practice' && d.setItems.some(i => i.setId === s.id)).map(s => ({ ...s, savedAt: s.createdAt, questionIds: d.setItems.filter(i => i.setId === s.id).sort((a, b) => a.position - b.position).map(i => i.questionId), config: { activity: 'quiz', topicIds: [], materialIds: [], length: 10, difficulties: [], hintsAllowed: s.hintsAllowed, feedback: s.feedback } }));
  const practiceRuns = d.runs.filter(r => r.state === 'active' && !r.exam).map(r => {
    const set = sets.get(r.setId)!; const answers = d.answers.filter(a => a.runId === r.id);
    return { ...r, questionIds: d.setItems.filter(i => i.setId === r.setId).sort((a, b) => a.position - b.position).map(i => i.questionId), answers: Object.fromEntries(answers.map(a => [items.get(a.itemId)!.questionId, a.response])), checkedIds: [], hintedIds: answers.filter(a => a.hinted).map(a => items.get(a.itemId)!.questionId), revisitIds: [], secondPass: false, hintsAllowed: set.hintsAllowed, feedback: set.feedback, index: r.position, updatedAt: r.startedAt };
  });
  const attempts = d.attempts.map(({ snapshot: a }) => ({ ...(a.imported ?? {}), ...a, kind: a.imported?.kind ?? (runs.get(a.runId)?.exam ? 'exam' : 'practice'), mode: a.imported?.mode ?? (runs.get(a.runId)?.exam ? 'exam' : 'practice'), topicIds: [...new Set(a.questions.map(q => q.question.topicId))], questions: a.questions.map(q => { if (questions.get(q.question.id)?.courseId !== a.courseId) fail(); exactSource(q.question.source); return q.result; }) }));
  const materialsList = d.materials.map(m => {
    const all = d.passages.filter(p => p.materialId === m.id).sort((a, b) => a.order - b.order).map(p => ({ ...p, topicIds: [] }));
    return { ...m, kind: m.kind === 'reading' ? 'reading' : 'student-note', origin: all.length ? 'pasted' : 'preview', topicIds: d.materialTopics.filter(t => t.materialId === m.id).map(t => t.topicId), passages: all.filter(p => p.versionId === m.currentVersionId), priorPassages: all.filter(p => p.versionId !== m.currentVersionId), noteSource: exactSource(m.noteSource), addedAt: d.versions.find(v => v.materialId === m.id)?.createdAt ?? '2026-01-01T00:00:00Z' };
  });
  const tutorSessions = d.tutorSessions.map(t => ({ ...t, source: exactSource(t.source), startedAt: t.createdAt, endedAt: t.endedAt ?? undefined, plannedSessionId: t.plannedSessionId ?? undefined, launchedAttemptIds: [], messages: d.tutorMessages.filter(m => m.sessionId === t.id).sort((a, b) => a.ordinal - b.ordinal).map(m => { if (m.courseId !== t.courseId) fail(); return { ...m, stage: m.provenance?.stage ?? t.stage, model: m.provenance?.model, grounding: m.provenance?.grounding, citations: m.provenance?.citations.map(c => exactSource(c)!), status: m.state === 'complete' ? 'complete' : 'interrupted' }; }) }));
  return { format: 'rawi-workspace', version: 1, state: { version: 2, courses: d.courses, topics, retiredTopics, materials: materialsList, questions: d.questions.map(({ content: q }) => ({ ...q, source: exactSource(q.source) })), savedPractice, practiceRuns, attempts, tutorSessions, examConfigs: d.exams.map(e => e.config), assessments: d.assessments.map(a => a.content), sessions: d.plannedSessions.map(s => s.content), checkIns: d.checkIns.map(c => c.content), availability: {}, activeExam: d.runs.some(r => r.state === 'active' && !!r.exam) ? { recoveryOnly: true } : undefined },
    materialHistory: d.versions.map(v => ({ ...v, current: materials.get(v.materialId)!.currentVersionId === v.id, passages: d.passages.filter(p => p.versionId === v.id).sort((a, b) => a.order - b.order) })),
    feedbackHistory: d.feedbackRevisions,
  };
}
