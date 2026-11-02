import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { bankItems, itemResults } from '../../db/schema';
import type { QuestionAttempt } from '../../../shared/domain/types';
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

export interface SectionState { materialId: string; key: string; attempts: number; misses: number; lastAt: string | null; recentMisses: { prompt: string; at: string }[] }

/**
 * What a student has shown on these sections: attempts, misses and when, from marked answers in
 * the last ninety days. Self-marked answers count as attempts but not as misses or mastery.
 */
export async function learnerState(db: Db, workspaceId: string, keys: { materialId: string; key: string }[]): Promise<SectionState[]> {
  if (!keys.length) return [];
  const pairs = sql.join(keys.map(k => sql`(${k.materialId}::uuid, ${k.key})`), sql`, `);
  const rows = await db.select({ materialId: itemResults.materialId, key: itemResults.sectionKey, score: itemResults.score, mode: itemResults.mode, at: itemResults.at, prompt: sql<string>`${bankItems.content}->>'prompt'` }).from(itemResults)
    .innerJoin(bankItems, eq(bankItems.id, itemResults.itemId))
    .where(and(eq(itemResults.workspaceId, workspaceId), sql`(${itemResults.materialId}, ${itemResults.sectionKey}) in (${pairs})`, sql`${itemResults.at} > now() - interval '90 days'`))
    .orderBy(desc(itemResults.at)).limit(500);
  return keys.map(k => {
    const own = rows.filter(r => r.materialId === k.materialId && r.key === k.key);
    const missed = own.filter(r => r.mode !== 'self-rated' && r.score < 1);
    return { ...k, attempts: own.length, misses: missed.length, lastAt: own[0]?.at.toISOString() ?? null, recentMisses: missed.slice(0, 3).map(r => ({ prompt: r.prompt, at: r.at.toISOString() })) };
  });
}
