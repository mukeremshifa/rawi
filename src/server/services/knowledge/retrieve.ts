import { and, eq, inArray, sql } from 'drizzle-orm';
import { knowledgeChunks, knowledgeSections, materials, materialVersions, sectionLinks } from '../../db/schema';
import type { BackendBindings } from '../../config';
import { embed, type CallContext } from '../../ai/engine';
import type { Language } from '../../ai/types';
import type { Citation } from '../../../shared/contracts/document';
import { searchConfig } from './language';

/**
 * A few passages for one question, from the course's current versions. The focus section comes
 * first, then sections linked to the topic, then text search. Vector search runs only when text
 * search is weak, which saves an embedding call and its latency on most turns. When nothing
 * relevant is found the result says so, and the caller answers without a model call.
 */
export interface Passage {
  /** Short id the model cites, such as `p2`. */
  id: string;
  materialId: string; versionId: string; blockIds: string[];
  materialTitle: string; heading: string; text: string; sectionSummary: string | null;
}
export interface Retrieval { passages: Passage[]; sufficient: boolean; via: string[] }

/** Words a student typed, as an OR query, so a long question still matches a short passage. */
function orQuery(text: string) {
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 24);
  return words.length ? words.join(' | ') : null;
}

export async function retrieve(env: BackendBindings, ctx: CallContext, opts: { courseId: string; query: string; language: Language; topicId?: string | null; focus?: Citation | null; k?: number }): Promise<Retrieval> {
  const { db, workspaceId } = ctx;
  const k = opts.k ?? 4;
  const current = and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.courseId, opts.courseId), sql`${knowledgeChunks.versionId} in (select m.current_version_id from ${materials} m where m.workspace_id = ${workspaceId} and m.course_id = ${opts.courseId} and not m.archived)`);
  const columns = { id: knowledgeChunks.id, materialId: knowledgeChunks.materialId, versionId: knowledgeChunks.versionId, blockIds: knowledgeChunks.blockIds, heading: knowledgeChunks.heading, text: knowledgeChunks.text, sectionBlockId: knowledgeChunks.sectionBlockId, ordinal: knowledgeChunks.ordinal };
  type Row = { id: string; materialId: string; versionId: string; blockIds: string[]; heading: string; text: string; sectionBlockId: string | null; ordinal: number };
  const scores = new Map<string, { row: Row; score: number }>();
  const add = (row: Row, score: number) => { const prior = scores.get(row.id); scores.set(row.id, { row, score: (prior?.score ?? 0) + score }); };
  const via: string[] = [];

  const config = searchConfig(opts.language);
  const q = orQuery(opts.query);
  const rank = q ? sql<number>`ts_rank_cd(${knowledgeChunks.search}, to_tsquery(${config}::regconfig, ${q}))` : sql<number>`0`;
  // Focus, text search and topic links are independent, so they run together.
  const [focusRows, textRows, topicRows] = await Promise.all([
    // The focus: chunks holding the cited blocks, in that exact version.
    opts.focus ? db.select(columns).from(knowledgeChunks).where(and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.versionId, opts.focus.versionId), sql`${knowledgeChunks.blockIds} ?| ${sql.raw(`array[${opts.focus.blockIds.map(id => `'${id.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]`)}`)).limit(3) : Promise.resolve([]),
    q ? db.select({ ...columns, rank }).from(knowledgeChunks).where(and(current, sql`${knowledgeChunks.search} @@ to_tsquery(${config}::regconfig, ${q})`)).orderBy(sql`${rank} desc`).limit(12) : Promise.resolve([]),
    // Chunks in sections linked to the topic, matched on the section's heading.
    opts.topicId ? db.select(columns).from(knowledgeChunks).innerJoin(sectionLinks, and(eq(sectionLinks.versionId, knowledgeChunks.versionId), sql`${sectionLinks.headingBlockId} is not distinct from ${knowledgeChunks.sectionBlockId}`))
      .where(and(current, eq(sectionLinks.topicId, opts.topicId), eq(sectionLinks.removed, false))).limit(40) : Promise.resolve([]),
  ]);
  for (const r of focusRows) add(r, 100);
  if (focusRows.length) via.push('focus');
  textRows.forEach((r, i) => add(r, 6 / (1 + i) + Math.min(4, r.rank * 10)));
  const textHits = textRows.filter(r => r.rank >= 0.1).length;
  if (textRows.length) via.push('text');

  // Vectors only when text search found little.
  let vectorHits = 0;
  if (textHits < 2) {
    const query = await embed(env, ctx, [opts.query], 'query', opts.language);
    if (query) {
      const vector = `[${query.vectors[0]!.join(',')}]`;
      const distance = sql<number>`${knowledgeChunks.embedding} <=> ${vector}::vector`;
      const rows = await db.select({ ...columns, distance }).from(knowledgeChunks).where(and(current, eq(knowledgeChunks.embeddingModel, query.model))).orderBy(distance).limit(8);
      // Cosine distance under about 0.45 is a related passage for this embedding model.
      const close = rows.filter(r => r.distance < 0.45);
      close.forEach((r, i) => add(r, 5 / (1 + i) + (0.45 - r.distance) * 10));
      vectorHits = close.length;
      if (rows.length) via.push('vector');
    }
  }

  // Topic links add weight to chunks already found, and supply a passage when nothing else did.
  for (const r of topicRows) add(r, scores.has(r.id) ? 4 : 1);
  if (topicRows.length) via.push('topic');

  const picked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, k).map(s => s.row)
    // Reading order within a version reads better than score order.
    .sort((a, b) => a.versionId === b.versionId ? a.ordinal - b.ordinal : 0);
  const sufficient = !!opts.focus || textHits > 0 || vectorHits > 0;
  if (!picked.length) return { passages: [], sufficient: false, via };

  const versionIds = [...new Set(picked.map(p => p.versionId))];
  // Figure descriptions are chunks of their own, labelled in their text as generated.
  const [titles, summaries] = await Promise.all([
    db.select({ id: materials.id, title: materials.title }).from(materials).where(inArray(materials.id, [...new Set(picked.map(p => p.materialId))])),
    db.select({ versionId: knowledgeSections.versionId, sectionBlockId: knowledgeSections.sectionBlockId, summary: knowledgeSections.summary }).from(knowledgeSections).where(inArray(knowledgeSections.versionId, versionIds)),
  ]);
  const passages = picked.map((r, i) => ({
    id: `p${i + 1}`, materialId: r.materialId, versionId: r.versionId, blockIds: r.blockIds,
    materialTitle: titles.find(t => t.id === r.materialId)?.title ?? '', heading: r.heading, text: r.text,
    sectionSummary: summaries.find(s => s.versionId === r.versionId && s.sectionBlockId === r.sectionBlockId)?.summary ?? null,
  }));
  return { passages, sufficient, via };
}

/** Whether the course has any knowledge layer yet. Tutor and generation say so when it does not. */
export async function knowledgeReady(db: CallContext['db'], workspaceId: string, courseId: string) {
  const [row] = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).innerJoin(materialVersions, eq(materialVersions.id, knowledgeChunks.versionId))
    .where(and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.courseId, courseId))).limit(1);
  return !!row;
}
