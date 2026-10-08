import { transaction } from './db';
import { and, asc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { defaultPreferences, preferenceFields, type CreateCourseInput, type TopicInput, type coursePatch, type preferencesPatch } from '../../src/shared/online';
import { courses, preferences, topics, topicLinks, workspaces } from './schema';
import type { ReadDb, SocketDb, Transaction } from './db';
import { ApiError, conflict, notFound } from './errors';
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
export async function getCourse(db: ReadDb | Transaction, workspaceId: string, id: string) {
  const [course] = await db.select().from(courses).where(scope(workspaceId, id));
  if (!course) throw notFound();
  return publicCourse(course);
}
export async function getTopics(db: ReadDb | Transaction, workspaceId: string, courseId: string) {
  // A single statement gives a consistent outline even during concurrent replacement.
  const rows = await db.select({ topic: topics, target: topicLinks.targetId }).from(topics)
    .leftJoin(topicLinks, and(eq(topicLinks.workspaceId, topics.workspaceId), eq(topicLinks.courseId, topics.courseId), eq(topicLinks.sourceId, topics.id)))
    .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId)))
    .orderBy(asc(topics.order), asc(topics.id), asc(topicLinks.targetId));
  const result = new Map<string, typeof topics.$inferSelect & { relatedTopicIds: string[] }>();
  for (const row of rows) {
    let topic = result.get(row.topic.id);
    if (!topic) { topic = { ...row.topic, relatedTopicIds: [] }; result.set(topic.id, topic); }
    if (row.target) topic.relatedTopicIds.push(row.target);
  }
  return [...result.values()];
}
export async function listCourses(db: ReadDb, workspaceId: string, archived: 'true' | 'false' | 'all', limit: number, cursor?: string) {
  const rows = await db.select().from(courses).where(and(
    eq(courses.workspaceId, workspaceId), archived === 'all' ? undefined : eq(courses.archived, archived === 'true'),
    cursor ? gt(courses.id, cursor) : undefined,
  )).orderBy(asc(courses.id)).limit(limit + 1);
  return { courses: rows.slice(0, limit).map(publicCourse), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function getOutline(db: ReadDb, workspaceId: string, id: string) {
  const rows = await db.select({ course: courses, topic: topics, target: topicLinks.targetId }).from(courses)
    .leftJoin(topics, and(eq(topics.workspaceId, courses.workspaceId), eq(topics.courseId, courses.id)))
    .leftJoin(topicLinks, and(eq(topicLinks.workspaceId, topics.workspaceId), eq(topicLinks.courseId, topics.courseId), eq(topicLinks.sourceId, topics.id)))
    .where(scope(workspaceId, id)).orderBy(asc(topics.order), asc(topics.id), asc(topicLinks.targetId));
  if (!rows[0]) throw notFound();
  const result = new Map<string, typeof topics.$inferSelect & { relatedTopicIds: string[] }>();
  for (const row of rows) {
    if (!row.topic) continue;
    let topic = result.get(row.topic.id);
    if (!topic) { topic = { ...row.topic, relatedTopicIds: [] }; result.set(topic.id, topic); }
    if (row.target) topic.relatedTopicIds.push(row.target);
  }
  return { course: publicCourse(rows[0].course), topics: [...result.values()] };
}
async function writeTopics(tx: Transaction, workspaceId: string, courseId: string, input: TopicInput[]) {
  const scoped = and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId));
  const ids = input.map(t => t.id);
  if (ids.length) {
    const existing = await tx.select().from(topics).where(inArray(topics.id, ids));
    if (existing.some(t => t.workspaceId !== workspaceId || t.courseId !== courseId)) throw notFound();
  }
  await tx.delete(topicLinks).where(and(eq(topicLinks.workspaceId, workspaceId), eq(topicLinks.courseId, courseId)));
  await tx.delete(topics).where(and(scoped, ids.length ? notInArray(topics.id, ids) : undefined));
  if (input.length) {
    const records = input.map(({ relatedTopicIds: _links, ...topic }) => ({ ...topic, workspaceId, courseId })).sort((a, b) => a.id.localeCompare(b.id));
    const saved = await tx.insert(topics).values(records).onConflictDoUpdate({
      target: topics.id,
      set: { title: sql`excluded.title`, summary: sql`excluded.summary`, priority: sql`excluded.priority`, module: sql`excluded.module`, order: sql`excluded."order"`, revision: sql`${topics.revision} + 1`, updatedAt: new Date() },
      setWhere: scoped,
    }).returning({ id: topics.id });
    if (saved.length !== input.length) throw notFound();
  }
  const links = input.flatMap(t => t.relatedTopicIds.map(targetId => ({ workspaceId, courseId, sourceId: t.id, targetId })));
  if (links.length) await tx.insert(topicLinks).values(links);
}
async function fingerprint(input: CreateCourseInput) {
  const canonical = { ...input, topics: input.topics.map(t => ({ ...t, relatedTopicIds: [...t.relatedTopicIds].sort() })).sort((a, b) => a.id.localeCompare(b.id)) };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export async function createCourse(db: SocketDb, workspaceId: string, input: CreateCourseInput) {
  const createFingerprint = await fingerprint(input);
  return transaction(db, async tx => {
    const { topics: initial, ...fields } = input;
    const [inserted] = await tx.insert(courses).values({ ...fields, workspaceId, createFingerprint }).onConflictDoNothing({ target: courses.id }).returning();
    const [course] = inserted ? [inserted] : await tx.select().from(courses).where(scope(workspaceId, input.id)).for('update');
    if (!course) throw notFound();
    if (course.createFingerprint !== createFingerprint) throw new ApiError(409, 'create_conflict', 'This create ID was already used with different details. Open the saved course to review it.');
    if (inserted) await writeTopics(tx, workspaceId, course.id, initial);
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
export async function replaceTopics(db: SocketDb, workspaceId: string, id: string, expectedRevision: number, input: TopicInput[], operationId?: string) {
  return operation(db, workspaceId, operationId ?? crypto.randomUUID(), { action: 'outline', id, expectedRevision, input }, async tx => {
    const [course] = await tx.update(courses).set({ revision: sql`${courses.revision} + 1`, updatedAt: new Date() })
      .where(and(scope(workspaceId, id), eq(courses.revision, expectedRevision))).returning();
    if (!course) { await getCourse(tx, workspaceId, id); throw conflict(); }
    await writeTopics(tx, workspaceId, id, input);
    return { course: publicCourse(course), topics: await getTopics(tx, workspaceId, id) };
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
