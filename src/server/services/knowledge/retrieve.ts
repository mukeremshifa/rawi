import { and, eq, inArray, sql } from 'drizzle-orm';
import { blocks, ingestJobs, knowledgeChunks, materials, materialVersions, sectionLinks, sections } from '../../db/schema';
import type { BackendBindings } from '../../config';
import { embed, type CallContext } from '../../ai/engine';
import type { Language } from '../../ai/types';
import type { Citation } from '../../../shared/contracts/document';
import { blockMarkdown } from '../../../shared/domain/document-text';
import { searchConfig } from './language';

/**
 * Evidence for one tutor turn, chosen by what the turn needs.
 *
 * - A session started from a passage loads that passage and its neighbours from its blocks, in
 *   the version the student opened. When the material has a newer version the passage is
 *   marked as earlier, and current materials are searched as for any question.
 * - A question searches the course's current versions by text and by meaning together, fused
 *   by rank, then fills a budget with distinct passages, preferring other sections over more
 *   of the same one so that complementary passages are not crowded out.
 * - A follow-up is read with the last exchange before searching.
 *
 * The verdict compares the question's own terms with what the chosen passages say. Absent
 * evidence is answered without a model call. Partial evidence names the terms it lacks, so
 * the reply can say what the materials leave out instead of filling the gap.
 */
export interface Passage {
  /** Short id the model cites, such as `p2`. */
  id: string;
  materialId: string; versionId: string; blockIds: string[];
  materialTitle: string; heading: string; text: string; sectionSummary: string | null;
  /** `figure` is a description Rawi generated from an image, not the material's own words. */
  kind: 'text' | 'figure';
  /** The session's own passage. */
  focus?: boolean;
  /** From a version the material has since replaced. */
  earlier?: boolean;
}
export type Verdict = 'sufficient' | 'partial' | 'absent' | 'conversational';
export interface Retrieval {
  passages: Passage[];
  verdict: Verdict;
  /** Terms of the question that no chosen passage mentions. */
  missing: string[];
  /** Current materials not yet searchable, so absent evidence may only mean not read yet. */
  pending: string[];
  via: string[];
}

/** English words that carry no topic. Other languages fall back to word length alone. */
const STOP = new Set(('the and for are but not you all any can had her was one our out has him his how its may now see two way who did get let put say she too use what when where which while with why would could should will this that these those them they their there then than from into about over under after before again also just only very more most some such each other because been being does doing done have having here like make made many much must need want know tell explain describe give example examples help please thanks thank okay yes yeah sure mean means meant really actually think thought question answer between your yours mine whose whom ever every both either neither same something anything nothing still even quite rather maybe perhaps people thing things way ways happen happened catch detail details detailed several worked working example examples instance step steps simple simply briefly short long more less clear clearly own words').split(' '));

/** Content words of a text, lower case, without repeats. */
export function terms(text: string, language: Language) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(words.filter(w => language !== 'en' || !STOP.has(w)))].slice(0, 24);
}

/** Capitalised words after the first, such as "Tordesillas" or "Okonkwo". Scripts without case have none. */
function names(text: string, language: Language) {
  if (language !== 'en') return [];
  const words = text.match(/\p{L}[\p{L}'’]*/gu) ?? [];
  return [...new Set(words.slice(1).filter(w => /^\p{Lu}\p{Ll}/u.test(w)).map(w => w.replace(/['’]s$/, '').toLowerCase()))].filter(w => w.length >= 3);
}

/** A crude stem, so `enforced` finds `enforcement`. Enough to compare a question with its evidence. */
const stem = (word: string) => word.length > 6 ? word.slice(0, Math.max(5, word.length - 3)) : word;
const mentions = (text: string, word: string) => text.includes(stem(word));

/** Words that point back to the previous turn: "it", "they", "him", a bare "yes" or "why". */
const ANAPHORA = /\b(it|its|they|them|their|this|that|these|those|he|him|his|she|her|there|which|yes|yeah|ok|okay|why|how)\b/i;

/**
 * The search text for a turn. A short message that leans on the previous turn is read with the
 * last exchange, so "Who disagreed with him?" searches as a question about Larssen.
 */
export function resolveQuery(message: string, history: { role: 'user' | 'assistant'; text: string }[], language: Language) {
  const own = terms(message, language);
  const leans = own.length <= 4 && ANAPHORA.test(message);
  if (!leans || !history.length) return { query: message, context: '' };
  const lastStudent = [...history].reverse().find(h => h.role === 'user')?.text ?? '';
  const lastTutor = [...history].reverse().find(h => h.role === 'assistant')?.text ?? '';
  return { query: message, context: `${lastStudent}\n${lastTutor.slice(0, 600)}` };
}

/** Characters of evidence per turn, about 2,400 tokens, leaving room for history. */
const BUDGET_CHARS = 9600;
const MAX_PASSAGES = 6;
/** Rank fusion constant. Larger values flatten the gap between first and tenth place. */
const RRF = 20;
/** Cosine distance beyond which a passage is not about the question, for this embedding model. */
const FAR = 0.5;
const CLOSE = 0.3;

type Row = { id: string; materialId: string; versionId: string; blockIds: string[]; heading: string; text: string; sectionId: string; ordinal: number; kind: 'text' | 'figure' };

/** Runs of three words. Parts of one long table or ledger share words but not runs. */
const shingles = (text: string) => { const w = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; return new Set(w.slice(2).map((x, i) => `${w[i]} ${w[i + 1]} ${x}`)); };
/** Share of the smaller text's word runs found in the other. Near 1 means one repeats the other. */
function overlap(a: string, b: string) {
  const x = shingles(a), y = shingles(b);
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.max(1, Math.min(x.size, y.size));
}

export async function retrieve(env: BackendBindings, ctx: CallContext, opts: { courseId: string; query: string; context?: string; language: Language; topicId?: string | null; focus?: Citation | null }): Promise<Retrieval> {
  const { db, workspaceId } = ctx;
  const own = terms(opts.query, opts.language);
  const via: string[] = [];
  // Nothing to look up, such as "thanks": the reply needs the conversation, not evidence.
  if (!own.length && !opts.context && !opts.focus) return { passages: [], verdict: 'conversational', missing: [], pending: [], via };
  const searchTerms = [...new Set([...own, ...terms(opts.context ?? '', opts.language)])].slice(0, 24);
  const current = and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.courseId, opts.courseId),
    sql`${knowledgeChunks.versionId} in (select m.current_version_id from ${materials} m where m.workspace_id = ${workspaceId} and m.course_id = ${opts.courseId} and not m.archived)`);
  const columns = { id: knowledgeChunks.id, materialId: knowledgeChunks.materialId, versionId: knowledgeChunks.versionId, blockIds: knowledgeChunks.blockIds, heading: knowledgeChunks.heading, text: knowledgeChunks.text, sectionId: knowledgeChunks.sectionId, ordinal: knowledgeChunks.ordinal, kind: knowledgeChunks.kind };
  const config = searchConfig(opts.language);
  const q = searchTerms.length ? searchTerms.join(' | ') : null;
  const rank = q ? sql<number>`ts_rank_cd(${knowledgeChunks.search}, to_tsquery(${config}::regconfig, ${q}), 32)` : sql<number>`0`;
  const embedText = [opts.context?.slice(-600) ?? '', opts.query].join('\n').trim();

  // Everything independent runs together: the focus, text search, the query embedding and the
  // current materials that cannot be searched yet.
  const [focus, textRows, pendingRows] = await Promise.all([
    opts.focus ? focusPassage(db, workspaceId, opts.focus) : Promise.resolve(null),
    q ? db.select({ ...columns, rank }).from(knowledgeChunks).where(and(current, sql`${knowledgeChunks.search} @@ to_tsquery(${config}::regconfig, ${q})`)).orderBy(sql`${rank} desc`).limit(16) : Promise.resolve([]),
    db.execute(sql`select m.title from ${materials} m join ${materialVersions} v on v.id = m.current_version_id left join ${ingestJobs} j on j.version_id = v.id
      where m.workspace_id = ${workspaceId} and m.course_id = ${opts.courseId} and not m.archived and v.status in ('ready', 'partial') and coalesce(j.readiness, 'readable') = 'readable' limit 5`),
  ]);
  // Search by meaning only when the best text matches leave the question's terms uncovered.
  // A query embedding costs little but takes one to five seconds, all before the first token.
  const judged = own;
  const topText = textRows.slice(0, 4).map(r => `${r.heading}\n${r.text}`).join('\n').toLowerCase();
  const textCovers = textRows.length > 0 && judged.filter(w => mentions(topText, w)).length >= 0.75 * judged.length;
  // A name no text match mentions decides the verdict as absent whatever vectors find.
  const nameGap = names(opts.query, opts.language).some(w => !textRows.some(r => r.text.toLowerCase().includes(stem(w))));
  const queryVector = searchTerms.length && !textCovers && !nameGap ?await embed(env, ctx, [embedText], 'query', opts.language, 'student') : null;
  const vector = queryVector ? `[${queryVector.vectors[0]!.join(',')}]` : null;
  const vectorRows = vector
    ? await db.select({ ...columns, distance: sql<number>`${knowledgeChunks.embedding} <=> ${vector}::vector` }).from(knowledgeChunks)
      .where(and(current, eq(knowledgeChunks.embeddingModel, queryVector!.model))).orderBy(sql`${knowledgeChunks.embedding} <=> ${vector}::vector`).limit(16)
    : [];
  if (focus) via.push('focus');
  if (textRows.length) via.push('text');
  if (vectorRows.length) via.push('vector');

  // Reciprocal rank fusion of the two lists. Vector rows far from the question are left out.
  const fused = new Map<string, { row: Row; score: number }>();
  const add = (row: Row, score: number) => { const prior = fused.get(row.id); fused.set(row.id, { row, score: (prior?.score ?? 0) + score }); };
  textRows.forEach((r, i) => add(r, 1 / (RRF + i)));
  // Exact numbers and names in the question pick out one part of a long table or ledger, where
  // every part shares the same words and ranks alike.
  const exact = [...own.filter(w => /\d/.test(w)), ...names(opts.query, opts.language)];
  for (const r of textRows) { const text = r.text.toLowerCase(); for (const w of exact) if (text.includes(w)) add(r, 1 / RRF); }
  vectorRows.filter(r => r.distance < FAR).forEach((r, i) => add(r, 1 / (RRF + i)));
  // Topic links raise passages already found. They never add one by themselves.
  if (opts.topicId && fused.size) {
    const linked = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).innerJoin(sections, eq(sections.id, knowledgeChunks.sectionId)).innerJoin(sectionLinks, and(eq(sectionLinks.versionId, knowledgeChunks.versionId), sql`${sectionLinks.headingBlockId} is not distinct from ${sections.headingBlockId}`))
      .where(and(inArray(knowledgeChunks.id, [...fused.keys()]), eq(sectionLinks.topicId, opts.topicId), eq(sectionLinks.removed, false)));
    for (const { id } of linked) fused.get(id)!.score *= 1.25;
    if (linked.length) via.push('topic');
  }

  // Fill the budget in score order. Skip near repeats, and take at most two passages from one
  // section, so a second section that says something different still gets in.
  const chosen: Row[] = [];
  let used = focus?.text.length ?? 0;
  const perSection = new Map<string, number>();
  for (const { row } of [...fused.values()].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= MAX_PASSAGES) break;
    if (used + row.text.length > BUDGET_CHARS) continue;
    // An earlier version is never a reason to leave out the current text.
    if (focus && !focus.earlier && overlap(row.text, focus.text) > 0.6) continue;
    if (chosen.some(c => overlap(c.text, row.text) > 0.6)) continue;
    const key = row.sectionId;
    if ((perSection.get(key) ?? 0) >= 2) continue;
    chosen.push(row); used += row.text.length; perSection.set(key, (perSection.get(key) ?? 0) + 1);
  }
  chosen.sort((a, b) => a.versionId === b.versionId ? a.ordinal - b.ordinal : 0);

  // The verdict: how many of the question's own terms the evidence mentions. A follow-up with
  // almost no terms of its own, such as "Did people follow it?", cannot be judged on words, so
  // it rests on whether the exchange it leans on found a passage.
  const evidence = [focus && !focus.earlier ? focus.text : '', ...chosen.map(c => `${c.heading}\n${c.text}`)].join('\n').toLowerCase();
  const missing = judged.filter(w => !mentions(evidence, w));
  const share = judged.length ? 1 - missing.length / judged.length : 1;
  const close = vectorRows.some(r => r.distance < CLOSE);
  // A name the student asks about that no passage mentions means the subject itself is missing.
  const subjectMissing = names(opts.query, opts.language).some(w => !mentions(evidence, w));
  const bare = !!opts.context && own.length < 2;
  const verdict: Verdict = (!chosen.length && !(focus && !focus.earlier)) || subjectMissing ? 'absent'
    : bare || share >= 0.75 || (close && share >= 0.5) ? 'sufficient'
    : share >= 0.4 ? 'partial' : 'absent';

  const [titles, summaries] = await Promise.all([
    db.select({ id: materials.id, title: materials.title }).from(materials).where(inArray(materials.id, [...new Set([...chosen.map(p => p.materialId), ...(focus ? [focus.materialId] : [])])])),
    chosen.length ? db.select({ id: sections.id, summary: sections.summary }).from(sections).where(inArray(sections.id, [...new Set(chosen.map(c => c.sectionId))])) : Promise.resolve([]),
  ]);
  const title = (id: string) => titles.find(t => t.id === id)?.title ?? '';
  const passages: Passage[] = [
    ...(focus ? [{ id: '', materialId: focus.materialId, versionId: focus.versionId, blockIds: focus.blockIds, materialTitle: title(focus.materialId), heading: focus.heading, text: focus.text, sectionSummary: null, kind: 'text' as const, focus: true, earlier: focus.earlier }] : []),
    ...chosen.map(r => ({ id: '', materialId: r.materialId, versionId: r.versionId, blockIds: r.blockIds, materialTitle: title(r.materialId), heading: r.heading, text: r.text, kind: r.kind, sectionSummary: summaries.find(s => s.id === r.sectionId)?.summary ?? null })),
  ].map((p, i) => ({ ...p, id: `p${i + 1}` }));
  // The session's own passage is always shown, but only fresh evidence counts as support.
  return { passages, verdict: verdict === 'absent' && !passages.some(p => !p.focus) ? 'absent' : verdict, missing, pending: (pendingRows.rows as { title: string }[]).map(r => r.title), via };
}

/**
 * The passage a session is about, read from its blocks in the version the student opened, with
 * one block either side for context. Marked as earlier when the material has a newer version.
 */
async function focusPassage(db: CallContext['db'], workspaceId: string, focus: Citation) {
  // One query: the material, whether this version is still current, and the blocks with a neighbour either side.
  const ids = `{${focus.blockIds.filter(id => /^[0-9a-f-]{36}$/i.test(id)).join(',')}}`;
  const rows = await db.execute(sql`with v as (select v.material_id, m.current_version_id from ${materialVersions} v join ${materials} m on m.id = v.material_id where v.workspace_id = ${workspaceId} and v.id = ${focus.versionId}),
      picked as (select min(ordinal) lo, max(ordinal) hi from ${blocks} where version_id = ${focus.versionId} and id = any(${ids}::uuid[]))
    select v.material_id, v.current_version_id, b.id, b.type, b.content from v, picked, ${blocks} b where b.version_id = ${focus.versionId} and b.ordinal between picked.lo - 1 and picked.hi + 1 order by b.ordinal`);
  const list = rows.rows as { material_id: string; current_version_id: string; id: string; type: string; content: unknown }[];
  if (!list.length) return null;
  const heading = list.find(b => b.type === 'heading');
  const text = list.map(b => blockMarkdown(b as never).trim()).filter(Boolean).join('\n\n').slice(0, BUDGET_CHARS);
  return { materialId: list[0]!.material_id, versionId: focus.versionId, blockIds: focus.blockIds, heading: heading ? blockMarkdown(heading as never).replace(/^#+\s*/, '') : '', text, earlier: list[0]!.current_version_id !== focus.versionId };
}

/** Whether the course has any knowledge layer yet. Tutor and generation say so when it does not. */
export async function knowledgeReady(db: CallContext['db'], workspaceId: string, courseId: string) {
  const [row] = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.courseId, courseId))).limit(1);
  return !!row;
}
