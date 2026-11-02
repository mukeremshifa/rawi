import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { bankItems, itemResults, topicSections } from '../../db/schema';
import type { QuestionAttempt, ReviewDue } from '../../../shared/domain/types';
import { daysSince, isDue, sectionMastery, type SectionMastery } from '../../../shared/domain/mastery';
import { localISO } from '../../../shared/domain/planner';
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
 * Topics due for review: a topic is due when a section it introduces or covers is due under the
 * mastery ladder. A link to a whole material counts every section of it. The topic's days since
 * study is its most recently answered section, so working any part of it counts.
 */
export async function reviewsDue(db: Db, workspaceId: string, timezone?: string): Promise<ReviewDue[]> {
  const [rows, links] = await Promise.all([
    db.select({ materialId: itemResults.materialId, key: itemResults.sectionKey, score: itemResults.score, mode: itemResults.mode, usedHint: itemResults.usedHint, at: itemResults.at }).from(itemResults)
      .where(and(eq(itemResults.workspaceId, workspaceId), sql`${itemResults.at} > now() - interval '365 days'`)),
    db.select({ topicId: topicSections.topicId, courseId: topicSections.courseId, materialId: topicSections.materialId, key: topicSections.sectionKey, depth: topicSections.depth, removed: topicSections.removed }).from(topicSections)
      .where(eq(topicSections.workspaceId, workspaceId)),
  ]);
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) if (r.materialId && r.key) grouped.set(sectionOf(r.materialId, r.key), [...(grouped.get(sectionOf(r.materialId, r.key)) ?? []), r]);
  const mastery = [...grouped].map(([key, list]) => ({ key, m: sectionMastery(list, timezone) }));
  const today = localISO(new Date(), timezone);
  const hidden = new Set(links.filter(l => l.key === WHOLE && l.removed).map(l => `${l.materialId}:${l.topicId}`));
  const topics = new Map<string, { courseId: string; since: number; dueOn: string | null }>();
  for (const l of links) {
    if (l.removed || l.depth === 'mentions' || hidden.has(`${l.materialId}:${l.topicId}`)) continue;
    const linked = l.key === WHOLE ? mastery.filter(x => x.key.startsWith(`${l.materialId}:`)) : mastery.filter(x => x.key === sectionOf(l.materialId, l.key));
    for (const { m } of linked) {
      const since = daysSince(m, today);
      if (since === null) continue;
      const t = topics.get(l.topicId) ?? { courseId: l.courseId, since, dueOn: null };
      t.since = Math.min(t.since, since);
      if (isDue(m, today) && (!t.dueOn || m.dueOn! < t.dueOn)) t.dueOn = m.dueOn;
      topics.set(l.topicId, t);
    }
  }
  return [...topics].flatMap(([topicId, t]) => t.dueOn ? [{ courseId: t.courseId, topicId, daysSince: t.since, dueOn: t.dueOn }] : []).sort((a, b) => b.daysSince - a.daysSince);
}
