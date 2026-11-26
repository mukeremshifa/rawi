import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BackendBindings } from '../../config';
import type { SocketDb, Transaction } from '../../db/client';
import { bankItems, facts as factRows, itemResults, materials, sections as sectionRows } from '../../db/schema';
import { budget, run, type CallContext, type Task } from '../../ai/engine';
import { AiFailed } from '../../ai/engine';
import type { Language } from '../../ai/types';
import type { Difficulty, QuestionFormat } from '../../../shared/domain/types';
import { questionInput, type VersionedQuestion } from '../../../shared/contracts/learning';
import { blockMarkdown } from '../../../shared/domain/document-text';
import { promptKey } from '../../../shared/domain/prompt-key';
import { readNumber } from '../../../shared/domain/marking';
import { ACTIVITY_FORMATS } from '../../../shared/domain/question-selection';
import type { CourseSection } from '../knowledge/course';
import { liveLinks } from '../outline/links';
import { versionBlocks } from '../outline/sections';
import { allot, spreadFormats } from './allot';
import { buildAll, type Built, type Fact } from './build';
import { checkTemplate, variant } from './numeric';
import { compareTask, numericTask, selfCheckTask, solveTask, stemTask, type SectionInput } from './tasks';
import type { NumericTemplate } from './types';

/**
 * The per-student question bank. A draw takes unseen items first, then items the student missed
 * a day or more ago, and only then repeats. Code builds what it can from facts on the spot. What
 * only a model can write is generated for the shortfall alone, verified, and saved, and a bank
 * that ran short for a scope is topped up in the background for next time.
 */
type Item = typeof bankItems.$inferSelect;
type Scope = { workspaceId: string; courseId: string };
export interface Weighted {
  section: CourseSection;
  weight: number;
}
export interface Shortfall {
  sectionId: string;
  format: QuestionFormat;
  count: number;
}

/** Formats only a model can write, in the bank or on demand. Multiple choice is both. */
const MODEL: QuestionFormat[] = ['self-check', 'numeric'];
const RESURFACE_MS = 20 * 3600_000;
const SURE = 0.7;

/* ── What a section offers ───────────────────────────────────────────────── */

export interface SectionContext {
  section: CourseSection;
  hash: string;
  keyTerms: string[];
  language: Language;
  facts: Fact[];
  siblings: Fact[];
  topic: { id: string; title: string } | null;
}

/** Facts, hashes and topics for a set of sections, with sibling facts from the same materials. */
export async function contexts(db: SocketDb | Transaction, scope: Scope, list: CourseSection[]) {
  const ids = list.map(s => s.id),
    materialIds = [...new Set(list.map(s => s.materialId))];
  const [rows, all, links] = await Promise.all([
    ids.length
      ? db
          .select({ id: sectionRows.id, hash: sectionRows.contentHash })
          .from(sectionRows)
          .where(inArray(sectionRows.id, ids))
      : [],
    materialIds.length
      ? db
          .select({
            id: factRows.id,
            sectionId: factRows.sectionId,
            materialId: factRows.materialId,
            kind: factRows.kind,
            subject: factRows.subject,
            text: factRows.text,
            value: factRows.value,
            unit: factRows.unit,
            items: factRows.items,
            blockIds: factRows.blockIds,
            confidence: factRows.confidence,
          })
          .from(factRows)
          .innerJoin(
            materials,
            and(eq(materials.id, factRows.materialId), eq(materials.currentVersionId, factRows.versionId)),
          )
          .where(and(eq(factRows.workspaceId, scope.workspaceId), inArray(factRows.materialId, materialIds)))
      : [],
    liveLinks(db, scope),
  ]);
  const rank = { introduces: 0, covers: 1, mentions: 2 } as const;
  const out = new Map<string, SectionContext>();
  for (const s of list) {
    const topic = links.filter(l => l.section.id === s.id).sort((a, b) => rank[a.depth] - rank[b.depth])[0];
    out.set(s.id, {
      section: s,
      hash: rows.find(r => r.id === s.id)?.hash ?? '',
      keyTerms: s.keyTerms,
      language: s.language,
      facts: all.filter(f => f.sectionId === s.id),
      siblings: all.filter(f => f.sectionId !== s.id && f.materialId === s.materialId),
      topic: topic ? { id: topic.topicId, title: '' } : null,
    });
  }
  return out;
}

/* ── Saving items ────────────────────────────────────────────────────────── */

function question(
  ctx: SectionContext,
  b: Pick<
    Built,
    | 'format'
    | 'difficulty'
    | 'prompt'
    | 'explanation'
    | 'answer'
    | 'options'
    | 'correctIndices'
    | 'pairs'
    | 'sequence'
    | 'template'
    | 'blanks'
    | 'blockIds'
    | 'factIds'
  > & { numeric?: VersionedQuestion['numeric'] },
  origin: 'built' | 'generated',
  model?: string,
): VersionedQuestion {
  const id = crypto.randomUUID();
  const content = questionInput.parse({
    format: b.format,
    difficulty: b.difficulty,
    marks: 1,
    prompt: b.prompt.trim(),
    explanation: b.explanation.trim(),
    answer: b.answer,
    options: b.options,
    correctIndices: b.correctIndices,
    pairs: b.pairs,
    sequence: b.sequence,
    template: b.template,
    blanks: b.blanks,
    numeric: b.numeric,
    topicId: ctx.topic?.id,
    source: {
      materialId: ctx.section.materialId,
      versionId: ctx.section.versionId,
      blockIds: b.blockIds.length ? b.blockIds : ctx.section.blockIds.slice(0, 1),
    },
  });
  return {
    ...content,
    id,
    courseId: '',
    origin,
    provenance: {
      kind: origin,
      ...(model ? { model } : {}),
      generatedAt: new Date().toISOString(),
      materialIds: [ctx.section.materialId],
      factIds: b.factIds,
    },
  };
}

function row(
  scope: Scope,
  ctx: SectionContext,
  content: VersionedQuestion,
  extra: Partial<Item> = {},
): typeof bankItems.$inferInsert {
  return {
    id: content.id,
    ...scope,
    content: { ...content, courseId: scope.courseId },
    materialId: ctx.section.materialId,
    sectionKey: ctx.section.key,
    contentHash: ctx.hash,
    factIds: content.provenance?.factIds ?? [],
    format: content.format,
    difficulty: content.difficulty,
    origin: content.origin,
    ...extra,
  };
}

/**
 * Build every question code can make for these sections in the formats asked for, and save the
 * ones the bank does not hold yet. Code only, so it runs inside the request. A built multiple
 * choice whose options code would no longer choose, such as one with a near synonym of the key
 * among them, is retired.
 */
export async function ensureBuilt(tx: Transaction, scope: Scope, list: SectionContext[], formats: QuestionFormat[]) {
  const codeFormats = formats.filter(f => !MODEL.includes(f));
  if (!codeFormats.length || !list.length) return 0;
  const existing = await tx
    .select({
      id: bankItems.id,
      materialId: bankItems.materialId,
      key: bankItems.sectionKey,
      format: bankItems.format,
      state: bankItems.state,
      prompt: sql<string>`${bankItems.content}->>'prompt'`,
      template: sql<string | null>`${bankItems.content}->>'template'`,
      options: sql<string[] | null>`${bankItems.content}->'options'`,
      hash: bankItems.contentHash,
    })
    .from(bankItems)
    .where(
      and(
        eq(bankItems.workspaceId, scope.workspaceId),
        inArray(bankItems.materialId, [...new Set(list.map(c => c.section.materialId))]),
        eq(bankItems.origin, 'built'),
      ),
    );
  // The options belong to a multiple choice's identity, so a changed set of options is a new item.
  const keyOf = (e: {
    materialId: string | null;
    key: string | null;
    hash: string | null;
    format: string;
    prompt: string;
    template?: string | null;
    options?: string[] | null;
  }) =>
    `${e.materialId}:${e.key}:${e.hash}:${e.format}:${promptKey(`${e.prompt} ${e.template ?? ''}`)}${e.format === 'multiple-choice' ? `:${(e.options ?? []).map(promptKey).join('|')}` : ''}`;
  const seen = new Set(existing.map(keyOf));
  const byKey = new Map(existing.map(e => [keyOf(e), e]));
  const rows: (typeof bankItems.$inferInsert)[] = [];
  const recased: { id: string; patch: Pick<Built, 'prompt' | 'explanation' | 'template'> }[] = [];
  const built = new Set<string>();
  for (const ctx of list) {
    for (const b of buildAll(codeFormats, ctx.facts, ctx.siblings, ctx.keyTerms)) {
      const key = keyOf({ materialId: ctx.section.materialId, key: ctx.section.key, hash: ctx.hash, ...b });
      built.add(key);
      // The same item worded in other letter case, such as "aNNs" before acronyms kept theirs, is
      // corrected in place so its results stay with it.
      const held = byKey.get(key);
      if (held && (held.prompt !== b.prompt.trim() || (held.template ?? undefined) !== b.template?.trim()))
        recased.push({
          id: held.id,
          patch: {
            prompt: b.prompt.trim(),
            explanation: b.explanation.trim(),
            ...(b.template ? { template: b.template } : {}),
          },
        });
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row(scope, ctx, question(ctx, b, 'built'), { verification: { rules: ['built_from_facts'] } }));
    }
  }
  const current = new Set(list.map(c => `${c.section.materialId}:${c.section.key}:${c.hash}`));
  const stale = codeFormats.includes('multiple-choice')
    ? existing.filter(
        e =>
          e.format === 'multiple-choice' &&
          e.state === 'active' &&
          current.has(`${e.materialId}:${e.key}:${e.hash}`) &&
          !built.has(keyOf(e)),
      )
    : [];
  if (stale.length)
    await tx
      .update(bankItems)
      .set({ state: 'retired' })
      .where(
        inArray(
          bankItems.id,
          stale.map(e => e.id),
        ),
      );
  for (const r of recased)
    await tx
      .update(bankItems)
      .set({ content: sql`${bankItems.content} || ${JSON.stringify(r.patch)}::jsonb` })
      .where(eq(bankItems.id, r.id));
  for (let i = 0; i < rows.length; i += 200) await tx.insert(bankItems).values(rows.slice(i, i + 200));
  return rows.length;
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/** Items a section could give now in a format, ranked: unseen, missed long enough ago, then the rest oldest first. */
async function candidates(db: SocketDb | Transaction, scope: Scope, list: SectionContext[], formats: QuestionFormat[]) {
  if (!list.length) return [];
  const rows = await db
    .select({ item: bankItems, lastScore: sql<number | null>`r.score`, lastAt: sql<Date | null>`r.at` })
    .from(bankItems)
    .leftJoin(
      sql`lateral (select score, at from ${itemResults} where item_id = bank_items.id order by at desc limit 1) r`,
      sql`true`,
    )
    .where(
      and(
        eq(bankItems.workspaceId, scope.workspaceId),
        inArray(bankItems.materialId, [...new Set(list.map(c => c.section.materialId))]),
        inArray(bankItems.format, formats),
        inArray(bankItems.state, ['active', 'template']),
        sql`${bankItems.templateId} is null`,
      ),
    );
  const now = Date.now();
  return rows
    .filter(r =>
      list.some(
        c =>
          c.section.materialId === r.item.materialId &&
          c.section.key === r.item.sectionKey &&
          c.hash === r.item.contentHash,
      ),
    )
    .map(r => {
      const at = r.lastAt ? new Date(r.lastAt).getTime() : null;
      const rank =
        at === null ? 0 : (r.lastScore ?? 0) < 1 && now - at > RESURFACE_MS ? 1 : (r.lastScore ?? 0) >= 1 ? 2 : 3;
      return { item: r.item, rank, at: at ?? 0 };
    })
    .sort((a, b) => a.rank - b.rank || a.at - b.at);
}

/** A fresh variant of a numeric template, saved as its own item so its answer is fixed for this run. */
function numericVariant(scope: Scope, ctx: SectionContext, template: Item) {
  const t = template.template!;
  const v = variant(t);
  if (!v) return null;
  const base = template.content;
  const explanation = t.explanation.replace(/\{(\w+)\}/g, (_m, n: string) =>
    n in v.values ? String(v.values[n]) : `{${n}}`,
  );
  const content: VersionedQuestion = {
    ...base,
    id: crypto.randomUUID(),
    prompt: v.stem,
    explanation: `${explanation} The answer is ${v.answer.toLocaleString('en-GB')}${t.unit ? ` ${t.unit}` : ''}.`,
    numeric: { value: v.answer, tolerance: v.tolerance, ...(t.unit ? { unit: t.unit } : {}) },
  };
  return row(scope, ctx, content, {
    templateId: template.id,
    state: 'active',
    origin: 'generated',
    verification: template.verification,
  });
}

export interface Draw {
  items: VersionedQuestion[];
  shortfall: Shortfall[];
}

/**
 * Choose items for a scope: allot the count across sections by weight, spread the formats, and
 * fill each slot from the bank, building by code where it can. Slots only a model can fill and
 * the bank cannot are returned as the shortfall. Runs in the caller's transaction, code only.
 */
export async function draw(
  tx: Transaction,
  scope: Scope,
  weighted: Weighted[],
  formats: QuestionFormat[],
  count: number,
  difficulty: Difficulty | 'mixed',
  exclude: string[] = [],
): Promise<Draw> {
  const plan = allot(
    weighted.map(w => ({ section: w.section, weight: w.weight })),
    count,
  );
  const ctxs = await contexts(
    tx,
    scope,
    plan.map(p => p.section),
  );
  await ensureBuilt(tx, scope, [...ctxs.values()], formats);
  const pool = await candidates(tx, scope, [...ctxs.values()], formats);
  const used = new Set(exclude),
    items: VersionedQuestion[] = [],
    fresh: (typeof bankItems.$inferInsert)[] = [];
  const short = new Map<string, Shortfall>();
  const fits = (i: Item) => difficulty === 'mixed' || i.difficulty === difficulty;
  const kinds = Object.values(ACTIVITY_FORMATS)
    .map(k => k.filter(f => formats.includes(f)))
    .filter(k => k.length);
  plan.forEach((p, n) => {
    const ctx = ctxs.get(p.section.id)!;
    // A model can write self-checks and multiple choice for any section, and numbers where the
    // section states some. Code formats need facts of their kind.
    const writable = (f: QuestionFormat) =>
      f === 'self-check' ||
      f === 'multiple-choice' ||
      (f === 'numeric' && ctx.facts.some(x => x.kind === 'number' || x.kind === 'formula'));
    const take = (format: QuestionFormat, unseen: boolean, anySection = false) => {
      const hit = pool.find(
        c =>
          !used.has(c.item.id) &&
          c.item.format === format &&
          (anySection
            ? c.item.state !== 'template'
            : c.item.sectionKey === ctx.section.key && c.item.materialId === ctx.section.materialId) &&
          fits(c.item) &&
          (!unseen || c.rank <= 1),
      );
      if (!hit) return false;
      used.add(hit.item.id);
      if (hit.item.state === 'template') {
        const v = numericVariant(scope, ctx, hit.item);
        if (!v) return false;
        fresh.push(v);
        items.push(v.content as VersionedQuestion);
      } else items.push(hit.item.content);
      return true;
    };
    for (const want of spreadFormats(kinds, p.count, n)) {
      // Unseen or due for another look, in the format asked for.
      if (take(want, true)) continue;
      // Nothing unseen, but a model can write it: written for the shortfall.
      if (writable(want)) {
        const key = `${ctx.section.id}:${want}`;
        const s = short.get(key) ?? { sectionId: ctx.section.id, format: want, count: 0 };
        s.count++;
        short.set(key, s);
        continue;
      }
      // A code format the section cannot support comes from another section in the scope first,
      // then gives way to another format asked for, and one with nothing unseen left repeats the
      // oldest item seen.
      if (take(want, true, true)) continue;
      const other = formats.filter(f => f !== want);
      if (other.some(f => take(f, true))) continue;
      const alt = other.find(writable);
      if (alt) {
        const key = `${ctx.section.id}:${alt}`;
        const s = short.get(key) ?? { sectionId: ctx.section.id, format: alt, count: 0 };
        s.count++;
        short.set(key, s);
        continue;
      }
      [want, ...other].some(f => take(f, false));
    }
  });
  if (fresh.length) await tx.insert(bankItems).values(fresh);
  return { items, shortfall: [...short.values()] };
}

/* ── Writing the shortfall ───────────────────────────────────────────────── */

const MAX_ROUNDS = 2;
const MENTIONS_SOURCE = /\b(the|this) (passage|text|section|excerpt)\b/i;

interface Prepared {
  ctx: SectionContext;
  input: SectionInput;
  blocks: Map<string, string>;
  facts: Map<string, Fact>;
}

async function prepare(db: SocketDb, scope: Scope, ctxs: SectionContext[]) {
  const byVersion = new Map<string, Awaited<ReturnType<typeof versionBlocks>>>();
  for (const v of new Set(ctxs.map(c => c.section.versionId)))
    byVersion.set(v, await versionBlocks(db, scope.workspaceId, v));
  let b = 0,
    f = 0;
  return ctxs.map((ctx, i): Prepared => {
    const list = byVersion.get(ctx.section.versionId)!;
    const blocks = new Map<string, string>(),
      keyed = new Map<string, Fact>();
    const input: SectionInput = {
      key: `s${i}`,
      heading: ctx.section.path.join(' / ') || ctx.section.title,
      blocks: ctx.section.blockIds
        .flatMap(id => {
          const block = list.find(x => x.id === id);
          const text = block && block.type !== 'heading' && !block.flags?.uncertain ? blockMarkdown(block).trim() : '';
          if (!text) return [];
          const key = `b${b++}`;
          blocks.set(key, id);
          return [{ key, text: text.slice(0, 4000) }];
        })
        .slice(0, 30),
      facts: ctx.facts
        .filter(x => x.confidence >= SURE)
        .slice(0, 12)
        .map(x => {
          const key = `f${f++}`;
          keyed.set(key, x);
          return {
            key,
            kind: x.kind,
            text: x.kind === 'steps' ? `${x.subject}: ${(x.items ?? []).join(', ')}` : `${x.subject}: ${x.text}`,
          };
        }),
    };
    return { ctx, input, blocks, facts: keyed };
  });
}
const sourceText = (p: Prepared) => p.input.blocks.map(b => b.text).join('\n\n');

export interface Generated {
  items: (typeof bankItems.$inferInsert)[];
  written: number;
  rejected: Record<string, number>;
}

/**
 * Write and verify items for a shortfall, one small batch per format, with one repair round for
 * what failed. Nothing that fails verification is saved. Returns the saved rows, counted.
 */
export async function generate(
  env: BackendBindings,
  ctx: CallContext,
  scope: Scope,
  shortfall: Shortfall[],
  lane: 'interactive' | 'background' = 'interactive',
  onSaved?: (rows: (typeof bankItems.$inferInsert)[]) => Promise<void>,
): Promise<Generated> {
  const { db } = ctx;
  const sectionIds = [...new Set(shortfall.map(s => s.sectionId))];
  const list = await db.select().from(sectionRows).where(inArray(sectionRows.id, sectionIds));
  const titles = new Map(
    (
      await db
        .select({ id: materials.id, title: materials.title })
        .from(materials)
        .where(inArray(materials.id, [...new Set(list.map(s => s.materialId))]))
    ).map(m => [m.id, m.title]),
  );
  const courseSections = list.map(
    s => ({ ...s, title: titles.get(s.materialId) ?? '', added: new Date() }) as unknown as CourseSection,
  );
  const ctxMap = await contexts(db, scope, courseSections);
  const out: Generated = { items: [], written: 0, rejected: {} };
  const reject = (why: string) => {
    out.rejected[why] = (out.rejected[why] ?? 0) + 1;
  };
  const on = <I, O>(task: Task<I, O>): Task<I, O> =>
    lane === 'interactive' ? task : { ...task, needs: { ...task.needs, lane } };
  const save = async (rows: (typeof bankItems.$inferInsert)[]) => {
    if (!rows.length) return;
    await db.insert(bankItems).values(rows);
    out.items.push(...rows);
    await onSaved?.(rows);
  };
  for (const format of [...new Set(shortfall.map(s => s.format))]) {
    const wanted = shortfall.filter(s => s.format === format);
    const prepared = await prepare(db, scope, wanted.map(w => ctxMap.get(w.sectionId)!).filter(Boolean));
    if (!prepared.length) continue;
    const language = prepared[0]!.ctx.language;
    const title = prepared[0]!.ctx.section.title;
    let need = wanted.reduce((n, w) => n + w.count, 0);
    for (let round = 0; round < MAX_ROUNDS && need > 0; round++) {
      try {
        if (format === 'multiple-choice')
          need -= await writeChoices(env, ctx, scope, prepared, need, language, title, on, save, reject, n => {
            out.written += n;
          });
        else if (format === 'numeric')
          need -= await writeNumeric(env, ctx, scope, prepared, need, language, title, on, save, reject, n => {
            out.written += n;
          });
        else if (format === 'self-check')
          need -= await writeSelfChecks(env, ctx, scope, prepared, need, language, title, on, save, reject, n => {
            out.written += n;
          });
      } catch (error) {
        // A failed or uncertain call ends this format's writing. What was saved stays.
        if (error instanceof AiFailed) {
          reject(error.code);
          break;
        }
        throw error;
      }
    }
  }
  return out;
}

type On = <I, O>(task: Task<I, O>) => Task<I, O>;
type Save = (rows: (typeof bankItems.$inferInsert)[]) => Promise<void>;

/**
 * Multiple choice for facts code cannot turn into a question, written by a model with three
 * wrong answers of the same kind. A second reader must pick exactly the key from the options, and
 * may rule out no more than one wrong answer without the material.
 */
async function writeChoices(
  env: BackendBindings,
  ctx: CallContext,
  scope: Scope,
  prepared: Prepared[],
  need: number,
  language: Language,
  title: string,
  on: On,
  save: Save,
  reject: (why: string) => void,
  written: (n: number) => void,
) {
  const factful = prepared.filter(p => p.input.facts.length);
  if (!factful.length) {
    reject('no_facts');
    return need;
  }
  // A few more than needed, since some fail their check.
  const served = await run(env, ctx, on(stemTask), {
    language,
    materialTitle: title,
    sections: factful.map(p => p.input),
    count: Math.min(12, need + 2),
  });
  written(served.value.items.length);
  type Candidate = {
    p: Prepared;
    stem: (typeof served.value.items)[number];
    options: string[];
    index: number;
    id: string;
  };
  const candidates: Candidate[] = [];
  for (const [n, stem] of served.value.items.entries()) {
    const p = factful.find(x => x.facts.has(stem.fact));
    if (!p) {
      reject('unknown_fact');
      continue;
    }
    const answer = stem.answer.trim();
    if (stem.stem.trim().length < 8 || MENTIONS_SOURCE.test(stem.stem)) {
      reject('stem');
      continue;
    }
    if (answer.length > 12 && promptKey(stem.stem).includes(promptKey(answer))) {
      reject('answer_in_stem');
      continue;
    }
    const pool = stem.distractors.map(d => d.trim()).filter(d => !/(all|none|both) of the above/i.test(d));
    const distractors = [
      ...new Map(pool.filter(a => a && promptKey(a) !== promptKey(answer)).map(a => [promptKey(a), a])).values(),
    ].slice(0, 3);
    if (distractors.length < 3) {
      reject('no_distractors');
      continue;
    }
    // The key must not stand out by length.
    if (distractors.every(d => answer.length > d.length * 2)) {
      reject('key_longest');
      continue;
    }
    const at = n % 4,
      options = [...distractors.slice(0, at), answer, ...distractors.slice(at)];
    candidates.push({ p, stem, options, index: at, id: `q${n}` });
  }
  if (!candidates.length) return 0;
  const solved = await run(env, ctx, on(solveTask), {
    language,
    items: candidates.map(c => ({ id: c.id, question: c.stem.stem, options: c.options, source: sourceText(c.p) })),
  });
  const accepted: (typeof bankItems.$inferInsert)[] = [];
  for (const c of candidates) {
    const v = solved.value.verdicts.find(x => x.id === c.id);
    if (!v) {
      reject('unchecked');
      continue;
    }
    if (!v.answerable) {
      reject('unanswerable');
      continue;
    }
    if (v.ambiguity.trim() || v.correctOptions.length !== 1) {
      reject('ambiguous');
      continue;
    }
    if (v.correctOptions[0] !== c.index + 1) {
      reject('key_disagrees');
      continue;
    }
    // Wrong answers a student can rule out without the material make the question a giveaway.
    if (new Set(v.weakOptions.filter(n => n !== c.index + 1 && n >= 1 && n <= 4)).size >= 2) {
      reject('weak_distractors');
      continue;
    }
    if (accepted.length >= need) break;
    const fact = c.p.facts.get(c.stem.fact)!;
    const content = question(
      c.p.ctx,
      {
        format: 'multiple-choice',
        difficulty: c.stem.difficulty,
        prompt: c.stem.stem,
        explanation: c.stem.explanation,
        answer: c.stem.answer.trim(),
        options: c.options,
        correctIndices: [c.index],
        blockIds: fact.blockIds,
        factIds: [fact.id],
      },
      'generated',
      served.route.model,
    );
    accepted.push(
      row(scope, c.p.ctx, content, {
        verification: {
          rules: ['stem', 'distractors'],
          solver: { route: solved.route.id, agreed: true, reason: v.solution.slice(0, 300) },
          answerType: c.stem.answerType,
        },
      }),
    );
  }
  await save(accepted);
  return accepted.length;
}

/**
 * Numeric templates from a model, checked by code for a sane expression, then one variant solved
 * by a second reader from the source. The template is kept, and each draw computes a new variant.
 */
async function writeNumeric(
  env: BackendBindings,
  ctx: CallContext,
  scope: Scope,
  prepared: Prepared[],
  need: number,
  language: Language,
  title: string,
  on: On,
  save: Save,
  reject: (why: string) => void,
  written: (n: number) => void,
) {
  const numeric = prepared.filter(p => [...p.facts.values()].some(f => f.kind === 'formula' || f.kind === 'number'));
  if (!numeric.length) {
    reject('no_numbers');
    return need;
  }
  const served = await run(env, ctx, on(numericTask), {
    language,
    materialTitle: title,
    sections: numeric.map(p => p.input),
    count: Math.min(4, need),
  });
  written(served.value.templates.length);
  const candidates: {
    p: Prepared;
    t: NumericTemplate;
    factIds: string[];
    blockIds: string[];
    v: NonNullable<ReturnType<typeof variant>>;
    id: string;
  }[] = [];
  for (const [n, raw] of served.value.templates.entries()) {
    const p = numeric.find(x => raw.facts.some(k => x.facts.has(k)));
    if (!p) {
      reject('unknown_fact');
      continue;
    }
    const t: NumericTemplate = {
      stem: raw.stem,
      params: raw.params,
      expression: raw.expression,
      unit: raw.unit?.trim() || undefined,
      decimals: raw.decimals,
      explanation: raw.explanation,
    };
    const problems = checkTemplate(t);
    if (problems.length) {
      reject(problems[0]!);
      continue;
    }
    const v = variant(t);
    if (!v) {
      reject('not_finite');
      continue;
    }
    const used = raw.facts.flatMap(k => p.facts.get(k) ?? []);
    candidates.push({
      p,
      t,
      factIds: used.map(f => f.id),
      blockIds: [...new Set(used.flatMap(f => f.blockIds))],
      v,
      id: `t${n}`,
    });
  }
  if (!candidates.length) return 0;
  const solved = await run(env, ctx, on(solveTask), {
    language,
    items: candidates.map(c => ({ id: c.id, question: c.v.stem, source: sourceText(c.p) })),
  });
  const accepted: (typeof bankItems.$inferInsert)[] = [];
  for (const c of candidates) {
    const v = solved.value.verdicts.find(x => x.id === c.id);
    // Every number the second reader wrote, since a worked solution names its inputs too.
    const got = v
      ? (v.solution.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map(readNumber).filter((n): n is number => n !== null)
      : [];
    if (!v || !v.answerable || !got.length) {
      reject('unchecked');
      continue;
    }
    // One of them must agree with the computed answer within a hundredth.
    if (!got.some(n => Math.abs(n - c.v.answer) <= Math.max(c.v.tolerance, Math.abs(c.v.answer) * 0.01))) {
      reject('answer_disagrees');
      continue;
    }
    const content = question(
      c.p.ctx,
      {
        format: 'numeric',
        difficulty: 'reasoning',
        prompt: c.v.stem,
        explanation: c.t.explanation,
        blockIds: c.blockIds,
        factIds: c.factIds,
        numeric: { value: c.v.answer, tolerance: c.v.tolerance, ...(c.t.unit ? { unit: c.t.unit } : {}) },
      },
      'generated',
      served.route.model,
    );
    accepted.push(
      row(scope, c.p.ctx, content, {
        state: 'template',
        template: c.t,
        verification: {
          rules: ['template'],
          solver: { route: solved.route.id, agreed: true, reason: v.solution.slice(0, 200) },
        },
      }),
    );
  }
  await save(accepted);
  // Each saved template stands for one question now. Its variants come at draw time.
  return accepted.length;
}

/** Self-check prompts with model answers, solved independently from the source and compared. */
async function writeSelfChecks(
  env: BackendBindings,
  ctx: CallContext,
  scope: Scope,
  prepared: Prepared[],
  need: number,
  language: Language,
  title: string,
  on: On,
  save: Save,
  reject: (why: string) => void,
  written: (n: number) => void,
) {
  const served = await run(env, ctx, on(selfCheckTask), {
    language,
    materialTitle: title,
    sections: prepared.map(p => p.input),
    count: Math.min(6, need + 1),
  });
  written(served.value.items.length);
  const candidates = served.value.items.flatMap((item, n) => {
    // A writer sometimes names a section by its heading. That still says which one it meant, and so does there being only one.
    const named = item.section.trim().toLowerCase();
    const p =
      prepared.find(x => x.input.key === item.section) ??
      prepared.find(x => x.input.heading.trim().toLowerCase() === named) ??
      (prepared.length === 1 ? prepared[0] : undefined);
    if (!p) {
      reject('unknown_section');
      return [];
    }
    if (item.prompt.trim().length < 12 || MENTIONS_SOURCE.test(item.prompt) || item.answer.trim().length < 40) {
      reject('prompt');
      return [];
    }
    return [{ p, item, id: `c${n}` }];
  });
  if (!candidates.length) return 0;
  const solved = await run(env, ctx, on(solveTask), {
    language,
    items: candidates.map(c => ({ id: c.id, question: c.item.prompt, source: sourceText(c.p) })),
  });
  const answerable = candidates.filter(c => {
    const v = solved.value.verdicts.find(x => x.id === c.id);
    if (!v?.answerable || v.ambiguity.trim()) {
      reject(v ? 'unanswerable' : 'unchecked');
      return false;
    }
    return true;
  });
  if (!answerable.length) return 0;
  const compared = await run(env, ctx, on(compareTask), {
    language,
    items: answerable.map(c => ({
      id: c.id,
      question: c.item.prompt,
      proposed: c.item.answer,
      solution: solved.value.verdicts.find(x => x.id === c.id)!.solution,
      source: sourceText(c.p),
    })),
  });
  const accepted: (typeof bankItems.$inferInsert)[] = [];
  for (const c of answerable) {
    const m = compared.value.verdicts.find(x => x.id === c.id);
    if (!m?.matches) {
      reject('answer_disagrees');
      continue;
    }
    if (accepted.length >= need) break;
    const used = c.item.facts.flatMap(k => c.p.facts.get(k) ?? []);
    const content = question(
      c.p.ctx,
      {
        format: 'self-check',
        difficulty: c.item.difficulty,
        prompt: c.item.prompt,
        explanation: 'Compare your answer with the model answer, then mark it yourself.',
        answer: c.item.answer,
        blockIds: [...new Set(used.flatMap(f => f.blockIds))],
        factIds: used.map(f => f.id),
      },
      'generated',
      served.route.model,
    );
    accepted.push(
      row(scope, c.p.ctx, content, {
        verification: {
          rules: ['prompt'],
          solver: { route: compared.route.id, agreed: true, reason: m.reason.slice(0, 300) },
        },
      }),
    );
  }
  await save(accepted);
  return accepted.length;
}

/** For the generation budget of one draw: a few calls, a few cents, two minutes. */
export const drawBudget = () => budget(10, 60_000, 120);

export { MODEL as MODEL_FORMATS };
