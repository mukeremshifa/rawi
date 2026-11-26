import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { assessments, studyGoals } from '../../db/schema';
import type { GoalSource, goalInput, goalPatch, StudyGoal } from '../../../shared/contracts/agent';
import { ensureScope } from '../scopes';
import { getCourse } from '../workspace';
import { operation } from '../learning';
import { ApiError, notFound } from '../../errors';

type Db = ReadDb | SocketDb | Transaction;
type Row = typeof studyGoals.$inferSelect;

export const publicGoal = (r: Row): StudyGoal => ({
  id: r.id,
  courseId: r.courseId,
  title: r.title,
  date: r.date,
  assessmentId: r.assessmentId,
  scopeId: r.scopeId,
  source: r.source,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
});

export async function listGoals(db: Db, workspaceId: string) {
  const rows = await db
    .select()
    .from(studyGoals)
    .where(eq(studyGoals.workspaceId, workspaceId))
    .orderBy(asc(studyGoals.date), asc(studyGoals.createdAt));
  return rows.map(publicGoal);
}

/**
 * A goal for a course. With an assessment it works toward that assessment's scope and date, and
 * without one toward the whole course. One goal per assessment, so a second request returns the first.
 */
export async function makeGoal(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: { title: string; date: string | null; assessmentId: string | null },
  source: GoalSource,
) {
  await getCourse(db, workspaceId, courseId);
  let date = input.date;
  if (input.assessmentId) {
    const [a] = await db
      .select({ date: assessments.date })
      .from(assessments)
      .where(
        and(
          eq(assessments.workspaceId, workspaceId),
          eq(assessments.courseId, courseId),
          eq(assessments.id, input.assessmentId),
        ),
      );
    if (!a) throw notFound();
    date ??= a.date;
  }
  const scope = await ensureScope(
    db,
    workspaceId,
    courseId,
    input.assessmentId ? { kind: 'assessment', assessmentId: input.assessmentId } : { kind: 'course' },
  );
  const id = crypto.randomUUID();
  await db
    .insert(studyGoals)
    .values({
      id,
      workspaceId,
      courseId,
      title: input.title,
      date,
      assessmentId: input.assessmentId,
      scopeId: scope.id,
      source,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(studyGoals)
    .where(
      and(
        eq(studyGoals.workspaceId, workspaceId),
        input.assessmentId
          ? and(eq(studyGoals.courseId, courseId), eq(studyGoals.assessmentId, input.assessmentId))
          : eq(studyGoals.id, id),
      ),
    );
  return publicGoal(row!);
}

export async function createGoal(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof goalInput>,
) {
  return operation(db, workspaceId, input.operationId, { action: 'goal', courseId, input }, async () =>
    makeGoal(db, workspaceId, courseId, input, 'student'),
  );
}

export async function setGoalStatus(db: Db, workspaceId: string, id: string, status: StudyGoal['status']) {
  const [row] = await db
    .update(studyGoals)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(studyGoals.workspaceId, workspaceId), eq(studyGoals.id, id)))
    .returning();
  if (!row) throw notFound();
  return publicGoal(row);
}

export async function patchGoal(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof goalPatch>) {
  return operation(db, workspaceId, input.operationId, { action: 'goal-status', id, input }, async tx => {
    const [row] = await tx
      .select()
      .from(studyGoals)
      .where(and(eq(studyGoals.workspaceId, workspaceId), eq(studyGoals.id, id)));
    if (!row) throw notFound();
    if (row.status === input.status) return publicGoal(row);
    if (input.status === 'active' && row.date && row.date < new Date().toISOString().slice(0, 10))
      throw new ApiError(409, 'goal_passed', 'This goal has passed. Set a new one.');
    return setGoalStatus(tx, workspaceId, id, input.status);
  });
}
