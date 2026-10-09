import { transaction } from '../db/client';
import { and, asc, desc, eq, exists, gt, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { createMaterialInput, materialPatch, materialListInput } from '../../shared/contracts/materials';
import { materials, materialVersions, passages, materialTopicLinks, topics, courses } from '../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { ApiError, conflict, notFound } from '../errors';
import { getCourse } from './workspace';

type Db = ReadDb | Transaction;
export const materialScope = (workspaceId: string, id: string) => and(eq(materials.workspaceId, workspaceId), eq(materials.id, id));
export async function hash(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), n => n.toString(16).padStart(2, '0')).join('');
}
export function readableText(text: string, limit = 1048576) {
  if (!text.trim() || new TextEncoder().encode(text).length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) {
    throw new ApiError(400, 'invalid_text', 'Use readable UTF-8 text within the text size limit.');
  }
  return text;
}
export function splitPassages(text: string) {
  // Fixed bounded chunks preserve every source character, including line endings.
  const result: { id: string; heading: string; text: string; order: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 8000, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline > start + 4000) end = newline + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
    }
    const chunk = text.slice(start, end);
    result.push({ id: crypto.randomUUID(), heading: /^#{1,6} (.+)/m.exec(chunk)?.[1]?.slice(0, 200) ?? `Passage ${result.length + 1}`, text: chunk, order: result.length });
    start = end;
  }
  return result;
}
export async function lockCourse(tx: Transaction, workspaceId: string, id: string) {
  const [course] = await tx.select({ id: courses.id }).from(courses).where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, id))).for('update');
  if (!course) throw notFound();
}
export async function ownMaterial(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select().from(materials).where(materialScope(workspaceId, id));
  if (!row) throw notFound();
  return row;
}
export async function materialDetail(db: Db, workspaceId: string, id: string) {
  const row = await ownMaterial(db, workspaceId, id);
  const links = await db.select({ id: materialTopicLinks.topicId }).from(materialTopicLinks).where(eq(materialTopicLinks.materialId, id));
  const [version] = row.currentVersionId ? await db.select({ status: materialVersions.contentStatus }).from(materialVersions).where(eq(materialVersions.id, row.currentVersionId)) : [];
  const { createFingerprint: _private, workspaceId: _workspace, ...visible } = row;
  return { ...visible, topicIds: links.map(l => l.id), contentStatus: version?.status ?? null };
}
export async function validateTopics(tx: Transaction, workspaceId: string, courseId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await tx.select({ id: topics.id }).from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), inArray(topics.id, ids)));
  if (found.length !== ids.length) throw notFound();
}
export async function setTopics(tx: Transaction, workspaceId: string, courseId: string, materialId: string, ids: string[]) {
  await validateTopics(tx, workspaceId, courseId, ids);
  await tx.delete(materialTopicLinks).where(eq(materialTopicLinks.materialId, materialId));
  if (ids.length) await tx.insert(materialTopicLinks).values(ids.map(topicId => ({ workspaceId, courseId, materialId, topicId })));
}
export function publicVersion(row: typeof materialVersions.$inferSelect) {
  const { fingerprint: _hash, requestId: _request, workspaceId: _workspace, courseId: _course, ...version } = row;
  return version;
}
export async function publishVersion(tx: Transaction, row: typeof materials.$inferSelect, input: {
  requestId: string; fingerprint: string; origin: 'paste' | 'upload'; sourceObjectId: string | null;
  format: string; text?: string; contentStatus: 'readable' | 'not_extracted' | 'failed';
}) {
  const [latest] = await tx.select({ number: materialVersions.number }).from(materialVersions).where(eq(materialVersions.materialId, row.id)).orderBy(desc(materialVersions.number)).limit(1);
  const { text, ...fields } = input;
  const [version] = await tx.insert(materialVersions).values({ ...fields, id: crypto.randomUUID(), workspaceId: row.workspaceId, courseId: row.courseId, materialId: row.id, number: (latest?.number ?? 0) + 1 }).returning();
  if (text !== undefined) {
    const records = splitPassages(text).map(p => ({ ...p, workspaceId: row.workspaceId, courseId: row.courseId, materialId: row.id, versionId: version!.id }));
    await tx.insert(passages).values(records);
  }
  await tx.update(materials).set({ currentVersionId: version!.id, revision: latest ? row.revision + 1 : row.revision, updatedAt: new Date() }).where(eq(materials.id, row.id));
  return publicVersion(version!);
}
export async function createMaterial(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof createMaterialInput>, limit: number) {
  readableText(input.text, limit);
  const fingerprint = await hash(JSON.stringify({ ...input, topicIds: [...input.topicIds].sort() }));
  return transaction(db, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    const { text, format, topicIds, ...fields } = input;
    const [inserted] = await tx.insert(materials).values({ ...fields, workspaceId, courseId, createFingerprint: fingerprint }).onConflictDoNothing().returning();
    const row = inserted ?? await ownMaterial(tx, workspaceId, input.id);
    if (row.courseId !== courseId) throw notFound();
    if (row.createFingerprint !== fingerprint) throw new ApiError(409, 'create_conflict', 'This request ID was used with different content.');
    if (inserted) {
      await setTopics(tx, workspaceId, courseId, row.id, topicIds);
      await publishVersion(tx, row, { requestId: input.id, fingerprint, origin: 'paste', sourceObjectId: null, format, text, contentStatus: 'readable' });
    }
    return materialDetail(tx, workspaceId, row.id);
  });
}
export async function patchMaterial(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof materialPatch>) {
  return transaction(db, async tx => {
    const row = await ownMaterial(tx, workspaceId, id);
    await lockCourse(tx, workspaceId, row.courseId);
    const { expectedRevision, topicIds, ...fields } = input;
    const [saved] = await tx.update(materials).set({ ...fields, revision: sql`${materials.revision} + 1`, updatedAt: new Date() }).where(and(materialScope(workspaceId, id), eq(materials.revision, expectedRevision))).returning();
    if (!saved) throw conflict();
    if (topicIds) await setTopics(tx, workspaceId, row.courseId, id, topicIds);
    return materialDetail(tx, workspaceId, id);
  });
}
export async function listMaterials(db: ReadDb, workspaceId: string, courseId: string, input: z.infer<typeof materialListInput>) {
  await getCourse(db, workspaceId, courseId);
  if (input.topicId) {
    const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
    if (!topic) throw notFound();
  }
  const rows = await db.select({ material: materials, contentStatus: materialVersions.contentStatus }).from(materials).leftJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId)).where(and(eq(materials.workspaceId, workspaceId), eq(materials.courseId, courseId),
    input.archived === 'all' ? undefined : eq(materials.archived, input.archived === 'true'), input.cursor ? gt(materials.id, input.cursor) : undefined,
    input.topicId ? exists(db.select({ id: materialTopicLinks.materialId }).from(materialTopicLinks).where(and(eq(materialTopicLinks.materialId, materials.id), eq(materialTopicLinks.topicId, input.topicId)))) : undefined,
  )).orderBy(asc(materials.id)).limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const links = page.length ? await db.select().from(materialTopicLinks).where(inArray(materialTopicLinks.materialId, page.map(r => r.material.id))) : [];
  return { materials: page.map(({ material: { createFingerprint: _hash, workspaceId: _workspace, ...material }, contentStatus }) => ({ ...material, contentStatus, topicIds: links.filter(l => l.materialId === material.id).map(l => l.topicId) })), nextCursor: rows.length > input.limit ? rows[input.limit - 1]!.material.id : null };
}
export async function ownVersion(db: Db, workspaceId: string, materialId: string, id: string) {
  const [row] = await db.select().from(materialVersions).where(and(eq(materialVersions.workspaceId, workspaceId), eq(materialVersions.materialId, materialId), eq(materialVersions.id, id)));
  if (!row) throw notFound();
  return row;
}
export async function listVersions(db: ReadDb, workspaceId: string, id: string, limit: number, cursor?: string) {
  await ownMaterial(db, workspaceId, id);
  const rows = await db.select().from(materialVersions).where(and(eq(materialVersions.materialId, id), cursor ? gt(materialVersions.id, cursor) : undefined)).orderBy(asc(materialVersions.id)).limit(limit + 1);
  return { versions: rows.slice(0, limit).map(publicVersion), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
export async function versionDetail(db: ReadDb, workspaceId: string, id: string, versionId: string, cursor = -1) {
  const version = await ownVersion(db, workspaceId, id, versionId);
  const rows = await db.select({ id: passages.id, heading: passages.heading, text: passages.text, order: passages.order }).from(passages).where(and(eq(passages.versionId, versionId), gt(passages.order, cursor))).orderBy(asc(passages.order)).limit(21);
  return { version: publicVersion(version), passages: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.order : null };
}
export async function exactPassage(db: ReadDb, workspaceId: string, id: string, versionId: string, passageId: string) {
  await ownVersion(db, workspaceId, id, versionId);
  const [row] = await db.select({ id: passages.id, heading: passages.heading, text: passages.text, order: passages.order }).from(passages).where(and(eq(passages.versionId, versionId), eq(passages.id, passageId)));
  if (!row) throw notFound();
  return row;
}
