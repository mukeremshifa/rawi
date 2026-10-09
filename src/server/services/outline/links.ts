import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { materials, materialVersions, sectionLinks, topics } from '../../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import type { Citation } from '../../../shared/contracts/document';
import type { ReadingPlace } from '../../../shared/contracts/outline';
import { usableStatus } from '../../../shared/contracts/document';
import { containingHeadings, normalHeading, type Section } from './sections';

type Db = ReadDb | SocketDb | Transaction;
type Scope = { workspaceId: string; courseId: string };
type AnyScope = { workspaceId: string; courseId?: string };

/** Live links of current versions: not removed, and not removed from the whole version. */
async function currentLinks(db: Db, scope: AnyScope, materialIds?: string[]) {
  const rows = await db.select({ link: sectionLinks, title: materials.title, archived: materials.archived, kind: materials.kind }).from(sectionLinks)
    .innerJoin(materials, and(eq(materials.id, sectionLinks.materialId), eq(materials.currentVersionId, sectionLinks.versionId)))
    .where(and(eq(sectionLinks.workspaceId, scope.workspaceId), scope.courseId ? eq(sectionLinks.courseId, scope.courseId) : undefined, materialIds ? inArray(sectionLinks.materialId, materialIds) : undefined));
  const dropped = new Set(rows.filter(r => r.link.removed && r.link.headingBlockId === null).map(r => `${r.link.versionId}:${r.link.topicId}`));
  return rows.filter(r => !r.link.removed && !dropped.has(`${r.link.versionId}:${r.link.topicId}`));
}

/** The topics each material's current version covers. */
export async function materialTopics(db: Db, scope: AnyScope, materialIds?: string[]) {
  const out = new Map<string, string[]>();
  for (const { link } of await currentLinks(db, scope, materialIds)) {
    const list = out.get(link.materialId) ?? [];
    if (!list.includes(link.topicId)) list.push(link.topicId);
    out.set(link.materialId, list);
  }
  return out;
}

/** Where to read each topic: its linked sections in active materials, straight to the block. */
export async function readingPlaces(db: Db, scope: Scope) {
  const out = new Map<string, ReadingPlace[]>();
  for (const row of await currentLinks(db, scope)) {
    if (row.archived || row.kind === 'syllabus') continue;
    const list = out.get(row.link.topicId) ?? [];
    list.push({ materialId: row.link.materialId, versionId: row.link.versionId, materialTitle: row.title, heading: row.link.headingText, blockId: row.link.headingBlockId });
    out.set(row.link.topicId, list);
  }
  return out;
}

/** Block ids of each topic's linked sections in one version, for passage selection. */
export async function blockTopics(db: Db, scope: Scope, versionId: string, list: Section[]) {
  const links = await db.select().from(sectionLinks).where(and(eq(sectionLinks.workspaceId, scope.workspaceId), eq(sectionLinks.courseId, scope.courseId), eq(sectionLinks.versionId, versionId)));
  const dropped = new Set(links.filter(l => l.removed && l.headingBlockId === null).map(l => l.topicId));
  const out: Record<string, string[]> = {};
  for (const link of links) {
    if (link.removed || dropped.has(link.topicId)) continue;
    const section = list.find(s => s.headingBlockId === link.headingBlockId);
    for (const id of section?.blockIds ?? []) out[id] = [...new Set([...(out[id] ?? []), link.topicId])];
  }
  return out;
}

/**
 * The topic of the section a citation sits in: the innermost containing
 * heading with a live link, then the lead section. Null when the section is
 * not in the outline.
 */
export async function sectionTopic(db: Db, scope: Scope, citation: Citation) {
  const links = await db.select({ link: sectionLinks, title: topics.title, order: topics.order }).from(sectionLinks)
    .innerJoin(topics, eq(topics.id, sectionLinks.topicId))
    .where(and(eq(sectionLinks.workspaceId, scope.workspaceId), eq(sectionLinks.courseId, scope.courseId), eq(sectionLinks.versionId, citation.versionId))).orderBy(asc(topics.order));
  const dropped = new Set(links.filter(l => l.link.removed && l.link.headingBlockId === null).map(l => l.link.topicId));
  const live = links.filter(l => !l.link.removed && !dropped.has(l.link.topicId));
  const chain = await containingHeadings(db, scope.workspaceId, citation.versionId, citation.blockIds[0]!);
  for (const heading of chain) {
    const hit = live.find(l => l.link.headingBlockId === heading.id);
    if (hit) return { topicId: hit.link.topicId, title: hit.title, heading: heading.text };
  }
  const lead = live.find(l => l.link.headingBlockId === null);
  return lead ? { topicId: lead.link.topicId, title: lead.title, heading: chain[0]?.text ?? '' } : { topicId: null, title: null, heading: chain[0]?.text ?? '' };
}

/**
 * Replace a version's suggested links. Student links and removals from the
 * previous version carry over by heading text, and a suggestion never
 * overrides a removal.
 */
export async function writeSuggestions(tx: Transaction, scope: Scope & { materialId: string; versionId: string }, list: Section[], suggestions: { headingBlockId: string | null; topicId: string }[]) {
  const own = and(eq(sectionLinks.workspaceId, scope.workspaceId), eq(sectionLinks.versionId, scope.versionId));
  const existing = await tx.select().from(sectionLinks).where(own);
  if (!existing.length) await carryStudentLinks(tx, scope, list);
  await tx.delete(sectionLinks).where(and(own, eq(sectionLinks.origin, 'suggested'), eq(sectionLinks.removed, false)));
  const kept = await tx.select().from(sectionLinks).where(own);
  const key = (heading: string | null, topic: string) => `${heading ?? ''}:${topic}`;
  const taken = new Set(kept.map(l => key(l.headingBlockId, l.topicId)));
  const dropped = new Set(kept.filter(l => l.removed && l.headingBlockId === null).map(l => l.topicId));
  const rows = suggestions.filter(s => !taken.has(key(s.headingBlockId, s.topicId)) && !dropped.has(s.topicId)).map(s => ({
    ...scope, topicId: s.topicId, headingBlockId: s.headingBlockId, headingText: list.find(x => x.headingBlockId === s.headingBlockId)?.heading ?? '', origin: 'suggested' as const,
  }));
  const unique = [...new Map(rows.map(r => [key(r.headingBlockId, r.topicId), r])).values()];
  if (unique.length) await tx.insert(sectionLinks).values(unique).onConflictDoNothing();
  return unique.length;
}

async function carryStudentLinks(tx: Transaction, scope: Scope & { materialId: string; versionId: string }, list: Section[]) {
  const [previous] = await tx.selectDistinct({ versionId: sectionLinks.versionId, number: materialVersions.number }).from(sectionLinks)
    .innerJoin(materialVersions, eq(materialVersions.id, sectionLinks.versionId))
    .where(and(eq(sectionLinks.workspaceId, scope.workspaceId), eq(sectionLinks.materialId, scope.materialId), ne(sectionLinks.versionId, scope.versionId)))
    .orderBy(asc(materialVersions.number)).then(rows => rows.slice(-1));
  if (!previous) return;
  const old = await tx.select().from(sectionLinks).where(and(eq(sectionLinks.versionId, previous.versionId), eq(sectionLinks.workspaceId, scope.workspaceId)));
  const rows = old.filter(l => l.origin === 'student' || l.removed).flatMap(l => {
    const section = l.headingBlockId === null ? { headingBlockId: null, heading: '' } : list.find(s => s.headingBlockId && normalHeading(s.heading) === normalHeading(l.headingText));
    return section ? [{ ...scope, topicId: l.topicId, headingBlockId: section.headingBlockId, headingText: section.heading, origin: l.origin, removed: l.removed }] : [];
  });
  if (rows.length) await tx.insert(sectionLinks).values(rows).onConflictDoNothing();
}

/** Covers in the Reader: add a topic to the whole version, or remove it from every section of it. */
export async function setCover(tx: Transaction, scope: Scope & { materialId: string; versionId: string }, topicId: string, add: boolean) {
  const lead = and(eq(sectionLinks.versionId, scope.versionId), eq(sectionLinks.topicId, topicId), isNull(sectionLinks.headingBlockId));
  if (add) {
    const [row] = await tx.select().from(sectionLinks).where(lead);
    if (row) await tx.update(sectionLinks).set({ removed: false, origin: 'student' }).where(eq(sectionLinks.id, row.id));
    else await tx.insert(sectionLinks).values({ ...scope, topicId, headingBlockId: null, headingText: '', origin: 'student' });
    await tx.update(sectionLinks).set({ removed: false }).where(and(eq(sectionLinks.versionId, scope.versionId), eq(sectionLinks.topicId, topicId), eq(sectionLinks.origin, 'suggested')));
  } else {
    await tx.update(sectionLinks).set({ removed: true }).where(and(eq(sectionLinks.versionId, scope.versionId), eq(sectionLinks.topicId, topicId)));
    await tx.insert(sectionLinks).values({ ...scope, topicId, headingBlockId: null, headingText: '', origin: 'student', removed: true }).onConflictDoNothing();
  }
}

/** Ready materials of the course that are not the syllabus, with their current versions. */
export async function readyMaterials(db: Db, scope: Scope, syllabusId: string | null) {
  const rows = await db.select({ id: materials.id, title: materials.title, versionId: materialVersions.id, status: materialVersions.status, createdAt: materials.createdAt }).from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId))
    .where(and(eq(materials.workspaceId, scope.workspaceId), eq(materials.courseId, scope.courseId), eq(materials.archived, false), ne(materials.kind, 'syllabus')));
  return rows.filter(r => usableStatus(r.status) && r.id !== syllabusId);
}
