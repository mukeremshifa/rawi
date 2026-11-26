import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { ReadDb, SocketDb } from '../../db/client';
import { itemResults, preferences, sections } from '../../db/schema';
import type { PolicySection } from '../../../shared/domain/agent';
import { localISO } from '../../../shared/domain/planner';
import { glossaryCounts } from '../language/glossary';

export interface LanguageSignal {
  count: number;
  sections: PolicySection[];
  glossaryReady: boolean;
}

/** Days of results the signals read. */
const WINDOW_DAYS = 14;

/**
 * Language signals per course, from marked answers: how often language support was used lately,
 * and the sections whose latest right answer used it with no right answer alone since. Only a
 * student with a first language set can record language support, so others have no signals.
 */
export async function languageSignals(
  db: ReadDb | SocketDb,
  workspaceId: string,
  timezone: string,
): Promise<Map<string, LanguageSignal>> {
  const [prefs] = await db
    .select({ values: preferences.values })
    .from(preferences)
    .where(eq(preferences.workspaceId, workspaceId));
  const language = prefs?.values.firstLanguage;
  if (!language || language === 'none') return new Map();
  const [rows, glossed] = await Promise.all([
    db
      .select({
        courseId: itemResults.courseId,
        materialId: itemResults.materialId,
        key: itemResults.sectionKey,
        score: itemResults.score,
        usedHint: itemResults.usedHint,
        languageSupport: itemResults.languageSupport,
        mode: itemResults.mode,
        at: itemResults.at,
        heading: sql<
          string | null
        >`(select s.heading from ${sections} s where s.workspace_id = ${itemResults.workspaceId} and s.material_id = ${itemResults.materialId} and s.key = ${itemResults.sectionKey} limit 1)`,
      })
      .from(itemResults)
      .where(
        and(
          eq(itemResults.workspaceId, workspaceId),
          gt(itemResults.at, new Date(Date.now() - WINDOW_DAYS * 86_400_000)),
        ),
      )
      .orderBy(desc(itemResults.at))
      .limit(1000),
    glossaryCounts(db, workspaceId, language),
  ]);
  const out = new Map<string, LanguageSignal>();
  const seen = new Set<string>();
  for (const r of rows) {
    const entry = out.get(r.courseId) ?? { count: 0, sections: [], glossaryReady: (glossed.get(r.courseId) ?? 0) > 0 };
    out.set(r.courseId, entry);
    if (r.languageSupport) entry.count++;
    if (!r.materialId || !r.key || r.mode === 'self-rated') continue;
    // Rows come newest first, so the first right answer seen for a section is its latest one.
    const section = `${r.materialId}:${r.key}`;
    if (seen.has(section) || r.score < 0.8) continue;
    seen.add(section);
    if (r.languageSupport && !r.usedHint)
      entry.sections.push({
        materialId: r.materialId,
        key: r.key,
        heading: r.heading || 'this section',
        on: localISO(r.at, timezone),
      });
  }
  for (const [id, e] of out) if (!e.count) out.delete(id);
  return out;
}
