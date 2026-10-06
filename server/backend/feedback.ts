import { and, asc, eq, inArray } from 'drizzle-orm';
import { applyGrading, attemptTotals } from '../../src/shared/marking';
import type { LearningAttempt } from '../../src/shared/learning';
import { feedbackRevisions } from './schema';
import type { ReadDb, Transaction } from './db';

export async function withFeedback(db: ReadDb | Transaction, workspaceId: string, snapshots: LearningAttempt[]) {
  if (!snapshots.length) return [];
  const revisions = await db.select().from(feedbackRevisions).where(and(eq(feedbackRevisions.workspaceId, workspaceId), inArray(feedbackRevisions.attemptId, snapshots.map(a => a.id)))).orderBy(asc(feedbackRevisions.revision));
  return snapshots.map(original => {
    const questions = original.questions.map(item => {
      const latest = revisions.filter(r => r.attemptId === original.id && r.questionId === item.question.id).at(-1);
      return latest ? { ...item, result: applyGrading(item.question, item.result, latest.grading) } : item;
    });
    const totals = attemptTotals(questions.map(q => q.result));
    return { ...original, questions, ...totals, ...(original.imported ? { imported: { ...original.imported, questions: questions.map(q => q.result), ...totals } } : {}), feedbackRevisions: revisions.filter(r => r.attemptId === original.id).map(({ workspaceId: _w, courseId: _c, ...r }) => r) };
  });
}
