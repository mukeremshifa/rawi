import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { buildRun, flatQuestionIds, locate, sectionLocked, validateConfig, withExtraTime } from '../../src/shared/exam';
import type { createExamInput, examTransitionInput, ExamRuntime } from '../../src/shared/online-exams';
import type { metadataInput } from '../../src/shared/learning';
import { assessments, examConfigs, learningRuns, learningSets, materials, questionVersions, setItems } from './schema';
import { operation, ownRun, reconcileRun, runView, validatePlannedLink, getRun } from './learning';
import { lockCourse, validateTopics } from './materials';
import { getCourse } from './service';
import { ApiError, conflict, notFound } from './errors';
import type { ReadDb, SocketDb, Transaction } from './db';

async function ownConfig(db: ReadDb | Transaction, workspaceId: string, id: string) {
  const [row] = await db.select().from(examConfigs).where(and(eq(examConfigs.workspaceId, workspaceId), eq(examConfigs.id, id)));
  if (!row) throw notFound(); return row;
}
export async function listExams(db: ReadDb, workspaceId: string, courseId: string, limit: number, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select({ id: examConfigs.id, courseId: examConfigs.courseId, config: examConfigs.config, archived: examConfigs.archived, revision: examConfigs.revision }).from(examConfigs).where(and(eq(examConfigs.workspaceId, workspaceId), eq(examConfigs.courseId, courseId), cursor ? gt(examConfigs.id, cursor) : undefined)).orderBy(asc(examConfigs.id)).limit(limit + 1);
  return { exams: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function createExam(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof createExamInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'exam-config', courseId, input }, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    await validateTopics(tx, workspaceId, courseId, [...new Set(input.config.sections.flatMap(s => s.topicIds))]);
    if (input.config.allowedMaterialIds.length) {
      const found = await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.workspaceId, workspaceId), eq(materials.courseId, courseId), inArray(materials.id, input.config.allowedMaterialIds)));
      if (found.length !== input.config.allowedMaterialIds.length) throw notFound();
    }
    if (input.config.assessmentIds?.length) {
      const found = await tx.select({ id: assessments.id }).from(assessments).where(and(eq(assessments.workspaceId, workspaceId), eq(assessments.courseId, courseId), inArray(assessments.id, input.config.assessmentIds)));
      if (found.length !== input.config.assessmentIds.length) throw notFound();
    }
    const [row] = await tx.insert(examConfigs).values({ id: input.id, workspaceId, courseId, config: { ...input.config, id: input.id, courseId, savedAt: new Date().toISOString() } }).onConflictDoNothing().returning();
    if (!row) throw notFound(); return row;
  });
}
export async function patchExam(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof metadataInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'exam-metadata', id, input }, async tx => {
    const row = await ownConfig(tx, workspaceId, id); if (row.revision !== input.expectedRevision) throw conflict();
    const [saved] = await tx.update(examConfigs).set({ config: { ...row.config, name: input.name }, archived: input.archived, revision: row.revision + 1, updatedAt: new Date() }).where(eq(examConfigs.id, id)).returning(); return saved!;
  });
}
export async function startExam(db: SocketDb, workspaceId: string, configId: string, id: string, plannedSessionId?: string) {
  return operation(db, workspaceId, id, { action: 'start-exam', configId, id, plannedSessionId }, async tx => {
    const row = await ownConfig(tx, workspaceId, configId); if (row.archived) throw new ApiError(409, 'archived', 'Restore this rehearsal before starting it.');
    const pool = await tx.select({ content: questionVersions.content }).from(questionVersions).where(and(eq(questionVersions.workspaceId, workspaceId), eq(questionVersions.courseId, row.courseId))).orderBy(asc(questionVersions.id));
    const problems = validateConfig(row.config, pool.map(q => q.content)).problems;
    if (problems.length) throw new ApiError(400, 'invalid_exam', problems.join(' '));
    if (plannedSessionId) await validatePlannedLink(tx, workspaceId, row.courseId, plannedSessionId, true);
    const now = Date.now();
    const initial = buildRun(row.config, pool.map(q => q.content), {}, now);
    if (!initial) throw new ApiError(400, 'invalid_exam', 'This rehearsal has no available questions.');
    const { answers: _answers, ...runtime } = initial;
    const allowed = row.config.book === 'open' && row.config.allowedMaterialIds.length ? await tx.select({ materialId: materials.id, versionId: materials.currentVersionId, title: materials.title }).from(materials).where(and(eq(materials.workspaceId, workspaceId), eq(materials.courseId, row.courseId), inArray(materials.id, row.config.allowedMaterialIds))) : [];
    const exam: ExamRuntime = { ...runtime, id, activatedSectionIds: [runtime.configSnapshot.sections[0]!.id], materialVersions: allowed.filter((m): m is typeof m & { versionId: string } => !!m.versionId) };
    const setId = crypto.randomUUID();
    await tx.insert(learningSets).values({ id: setId, workspaceId, courseId: row.courseId, name: row.config.name, fingerprint: id, purpose: 'exam', feedback: 'end', hintsAllowed: false });
    await tx.insert(setItems).values(flatQuestionIds(initial).map((questionId, position) => ({ id: crypto.randomUUID(), workspaceId, courseId: row.courseId, setId, questionId, position })));
    // Per-section clocks start on entry, with a whole-run upper bound equal to
    // the sum of allowed section time. A closed browser cannot park a timer.
    const minutes = row.config.timing === 'overall' ? row.config.totalMinutes : row.config.sections.reduce((n, s) => n + s.minutes, 0);
    const deadlineAt = row.config.timing === 'untimed' ? null : new Date(now + withExtraTime(minutes, row.config.extraTimePercent) * 60000);
    const [run] = await tx.insert(learningRuns).values({ id, workspaceId, courseId: row.courseId, setId, title: row.config.name, plannedSessionId, exam, deadlineAt, startedAt: new Date(now) }).onConflictDoNothing().returning();
    if (!run) throw notFound(); return runView(tx, workspaceId, id);
  });
}
export async function examTransition(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof examTransitionInput>) {
  await getRun(db, workspaceId, id);
  return operation(db, workspaceId, input.operationId, { action: 'exam-transition', id, input }, async tx => {
    const run = await reconcileRun(tx, await ownRun(tx, workspaceId, id));
    if (run.state === 'submitted') return runView(tx, workspaceId, id);
    if (!run.exam) throw notFound(); if (run.revision !== input.expectedRevision) throw conflict();
    const exam = structuredClone(run.exam); const runtime = { ...exam, answers: {} }; const ids = flatQuestionIds(runtime);
    const questionId = ids[input.position]; const target = questionId ? locate(runtime, questionId) : null;
    if (!target) throw notFound();
    if (input.action === 'flag') {
      if (!exam.configSnapshot.flaggingEnabled || input.position !== run.position) throw new ApiError(400, 'invalid_input', 'Flag the current question when flagging is enabled.');
      exam.flagged = exam.flagged.includes(questionId!) ? exam.flagged.filter(q => q !== questionId) : [...exam.flagged, questionId!];
    } else if (input.action === 'finish-section') {
      const section = exam.configSnapshot.sections[exam.currentSectionIndex]!;
      if (exam.configSnapshot.lockSectionsOnFinish && !exam.lockedSectionIds.includes(section.id)) { exam.lockedSectionIds.push(section.id); exam.sectionOutcomes.push({ sectionId: section.id, ended: 'submitted', endedAt: new Date().toISOString() }); }
    } else {
      if (exam.configSnapshot.navigation === 'sequential' && (input.position < run.position || input.position > run.position + 1 && ids.slice(run.position + 1, input.position).some(id => !sectionLocked(runtime, locate(runtime, id)!.sectionIndex)))) throw new ApiError(409, 'question_locked', 'Move to the next available question in this rehearsal.');
      if (sectionLocked(runtime, target.sectionIndex) && exam.configSnapshot.navigation === 'sequential') throw new ApiError(409, 'section_locked', 'This section is locked.');
      const section = exam.configSnapshot.sections[target.sectionIndex]!;
      exam.activatedSectionIds ??= exam.configSnapshot.sections.filter((s, index) => index === exam.currentSectionIndex || !!exam.sectionDeadlines[s.id]).map(s => s.id);
      if (!exam.activatedSectionIds.includes(section.id)) exam.activatedSectionIds.push(section.id);
      if (exam.configSnapshot.timing === 'per-section' && !exam.sectionDeadlines[section.id]) exam.sectionDeadlines[section.id] = new Date(Date.now() + withExtraTime(section.minutes, exam.configSnapshot.extraTimePercent) * 60000).toISOString();
      if (exam.configSnapshot.navigation === 'sequential' && target.sectionIndex > exam.currentSectionIndex) {
        for (let i = exam.currentSectionIndex; i < target.sectionIndex; i++) { const s = exam.configSnapshot.sections[i]!; if (!exam.lockedSectionIds.includes(s.id)) exam.lockedSectionIds.push(s.id); }
      }
      exam.currentSectionIndex = target.sectionIndex; exam.currentQuestionIndex = target.questionIndex;
    }
    await tx.update(learningRuns).set({ exam, revision: run.revision + 1, position: input.action === 'navigate' ? input.position : run.position }).where(eq(learningRuns.id, id));
    return runView(tx, workspaceId, id);
  });
}
