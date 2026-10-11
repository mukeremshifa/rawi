import { and, asc, eq, inArray, ne, sql, type AnyColumn } from 'drizzle-orm';
import { materials, materialVersions, sections, topics, topicSections } from '../../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import type { Citation } from '../../../shared/contracts/document';
import type { ReadingPlace, TopicDepth } from '../../../shared/contracts/outline';
import { usableStatus } from '../../../shared/contracts/document';
import { courseSections } from '../knowledge/course';

type Db = ReadDb | SocketDb | Transaction;
type Scope = { workspaceId: string; courseId: string };

/** The key a student's link to a whole material uses. Its removal hides the topic from every section. */
export const WHOLE = '*';
const RANK: Record<TopicDepth, number> = { introduces: 0, covers: 1, mentions: 2 };

/**
 * Live topic links of current sections, in reading order. A link names a section by key, so it
 * holds for whichever version is current. A student's removal of a topic from a whole material
 * hides every link of that topic there, and a student's link to a whole material counts for its
 * first section.
 */
export async function liveLinks(db: Db, scope: Scope, materialIds?: string[]) {
  const [rows, list] = await Promise.all([
    db.select().from(topicSections).where(and(eq(topicSections.workspaceId, scope.workspaceId), eq(topicSections.courseId, scope.courseId), materialIds ? inArray(topicSections.materialId, materialIds) : undefined)),
    courseSections(db, scope),
  ]);
  const hidden = new Set(rows.filter(r => r.sectionKey === WHOLE && r.removed).map(r => `${r.materialId}:${r.topicId}`));
  const byKey = new Map(list.map(s => [`${s.materialId}:${s.key}`, s]));
  const first = new Map<string, typeof list[number]>();
  for (const s of list) if (!first.has(s.materialId)) first.set(s.materialId, s);
  const out: { topicId: string; depth: TopicDepth; origin: 'suggested' | 'student'; section: typeof list[number] }[] = [];
  for (const r of rows) {
    if (r.removed || hidden.has(`${r.materialId}:${r.topicId}`)) continue;
    const section = r.sectionKey === WHOLE ? first.get(r.materialId) : byKey.get(`${r.materialId}:${r.sectionKey}`);
    if (section) out.push({ topicId: r.topicId, depth: r.depth, origin: r.origin, section });
  }
  const order = new Map(list.map((s, i) => [s.id, i]));
  return out.sort((a, b) => order.get(a.section.id)! - order.get(b.section.id)!);
}

/** The topics each material's current version covers, for one course or the whole workspace. */
export async function materialTopics(db: Db, scope: { workspaceId: string; courseId?: string }, materialIds?: string[]) {
  const where = <T extends { workspaceId: AnyColumn; courseId: AnyColumn; materialId: AnyColumn }>(t: T) => and(eq(t.workspaceId, scope.workspaceId), scope.courseId ? eq(t.courseId, scope.courseId) : undefined, materialIds ? inArray(t.materialId, materialIds) : undefined);
  const [rows, current] = await Promise.all([
    db.select({ topicId: topicSections.topicId, materialId: topicSections.materialId, key: topicSections.sectionKey, removed: topicSections.removed }).from(topicSections).where(where(topicSections)),
    db.select({ materialId: sections.materialId, key: sections.key }).from(sections).innerJoin(materials, and(eq(materials.id, sections.materialId), eq(materials.currentVersionId, sections.versionId))).where(where(sections)),
  ]);
  const keys = new Set(current.map(c => `${c.materialId}:${c.key}`));
  const hidden = new Set(rows.filter(r => r.key === WHOLE && r.removed).map(r => `${r.materialId}:${r.topicId}`));
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (r.removed || hidden.has(`${r.materialId}:${r.topicId}`) || (r.key !== WHOLE && !keys.has(`${r.materialId}:${r.key}`))) continue;
    const list = out.get(r.materialId) ?? [];
    if (!list.includes(r.topicId)) out.set(r.materialId, [...list, r.topicId]);
  }
  return out;
}

/** Where to read each topic: its sections in reading order, straight to the heading. */
export async function readingPlaces(db: Db, scope: Scope) {
  const out = new Map<string, ReadingPlace[]>();
  for (const link of await liveLinks(db, scope)) {
    const list = out.get(link.topicId) ?? [];
    if (list.some(p => p.materialId === link.section.materialId && p.sectionKey === link.section.key)) continue;
    list.push({ materialId: link.section.materialId, versionId: link.section.versionId, materialTitle: link.section.title, heading: link.section.heading, blockId: link.section.blockIds[0] ?? null, sectionKey: link.section.key, depth: link.depth });
    out.set(link.topicId, list);
  }
  return out;
}

/**
 * The topic of the section a citation sits in: its deepest link, then the first in the outline.
 * Null when the section has no topic.
 */
export async function sectionTopic(db: Db, scope: Scope, citation: Citation) {
  const [section] = await db.select({ materialId: sections.materialId, key: sections.key, heading: sections.heading }).from(sections)
    .where(and(eq(sections.workspaceId, scope.workspaceId), eq(sections.versionId, citation.versionId), sql`${sections.blockIds} ?| ${`{${citation.blockIds.join(',')}}`}::text[]`)).limit(1);
  if (!section) return { topicId: null, title: null, heading: '' };
  const rows = await db.select({ topicId: topicSections.topicId, depth: topicSections.depth, key: topicSections.sectionKey, removed: topicSections.removed, title: topics.title, order: topics.order }).from(topicSections).innerJoin(topics, eq(topics.id, topicSections.topicId))
    .where(and(eq(topicSections.workspaceId, scope.workspaceId), eq(topicSections.materialId, section.materialId), inArray(topicSections.sectionKey, [section.key, WHOLE]))).orderBy(asc(topics.order));
  const hidden = new Set(rows.filter(r => r.key === WHOLE && r.removed).map(r => r.topicId));
  const live = rows.filter(r => !r.removed && !hidden.has(r.topicId)).sort((a, b) => RANK[a.depth] - RANK[b.depth] || a.order - b.order);
  return live[0] ? { topicId: live[0].topicId, title: live[0].title, heading: section.heading } : { topicId: null, title: null, heading: section.heading };
}

/**
 * Write suggested links from an assignment. A student's own link or removal is never replaced,
 * and the first covering section of each topic in reading order is marked as introducing it.
 */
export async function writeSuggestions(tx: Transaction, scope: Scope, suggestions: { materialId: string; sectionKey: string; topicId: string; depth: 'covers' | 'mentions' }[]) {
  if (!suggestions.length) return 0;
  const rows = suggestions.map(s => ({ ...scope, ...s, origin: 'suggested' as const }));
  await tx.insert(topicSections).values(rows).onConflictDoNothing();
  await markIntroductions(tx, scope);
  return rows.length;
}

/** The earliest covering section of each topic in reading order introduces it. The rest cover it. */
export async function markIntroductions(tx: Transaction, scope: Scope) {
  const links = await liveLinks(tx, scope);
  const first = new Map<string, { materialId: string; key: string }>();
  for (const l of links) if (l.depth !== 'mentions' && !first.has(l.topicId)) first.set(l.topicId, { materialId: l.section.materialId, key: l.section.key });
  await tx.update(topicSections).set({ depth: 'covers' }).where(and(eq(topicSections.workspaceId, scope.workspaceId), eq(topicSections.courseId, scope.courseId), eq(topicSections.depth, 'introduces')));
  for (const [topicId, at] of first) {
    await tx.update(topicSections).set({ depth: 'introduces' }).where(and(eq(topicSections.topicId, topicId), eq(topicSections.materialId, at.materialId), eq(topicSections.sectionKey, at.key), ne(topicSections.depth, 'mentions')));
  }
}

/** Covers in the Reader: link a topic to a whole material, or remove it from every section there. */
export async function setCover(tx: Transaction, scope: Scope & { materialId: string }, topicId: string, add: boolean) {
  const own = and(eq(topicSections.topicId, topicId), eq(topicSections.materialId, scope.materialId));
  if (add) {
    await tx.update(topicSections).set({ removed: false }).where(own);
    await tx.insert(topicSections).values({ workspaceId: scope.workspaceId, courseId: scope.courseId, materialId: scope.materialId, topicId, sectionKey: WHOLE, depth: 'covers', origin: 'student' })
      .onConflictDoUpdate({ target: [topicSections.topicId, topicSections.materialId, topicSections.sectionKey], set: { removed: false, origin: 'student' } });
  } else {
    await tx.update(topicSections).set({ removed: true }).where(own);
    await tx.insert(topicSections).values({ workspaceId: scope.workspaceId, courseId: scope.courseId, materialId: scope.materialId, topicId, sectionKey: WHOLE, depth: 'covers', origin: 'student', removed: true })
      .onConflictDoUpdate({ target: [topicSections.topicId, topicSections.materialId, topicSections.sectionKey], set: { removed: true, origin: 'student' } });
  }
  await markIntroductions(tx, scope);
}

/** Ready materials of the course that are not the syllabus, with their current versions. */
export async function readyMaterials(db: Db, scope: Scope, syllabusId: string | null) {
  const rows = await db.select({ id: materials.id, title: materials.title, versionId: materialVersions.id, status: materialVersions.status, createdAt: materials.createdAt }).from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId))
    .where(and(eq(materials.workspaceId, scope.workspaceId), eq(materials.courseId, scope.courseId), eq(materials.archived, false), ne(materials.kind, 'syllabus')));
  return rows.filter(r => usableStatus(r.status) && r.id !== syllabusId);
}
