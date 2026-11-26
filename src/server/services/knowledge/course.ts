import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { facts, knowledgeChunks, materials, prerequisites, sections } from '../../db/schema';
import { transaction, type ReadDb, type SocketDb, type Transaction } from '../../db/client';
import { sequenceNumber } from '../outline/provider';
import { enqueueJob } from '../outline/queue';

type Scope = { workspaceId: string; courseId: string };
type Db = ReadDb | SocketDb | Transaction;

/**
 * A course's current sections in reading order: materials by their lecture or week number when
 * the title has one, otherwise by when they were added, then sections in order. The syllabus is
 * left out, since it describes the course rather than teaching it.
 */
export async function courseSections(db: Db, scope: Scope) {
  const rows = await db
    .select({
      id: sections.id,
      materialId: sections.materialId,
      versionId: sections.versionId,
      ordinal: sections.ordinal,
      key: sections.key,
      heading: sections.heading,
      path: sections.path,
      blockIds: sections.blockIds,
      tokens: sections.tokens,
      summary: sections.summary,
      keyTerms: sections.keyTerms,
      language: sections.language,
      title: materials.title,
      added: materials.createdAt,
    })
    .from(sections)
    .innerJoin(
      materials,
      and(eq(materials.id, sections.materialId), eq(materials.currentVersionId, sections.versionId)),
    )
    .where(
      and(
        eq(sections.workspaceId, scope.workspaceId),
        eq(sections.courseId, scope.courseId),
        eq(materials.archived, false),
        sql`${materials.kind} <> 'syllabus'`,
      ),
    );
  const order = (r: (typeof rows)[number]) => sequenceNumber(r.title) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort(
    (a, b) =>
      order(a) - order(b) ||
      a.added.getTime() - b.added.getTime() ||
      a.materialId.localeCompare(b.materialId) ||
      a.ordinal - b.ordinal,
  );
}
export type CourseSection = Awaited<ReturnType<typeof courseSections>>[number];

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const GENERIC = new Set([
  'introduction',
  'overview',
  'summary',
  'conclusion',
  'conclusions',
  'background',
  'review',
  'questions',
  'exercises',
  'further reading',
  'key terms',
  'notes',
  'references',
  'contents',
]);
/** "see Section 3", "as discussed in Lecture 2", "recall from Chapter IV". */
const REFERENCE =
  /\b(?:see|cf\.?|as (?:discussed|shown|explained|described|defined|introduced) in|recall(?:ed)? from|from|in)\s+(section|chapter|lecture|unit|week|part|module)\s+(\d{1,3}|[ivxlc]{1,6})\b/gi;
const roman = (s: string) => {
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]!]!,
      b = v[s[i + 1]!] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
};

/**
 * What each section builds on, from the material itself. A section that uses a term an earlier
 * section defines requires that section. So does one that refers to an earlier part by number.
 * Code only, rebuilt for the whole course in one transaction whenever a version finishes reading.
 */
export async function relateCourse(db: SocketDb, scope: Scope) {
  const list = await courseSections(db, scope);
  if (!list.length) {
    await db
      .delete(prerequisites)
      .where(and(eq(prerequisites.workspaceId, scope.workspaceId), eq(prerequisites.courseId, scope.courseId)));
    return 0;
  }
  const ids = list.map(s => s.id);
  const [definitions, chunks] = await Promise.all([
    db
      .select({ sectionId: facts.sectionId, subject: facts.subject })
      .from(facts)
      .where(and(inArray(facts.sectionId, ids), eq(facts.kind, 'definition'))),
    db
      .select({ sectionId: knowledgeChunks.sectionId, text: knowledgeChunks.text })
      .from(knowledgeChunks)
      .where(and(inArray(knowledgeChunks.sectionId, ids), eq(knowledgeChunks.kind, 'text')))
      .orderBy(asc(knowledgeChunks.ordinal)),
  ]);
  const position = new Map(list.map((s, i) => [s.id, i]));
  const textOf = new Map<string, string>();
  for (const c of chunks) textOf.set(c.sectionId, `${textOf.get(c.sectionId) ?? ''} ${normal(c.text)} `);
  // Each concept is defined where it first appears in reading order: a definition fact, or a
  // short heading that names a concept.
  const definedAt = new Map<string, string>();
  const define = (term: string, sectionId: string) => {
    const t = normal(term);
    if (t.length < 4 || t.split(' ').length > 5 || GENERIC.has(t)) return;
    const prior = definedAt.get(t);
    if (!prior || position.get(sectionId)! < position.get(prior)!) definedAt.set(t, sectionId);
  };
  for (const d of definitions) define(d.subject, d.sectionId);
  for (const s of list)
    if (s.heading && s.heading.split(/\s+/).length <= 5) define(s.heading.replace(/^(the|a|an)\s+/i, ''), s.id);
  const links = new Map<
    string,
    { sectionId: string; requiresId: string; reason: 'term' | 'reference'; detail: string }
  >();
  const add = (sectionId: string, requiresId: string, reason: 'term' | 'reference', detail: string) => {
    if (sectionId === requiresId || position.get(requiresId)! >= position.get(sectionId)!) return;
    const key = `${sectionId}:${requiresId}`;
    if (!links.has(key) && [...links.values()].filter(l => l.sectionId === sectionId).length < 6)
      links.set(key, { sectionId, requiresId, reason, detail: detail.slice(0, 120) });
  };
  for (const s of list) {
    const text = textOf.get(s.id) ?? '';
    for (const [term, at] of definedAt) if (at !== s.id && text.includes(` ${term} `)) add(s.id, at, 'term', term);
    for (const m of text.matchAll(REFERENCE)) {
      const n = /^\d+$/.test(m[2]!) ? Number(m[2]) : roman(m[2]!.toLowerCase());
      const word = m[1]!.toLowerCase();
      // A heading that starts with the reference, or else the first section of the numbered material.
      const target =
        list.find(o => o.heading.toLowerCase().startsWith(`${word} ${m[2]!.toLowerCase()}`)) ??
        list.find(o => sequenceNumber(o.title) === n && o.title.toLowerCase().includes(word));
      if (target) add(s.id, target.id, 'reference', `${m[1]} ${m[2]}`);
    }
  }
  await transaction(db, async tx => {
    await tx
      .delete(prerequisites)
      .where(and(eq(prerequisites.workspaceId, scope.workspaceId), eq(prerequisites.courseId, scope.courseId)));
    const rows = [...links.values()].map(l => ({ ...scope, ...l }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(prerequisites).values(rows.slice(i, i + 500));
  });
  return links.size;
}

/**
 * Course work that follows a version finishing its knowledge layer: prerequisites are read again,
 * and topics are assigned to its sections, now that they have summaries and terms.
 */
export async function afterIngest(db: SocketDb, scope: Scope) {
  await relateCourse(db, scope);
  await transaction(db, tx => enqueueJob(tx, scope, 'assign_topics'));
}
