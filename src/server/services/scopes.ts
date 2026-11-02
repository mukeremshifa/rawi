import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { assessments, prerequisites, scopes, topics } from '../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { ApiError, conflict, notFound } from '../errors';
import type { ScopeSection, ScopeSummary, ScopeView, scopeInput, scopePatch, TopicDepth } from '../../shared/contracts/outline';
import { courseSections, type CourseSection } from './knowledge/course';
import { liveLinks } from './outline/links';
import { getCourse } from './workspace';
import { operation } from './learning';

type Db = ReadDb | SocketDb | Transaction;
type Row = typeof scopes.$inferSelect;

/**
 * Scopes: what a student is working on. Topic, assessment and course scopes are made on first use
 * and read their sections live. A section scope is a saved selection. Every scope names sections
 * by material and key, so a replaced material keeps its place in the scope.
 */
const DEPTH_WEIGHT: Record<TopicDepth, number> = { introduces: 1, covers: 1, mentions: 0.3 };

const summary = (row: Row, name: string, count: number): ScopeSummary => ({
  id: row.id, courseId: row.courseId, name, kind: row.kind, topicId: row.topicId, assessmentId: row.assessmentId, archived: row.archived, revision: row.revision, sectionCount: count, lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

/** The scope for a topic, an assessment or the whole course, made on first use, or a new saved selection. */
export async function ensureScope(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof scopeInput>) {
  await getCourse(db, workspaceId, courseId);
  const own = and(eq(scopes.workspaceId, workspaceId), eq(scopes.courseId, courseId));
  let name = 'Whole course';
  if (input.kind === 'topic') {
    const [topic] = await db.select({ title: topics.title }).from(topics).where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
    if (!topic) throw notFound();
    name = topic.title;
  } else if (input.kind === 'assessment') {
    const [row] = await db.select({ content: assessments.content }).from(assessments).where(and(eq(assessments.workspaceId, workspaceId), eq(assessments.courseId, courseId), eq(assessments.id, input.assessmentId)));
    if (!row) throw notFound();
    name = row.content.title;
  } else if (input.kind === 'sections') name = input.name;
  if (input.kind === 'material') {
    const list = (await courseSections(db, { workspaceId, courseId })).filter(s => s.materialId === input.materialId);
    if (!list.length) throw new ApiError(409, 'scope_empty', 'Rawi has not finished reading this material. Try again in a minute.');
    const sections = list.map(s => ({ materialId: s.materialId, key: s.key }));
    const same = (await db.select().from(scopes).where(and(own, eq(scopes.kind, 'sections'), eq(scopes.name, list[0]!.title), eq(scopes.archived, false)))).find(r => JSON.stringify(r.sections) === JSON.stringify(sections));
    if (same) return scopeView(db, workspaceId, same.id);
    const id = crypto.randomUUID();
    await db.insert(scopes).values({ id, workspaceId, courseId, name: list[0]!.title, kind: 'sections', sections });
    return scopeView(db, workspaceId, id);
  }
  const values = { id: input.kind === 'sections' ? input.id : crypto.randomUUID(), workspaceId, courseId, name, kind: input.kind, topicId: input.kind === 'topic' ? input.topicId : null, assessmentId: input.kind === 'assessment' ? input.assessmentId : null, sections: input.kind === 'sections' ? input.sections : [] };
  await db.insert(scopes).values(values).onConflictDoNothing();
  const [row] = await db.select().from(scopes).where(and(own, input.kind === 'sections' ? eq(scopes.id, input.id) : input.kind === 'topic' ? and(eq(scopes.kind, 'topic'), eq(scopes.topicId, input.topicId)) : input.kind === 'assessment' ? and(eq(scopes.kind, 'assessment'), eq(scopes.assessmentId, input.assessmentId)) : eq(scopes.kind, 'course')));
  if (!row) throw conflict();
  return scopeView(db, workspaceId, row.id);
}

export async function listScopes(db: Db, workspaceId: string, courseId: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select().from(scopes).where(and(eq(scopes.workspaceId, workspaceId), eq(scopes.courseId, courseId), eq(scopes.archived, false))).orderBy(desc(sql`coalesce(${scopes.lastUsedAt}, ${scopes.createdAt})`)).limit(100);
  const resolved = await Promise.all(rows.map(row => resolveRow(db, row)));
  return { scopes: resolved.map(r => summary(r.row, r.name, r.sections.length)) };
}

async function ownScope(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select().from(scopes).where(and(eq(scopes.workspaceId, workspaceId), eq(scopes.id, id)));
  if (!row) throw notFound();
  return row;
}

/** A scope's current sections, weighted for allotting questions, and what it saved that is gone. */
async function resolveRow(db: Db, row: Row, all?: CourseSection[]) {
  const scope = { workspaceId: row.workspaceId, courseId: row.courseId };
  const list = all ?? await courseSections(db, scope);
  const size = (s: CourseSection) => Math.min(2, Math.max(0.5, Math.sqrt(s.tokens / 300)));
  let name = row.name;
  let chosen: { section: CourseSection; weight: number }[] = [];
  const missing: ScopeSection[] = [];
  const byTopic = async (topicIds: string[]) => {
    const best = new Map<string, number>();
    for (const l of await liveLinks(db, scope)) if (topicIds.includes(l.topicId)) best.set(l.section.id, Math.max(best.get(l.section.id) ?? 0, DEPTH_WEIGHT[l.depth]));
    return list.filter(s => best.has(s.id)).map(s => ({ section: s, weight: best.get(s.id)! * size(s) }));
  };
  if (row.kind === 'topic' && row.topicId) {
    const [topic] = await db.select({ title: topics.title }).from(topics).where(eq(topics.id, row.topicId));
    name = topic?.title ?? name;
    chosen = await byTopic([row.topicId]);
  } else if (row.kind === 'assessment' && row.assessmentId) {
    const [a] = await db.select({ content: assessments.content }).from(assessments).where(eq(assessments.id, row.assessmentId));
    name = a?.content.title ?? name;
    // An assessment with no topics recorded covers the whole course until the student says otherwise.
    chosen = a?.content.topicIds.length ? await byTopic(a.content.topicIds) : list.map(s => ({ section: s, weight: size(s) }));
  } else if (row.kind === 'sections') {
    for (const want of row.sections) {
      const s = list.find(x => x.materialId === want.materialId && x.key === want.key);
      if (s) chosen.push({ section: s, weight: size(s) }); else missing.push(want);
    }
  } else chosen = list.map(s => ({ section: s, weight: size(s) }));
  return { row, name, sections: chosen, missing, all: list };
}

/** Resolve a scope for the tutor or for practice, and note that it was used. */
export async function resolveScope(db: SocketDb, workspaceId: string, id: string) {
  const row = await ownScope(db, workspaceId, id);
  await db.update(scopes).set({ lastUsedAt: new Date() }).where(eq(scopes.id, id));
  return resolveRow(db, row);
}
export type ResolvedScope = Awaited<ReturnType<typeof resolveScope>>;
/** The scope's sections, read inside the caller's transaction without marking the scope used. */
export async function scopeSections(db: Db, workspaceId: string, id: string) {
  return resolveRow(db, await ownScope(db, workspaceId, id));
}

/**
 * The scope with its sections and, when a section builds on one outside the scope, that section
 * offered as context. Prerequisites come from the material, never from a guess.
 */
export async function scopeView(db: Db, workspaceId: string, id: string): Promise<ScopeView> {
  const r = await resolveRow(db, await ownScope(db, workspaceId, id));
  const inside = new Set(r.sections.map(s => s.section.id));
  const needs = inside.size ? await db.select({ requiresId: prerequisites.requiresId, detail: prerequisites.detail }).from(prerequisites).where(inArray(prerequisites.sectionId, [...inside])) : [];
  const outside = [...new Map(needs.filter(n => !inside.has(n.requiresId)).map(n => [n.requiresId, n])).values()].slice(0, 8);
  const place = (s: CourseSection) => ({ id: s.id, materialId: s.materialId, versionId: s.versionId, materialTitle: s.title, key: s.key, heading: s.heading, blockId: s.blockIds[0] ?? null });
  return {
    ...summary(r.row, r.name, r.sections.length),
    sections: r.sections.map(s => ({ ...place(s.section), weight: Math.round(s.weight * 100) / 100 })),
    missing: r.missing,
    prerequisites: outside.flatMap(n => { const s = r.all.find(x => x.id === n.requiresId); return s ? [{ ...place(s), detail: n.detail }] : []; }),
  };
}

export async function patchScope(db: SocketDb, workspaceId: string, id: string, input: z.infer<typeof scopePatch>) {
  return operation(db, workspaceId, input.operationId, { action: 'scope', id, input }, async tx => {
    const [row] = await tx.select().from(scopes).where(and(eq(scopes.workspaceId, workspaceId), eq(scopes.id, id))).for('update');
    if (!row) throw notFound();
    if (row.revision !== input.expectedRevision) throw conflict();
    if ((input.name || input.sections) && row.kind !== 'sections') throw new ApiError(400, 'invalid_input', 'Only a saved selection can be renamed or changed. Topic and assessment scopes follow the outline.');
    await tx.update(scopes).set({ ...(input.name ? { name: input.name } : {}), ...(input.sections ? { sections: input.sections } : {}), ...(input.archived === undefined ? {} : { archived: input.archived }), revision: row.revision + 1, updatedAt: new Date() }).where(eq(scopes.id, id));
    return scopeView(tx, workspaceId, id);
  });
}
