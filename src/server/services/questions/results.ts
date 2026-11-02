import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { bankItems, itemResults, materials, sections, topicSections } from '../../db/schema';
import type { QuestionAttempt, ReviewDue, TopicMastery } from '../../../shared/domain/types';
import { isDue, sectionMastery, type SectionMastery } from '../../../shared/domain/mastery';
import { daysBetweenDates, localISO } from '../../../shared/domain/planner';
import { WHOLE } from '../outline/links';
import { SELF_MARKED } from '../../../shared/domain/marking';

/**
 * Results of marked answers and the learner state read from them. Code marked every one of them,
 * except flashcards and self-checks, which the student marked and which say so.
 */
type Db = ReadDb | SocketDb | Transaction;
type Run = { id: string; workspaceId: string; courseId: string; exam: unknown };

/**
 * Record one answer's result, replacing an earlier one for the same run and item. Skipped answers
 * are not results. `tutored` marks a question the tutor posed during a session.
 */
export async function recordResults(tx: Transaction, run: Run, answered: { itemId: string; result: QuestionAttempt }[], tutored = false) {
  const marked = answered.filter(a => a.result.outcome !== 'skipped' && a.result.marksAvailable > 0);
  if (!marked.length) return;
  const items = await tx.select({ id: bankItems.id, materialId: bankItems.materialId, sectionKey: bankItems.sectionKey, factIds: bankItems.factIds }).from(bankItems)
    .where(and(eq(bankItems.workspaceId, run.workspaceId), inArray(bankItems.id, marked.map(a => a.itemId))));
  const rows = marked.flatMap(a => {
    const item = items.find(i => i.id === a.itemId);
    if (!item) return [];
    const mode = SELF_MARKED.includes(a.result.format) ? 'self-rated' as const : run.exam ? 'exam' as const : tutored ? 'tutored' as const : 'practice' as const;
    return [{ id: crypto.randomUUID(), workspaceId: run.workspaceId, courseId: run.courseId, runId: run.id, itemId: item.id, materialId: item.materialId, sectionKey: item.sectionKey, factIds: item.factIds, format: a.result.format, mode, score: a.result.marksAwarded / a.result.marksAvailable, usedHint: a.result.usedHint }];
  });
  if (rows.length) await tx.insert(itemResults).values(rows).onConflictDoUpdate({ target: [itemResults.runId, itemResults.itemId], set: { score: sql`excluded.score`, usedHint: sql`excluded.used_hint`, at: new Date() } });
}

export interface SectionState { materialId: string; key: string; attempts: number; misses: number; lastAt: string | null; recentMisses: { prompt: string; at: string }[]; mastery: SectionMastery }

const sectionOf = (materialId: string, key: string) => `${materialId}:${key}`;

/**
 * What a student has shown on these sections. Attempts and misses count marked answers in the
 * last ninety days, and a miss is anything short of full marks. Mastery reads the last year.
 * Self-marked answers count as attempts but not as misses or mastery.
 */
export async function learnerState(db: Db, workspaceId: string, keys: { materialId: string; key: string }[], timezone?: string): Promise<SectionState[]> {
  if (!keys.length) return [];
  const pairs = sql.join(keys.map(k => sql`(${k.materialId}::uuid, ${k.key})`), sql`, `);
  const rows = await db.select({ materialId: itemResults.materialId, key: itemResults.sectionKey, score: itemResults.score, mode: itemResults.mode, usedHint: itemResults.usedHint, at: itemResults.at, prompt: sql<string>`${bankItems.content}->>'prompt'` }).from(itemResults)
    .innerJoin(bankItems, eq(bankItems.id, itemResults.itemId))
    .where(and(eq(itemResults.workspaceId, workspaceId), sql`(${itemResults.materialId}, ${itemResults.sectionKey}) in (${pairs})`, sql`${itemResults.at} > now() - interval '365 days'`))
    .orderBy(desc(itemResults.at)).limit(2000);
  const recent = Date.now() - 90 * 86_400_000;
  return keys.map(k => {
    const own = rows.filter(r => r.materialId === k.materialId && r.key === k.key);
    const counted = own.filter(r => r.at.getTime() > recent);
    const missed = counted.filter(r => r.mode !== 'self-rated' && r.score < 1);
    return { ...k, attempts: counted.length, misses: missed.length, lastAt: own[0]?.at.toISOString() ?? null, recentMisses: missed.slice(0, 3).map(r => ({ prompt: r.prompt, at: r.at.toISOString() })), mastery: sectionMastery(own, timezone) };
  });
}

/**
 * Mastery by topic, from its sections: those it introduces or covers, and every section of a
 * material linked whole. A topic is not checked until one of them has a marked answer, shaky when
 * one was missed on its last day, secure when every section answered is secure and at least half
 * of them have been answered, and learning otherwise. It is due when one of its sections is due,
 * and its days since study is its most recently answered section.
 */
export async function topicMastery(db: Db, workspaceId: string, timezone?: string): Promise<TopicMastery[]> {
  const [rows, links, current] = await Promise.all([
    db.select({ materialId: itemResults.materialId, key: itemResults.sectionKey, score: itemResults.score, mode: itemResults.mode, usedHint: itemResults.usedHint, at: itemResults.at }).from(itemResults)
      .where(and(eq(itemResults.workspaceId, workspaceId), sql`${itemResults.at} > now() - interval '365 days'`)),
    db.select({ topicId: topicSections.topicId, courseId: topicSections.courseId, materialId: topicSections.materialId, key: topicSections.sectionKey, depth: topicSections.depth, removed: topicSections.removed }).from(topicSections)
      .where(eq(topicSections.workspaceId, workspaceId)),
    db.select({ materialId: sections.materialId, key: sections.key }).from(sections).innerJoin(materials, and(eq(materials.id, sections.materialId), eq(materials.currentVersionId, sections.versionId)))
      .where(and(eq(sections.workspaceId, workspaceId), eq(materials.archived, false))),
  ]);
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) if (r.materialId && r.key) grouped.set(sectionOf(r.materialId, r.key), [...(grouped.get(sectionOf(r.materialId, r.key)) ?? []), r]);
  const mastery = new Map([...grouped].map(([key, list]) => [key, sectionMastery(list, timezone)]));
  const today = localISO(new Date(), timezone);
  const hidden = new Set(links.filter(l => l.key === WHOLE && l.removed).map(l => `${l.materialId}:${l.topicId}`));
  const byTopic = new Map<string, { courseId: string; keys: Set<string> }>();
  for (const l of links) {
    if (l.removed || l.depth === 'mentions' || hidden.has(`${l.materialId}:${l.topicId}`)) continue;
    const t = byTopic.get(l.topicId) ?? { courseId: l.courseId, keys: new Set<string>() };
    for (const key of l.key === WHOLE ? current.filter(c => c.materialId === l.materialId).map(c => sectionOf(c.materialId, c.key)) : [sectionOf(l.materialId, l.key)]) t.keys.add(key);
    byTopic.set(l.topicId, t);
  }
  return [...byTopic].map(([topicId, t]) => {
    const worked = [...t.keys].flatMap(k => { const m = mastery.get(k); return m && m.level !== 'not-checked' ? [m] : []; });
    const secure = worked.filter(m => m.level === 'secure').length, shaky = worked.filter(m => m.level === 'shaky').length;
    const due = worked.filter(m => isDue(m, today));
    const level: TopicMastery['level'] = !worked.length ? 'not-checked' : shaky ? 'shaky' : secure === worked.length && worked.length * 2 >= t.keys.size ? 'secure' : 'learning';
    const lastDay = worked.map(m => m.lastDay!).sort().at(-1) ?? null;
    return { courseId: t.courseId, topicId, level, sections: t.keys.size, answered: worked.length, secure, shaky, due: due.length, dueOn: due.map(m => m.dueOn!).sort()[0] ?? null, lastDay, daysSince: lastDay ? daysBetweenDates(lastDay, today) : null };
  });
}

/** Topics with a section due for review, longest untouched first. */
export const reviewsFrom = (topics: TopicMastery[]): ReviewDue[] =>
  topics.flatMap(t => t.dueOn && t.daysSince !== null ? [{ courseId: t.courseId, topicId: t.topicId, daysSince: t.daysSince, dueOn: t.dueOn }] : []).sort((a, b) => b.daysSince - a.daysSince);
