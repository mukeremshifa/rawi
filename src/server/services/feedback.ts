import { and, asc, eq, inArray } from 'drizzle-orm';
import { applyGrading, attemptTotals } from '../../shared/domain/marking';
import type { LearningAttempt } from '../../shared/contracts/learning';
import { feedbackRevisions } from '../db/schema';
import type { ReadDb, Transaction } from '../db/client';

export async function withFeedback(db: ReadDb | Transaction, workspaceId: string, snapshots: LearningAttempt[]) {
  if (!snapshots.length) return [];
  const revisions = await db.select().from(feedbackRevisions).where(and(eq(feedbackRevisions.workspaceId, workspaceId), inArray(feedbackRevisions.attemptId, snapshots.map(a => a.id)))).orderBy(asc(feedbackRevisions.revision));
  return snapshots.map(original => {
    const questions = original.questions.map(item => {
      const latest = revisions.filter(r => r.attemptId === original.id && r.questionId === item.question.id).at(-1);
      return latest ? { ...item, result: applyGrading(item.question, item.result, latest.grading) } : item;
    });
    const totals = attemptTotals(questions.map(q => q.result));
    const sampleTimingNotice = original.sampleDataset && original.finish === 'expired' && original.exam?.deadlineAt && original.completedAt < original.exam.deadlineAt ? 'Sample timing note: this early fixture ended before its configured deadline. A corrected expired example is also available in history.' : undefined;
    return { ...original, sampleTimingNotice, questions, ...totals, ...(original.imported ? { imported: { ...original.imported, questions: questions.map(q => q.result), ...totals } } : {}), feedbackRevisions: revisions.filter(r => r.attemptId === original.id).map(({ workspaceId: _w, courseId: _c, ...r }) => r) };
  });
}
