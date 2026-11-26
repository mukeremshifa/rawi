import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { facts, glosses, materials, sections } from '../../db/schema';
import { budget, run, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import { detectLanguage } from '../knowledge/language';
import type { GlossaryEntry, GlossaryView } from '../../../shared/contracts/language';
import { getCourse } from '../workspace';

/**
 * The course glossary: every term the course's current materials define, with the material's own
 * definition and, in the student's first language, a short gloss and a one-sentence explanation.
 * The English definition and its blocks stay the source. A gloss is written once per definition
 * and language and kept.
 */

type Db = ReadDb | SocketDb | Transaction;
/** Terms one call glosses. */
const BATCH = 20;
/** Terms one request glosses, so a long course fills over several visits. */
const PER_REQUEST = 60;
/** Terms a glossary shows. */
const LIMIT = 400;

async function definitions(db: Db, workspaceId: string, courseId: string, language: Language) {
  const rows = await db
    .select({
      factId: facts.id,
      term: facts.subject,
      definition: facts.text,
      materialId: facts.materialId,
      versionId: facts.versionId,
      blockIds: facts.blockIds,
      heading: sections.heading,
      material: materials.title,
      gloss: glosses.gloss,
      explanation: glosses.explanation,
    })
    .from(facts)
    .innerJoin(materials, and(eq(materials.id, facts.materialId), eq(materials.currentVersionId, facts.versionId)))
    .innerJoin(sections, eq(sections.id, facts.sectionId))
    .leftJoin(glosses, and(eq(glosses.factId, facts.id), eq(glosses.language, language)))
    .where(
      and(
        eq(facts.workspaceId, workspaceId),
        eq(facts.courseId, courseId),
        eq(facts.kind, 'definition'),
        eq(materials.archived, false),
      ),
    )
    .orderBy(asc(sections.ordinal), asc(facts.position))
    .limit(LIMIT * 2);
  // A term two materials define appears once, glossed where possible.
  const seen = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = r.term.trim().toLowerCase();
    const prior = seen.get(key);
    if (!prior || (!prior.gloss && r.gloss)) seen.set(key, r);
  }
  return [...seen.values()].slice(0, LIMIT);
}

export async function glossary(
  db: Db,
  workspaceId: string,
  courseId: string,
  language: Language,
): Promise<GlossaryView> {
  await getCourse(db, workspaceId, courseId);
  const rows = await definitions(db, workspaceId, courseId, language);
  const entries: GlossaryEntry[] = rows.map(r => ({
    factId: r.factId,
    term: r.term,
    definition: r.definition,
    source: { materialId: r.materialId, versionId: r.versionId, blockIds: r.blockIds },
    heading: r.heading,
    material: r.material,
    gloss: r.gloss,
    explanation: r.explanation,
  }));
  return { language, entries, missing: entries.filter(e => !e.gloss).length };
}

/** Write the glosses a course's glossary is missing, a bounded number per request. */
export async function buildGlossary(
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  language: Language,
  ids: { operationId?: string; jobId?: string } = {},
) {
  await getCourse(db, workspaceId, courseId);
  const missing = (await definitions(db, workspaceId, courseId, language)).filter(r => !r.gloss).slice(0, PER_REQUEST);
  const ctx = { db, workspaceId, ...ids, budget: budget(Math.ceil(missing.length / BATCH) * 2, 60_000, 120) };
  let written = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const served = await run(env, ctx, glossTask, {
      language,
      terms: batch.map(b => ({ id: b.factId, term: b.term, definition: b.definition })),
    });
    const rows = served.value.flatMap(g => {
      const b = batch.find(x => x.factId === g.id);
      return b
        ? [
            {
              workspaceId,
              courseId,
              factId: b.factId,
              language,
              term: b.term,
              gloss: g.gloss,
              explanation: g.explanation,
              writtenBy: `${served.route.vendor}:${served.route.model}`,
            },
          ]
        : [];
    });
    if (rows.length) await db.insert(glosses).values(rows).onConflictDoNothing();
    written += rows.length;
  }
  return { written, remaining: Math.max(0, (await glossary(db, workspaceId, courseId, language)).missing) };
}

/** Whether a course has any glosses in a language yet. */
export async function glossaryCounts(db: Db, workspaceId: string, language: Language) {
  const rows = await db
    .select({ courseId: glosses.courseId, n: sql<number>`count(*)::int` })
    .from(glosses)
    .where(and(eq(glosses.workspaceId, workspaceId), eq(glosses.language, language)))
    .groupBy(glosses.courseId);
  return new Map(rows.map(r => [r.courseId, r.n]));
}

/** Glosses for given definitions, for a question's terms. */
export async function glossesFor(db: Db, workspaceId: string, factIds: string[], language: Language) {
  if (!factIds.length) return [];
  return db
    .select()
    .from(glosses)
    .where(and(eq(glosses.workspaceId, workspaceId), eq(glosses.language, language), inArray(glosses.factId, factIds)));
}

interface GlossInput {
  language: Language;
  terms: { id: string; term: string; definition: string }[];
}
const glossSchema = z.object({
  terms: z.array(
    z.object({
      id: z.string(),
      gloss: z.string().describe('The term in the target language: a standard translation, a few words at most'),
      explanation: z
        .string()
        .describe('One plain sentence in the target language that explains the definition, faithful to it'),
    }),
  ),
});
const LANGUAGE_NAME: Record<string, string> = { ar: 'Modern Standard Arabic' };

/**
 * Glosses for terms a course material defines. Each must be in the target language, add nothing to
 * the material's definition, and avoid dashes and semicolons. A gloss that fails is dropped, and a
 * batch where most fail moves to the next route.
 */
export const glossTask: Task<GlossInput, { id: string; gloss: string; explanation: string }[]> = {
  name: 'language.gloss',
  promptVersion: 'gloss-v1',
  temperature: 0,
  needs: { skill: 'write', data: 'institution', lane: 'interactive', maxOutput: 4000, cache: 'none', attempts: 2 },
  language: i => i.language,
  build: i => ({
    system: [
      `You help a university student who studies in English and thinks in ${LANGUAGE_NAME[i.language] ?? i.language}.`,
      'For each term, give the standard translation of the term, then one plain sentence that explains its definition.',
      'Translate the definition you are given. Do not add facts, examples or claims that it does not state. Keep symbols, formulas and numbers exactly as written.',
      'Return every id you were given.',
      DATA_RULE,
      house(i.language),
    ].join('\n'),
    prompt: `<document>\n${i.terms.map(t => `<item id="${t.id}">\nTerm: ${escapeTags(t.term)}\nDefinition: ${escapeTags(t.definition)}\n</item>`).join('\n')}\n</document>`,
    schema: schemaOf(glossSchema),
  }),
  check: (r, i) => {
    const out = parsed(glossSchema, r.json)?.terms ?? [];
    const ok = out
      .map(t => ({ id: t.id, gloss: t.gloss.trim(), explanation: t.explanation.trim() }))
      .filter(
        t =>
          i.terms.some(x => x.id === t.id) &&
          t.gloss &&
          t.gloss.length <= 120 &&
          t.explanation.length <= 500 &&
          !/[—–;؛]/.test(t.gloss + t.explanation) &&
          detectLanguage(t.explanation) === i.language,
      );
    return ok.length * 2 >= i.terms.length ? ok : null;
  },
};
