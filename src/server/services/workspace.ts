import { transaction } from '../db/client';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { defaultPreferences, preferenceFields, type CreateCourseInput, type coursePatch, type preferencesPatch } from '../../shared/contracts/workspace';
import { courses, preferences, topics, workspaces } from '../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { ApiError, conflict, notFound } from '../errors';
import { operation } from './learning';

const scope = (workspaceId: string, id: string) => and(eq(courses.workspaceId, workspaceId), eq(courses.id, id));
export function publicCourse(row: typeof courses.$inferSelect) {
  const { createFingerprint: _fingerprint, ...course } = row;
  return course;
}
export async function bootstrap(db: SocketDb, userId: string) {
  return transaction(db, async tx => {
    await tx.insert(workspaces).values({ ownerUserId: userId }).onConflictDoNothing({ target: workspaces.ownerUserId });
    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.ownerUserId, userId));
    if (!workspace) throw new Error('Workspace bootstrap failed');
    await tx.insert(preferences).values({ workspaceId: workspace.id, values: defaultPreferences }).onConflictDoNothing();
    const [saved] = await tx.select().from(preferences).where(eq(preferences.workspaceId, workspace.id));
    if (!saved) throw new Error('Preferences bootstrap failed');
    return { workspace, preferences: { ...saved, values: preferenceFields.parse(saved.values) } };
  });
}
/** One read for the usual case. Callers bootstrap only when this returns null. */
export async function findAccount(db: ReadDb, userId: string) {
  const [row] = await db.select({ workspace: workspaces, preferences }).from(workspaces)
    .innerJoin(preferences, eq(preferences.workspaceId, workspaces.id))
    .where(eq(workspaces.ownerUserId, userId));
  return row ? { workspace: row.workspace, preferences: { ...row.preferences, values: preferenceFields.parse(row.preferences.values) } } : null;
}
export async function getCourse(db: ReadDb | SocketDb | Transaction, workspaceId: string, id: string) {
  const [course] = await db.select().from(courses).where(scope(workspaceId, id));
  if (!course) throw notFound();
  return publicCourse(course);
}
export async function getTopics(db: ReadDb | SocketDb | Transaction, workspaceId: string, courseId: string) {
  return db.select().from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId))).orderBy(asc(topics.order), asc(topics.id));
}
export async function listCourses(db: ReadDb, workspaceId: string, archived: 'true' | 'false' | 'all', limit: number, cursor?: string) {
  const rows = await db.select().from(courses).where(and(
    eq(courses.workspaceId, workspaceId), archived === 'all' ? undefined : eq(courses.archived, archived === 'true'),
    cursor ? gt(courses.id, cursor) : undefined,
  )).orderBy(asc(courses.id)).limit(limit + 1);
  return { courses: rows.slice(0, limit).map(publicCourse), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function getOutline(db: ReadDb, workspaceId: string, id: string) {
  const course = await getCourse(db, workspaceId, id);
  return { course, topics: await getTopics(db, workspaceId, id) };
}
async function fingerprint(input: CreateCourseInput) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export async function createCourse(db: SocketDb, workspaceId: string, input: CreateCourseInput) {
  const createFingerprint = await fingerprint(input);
  return transaction(db, async tx => {
    const [inserted] = await tx.insert(courses).values({ ...input, workspaceId, createFingerprint }).onConflictDoNothing({ target: courses.id }).returning();
    const [course] = inserted ? [inserted] : await tx.select().from(courses).where(scope(workspaceId, input.id));
    if (!course) throw notFound();
    if (course.createFingerprint !== createFingerprint) throw new ApiError(409, 'create_conflict', 'This create ID was already used with different details. Open the saved course to review it.');
    return { course: publicCourse(course), topics: await getTopics(tx, workspaceId, course.id) };
  });
}
export async function updateCourse(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof coursePatch>) {
  const { expectedRevision, operationId, ...patch } = input;
  return operation(db, workspaceId, operationId ?? crypto.randomUUID(), { action: 'course-metadata', id, input }, async tx => {
  const [course] = await tx.update(courses).set({ ...patch, revision: sql`${courses.revision} + 1`, updatedAt: new Date() })
    .where(and(scope(workspaceId, id), eq(courses.revision, expectedRevision))).returning();
  if (course) return publicCourse(course);
  await getCourse(tx, workspaceId, id);
  throw conflict();
  });
}
export async function getPreferences(db: ReadDb | Transaction, workspaceId: string) {
  const [row] = await db.select().from(preferences).where(eq(preferences.workspaceId, workspaceId));
  if (!row) throw notFound();
  return { ...row, values: preferenceFields.parse(row.values) };
}
export async function updatePreferences(db: SocketDb, workspaceId: string, input: z.infer<typeof preferencesPatch>) {
  const { expectedRevision, timezone, operationId, ...patch } = input;
  return operation(db, workspaceId, operationId ?? crypto.randomUUID(), { action: 'preferences', input }, async tx => {
  const [saved] = await tx.update(preferences).set({
    values: sql`${preferences.values} || ${JSON.stringify(patch)}::jsonb`,
    ...(timezone ? { timezone } : {}), revision: sql`${preferences.revision} + 1`, updatedAt: new Date(),
  }).where(and(eq(preferences.workspaceId, workspaceId), eq(preferences.revision, expectedRevision))).returning();
  if (!saved) { await getPreferences(tx, workspaceId); throw conflict(); }
  return { ...saved, values: preferenceFields.parse(saved.values) };
  });
}
