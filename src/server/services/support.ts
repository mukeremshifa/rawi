import { isDated } from '../../shared/domain/types';
import { transaction } from '../db/client';
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import {
  courses,
  materials,
  learningSets,
  tutorSessions,
  learningAttempts,
  topics,
  preferences,
  reminderStates,
} from '../db/schema';
import { planningData } from './planning';
import { addDays } from '../../shared/domain/planner';
import { zonedParts } from '../../shared/contracts/planner';
import { operation } from './learning';
import { notFound } from '../errors';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
export async function search(db: ReadDb, workspaceId: string, query: string) {
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const found = [] as { title: string; category: string; to: string }[];
  const courseRows = await db
    .select({ id: courses.id, title: courses.name })
    .from(courses)
    .where(and(eq(courses.workspaceId, workspaceId), ilike(courses.name, pattern)))
    .orderBy(asc(courses.id))
    .limit(10);
  found.push(...courseRows.map(r => ({ title: r.title, category: 'Course', to: `/course/${r.id}` })));
  const materialRows = await db
    .select({ id: materials.id, title: materials.title })
    .from(materials)
    .where(and(eq(materials.workspaceId, workspaceId), ilike(materials.title, pattern)))
    .orderBy(asc(materials.id))
    .limit(10);
  found.push(...materialRows.map(r => ({ title: r.title, category: 'Material', to: `/materials/${r.id}` })));
  const sets = await db
    .select({ id: learningSets.id, title: learningSets.name })
    .from(learningSets)
    .where(
      and(
        eq(learningSets.workspaceId, workspaceId),
        eq(learningSets.purpose, 'practice'),
        ilike(learningSets.name, pattern),
      ),
    )
    .orderBy(asc(learningSets.id))
    .limit(10);
  found.push(...sets.map(r => ({ title: r.title, category: 'Practice set', to: `/sets/${r.id}` })));
  const sessions = await db
    .select({ id: tutorSessions.id, title: tutorSessions.title })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.workspaceId, workspaceId), ilike(tutorSessions.title, pattern)))
    .orderBy(asc(tutorSessions.id))
    .limit(10);
  found.push(...sessions.map(r => ({ title: r.title, category: 'Tutor session', to: `/tutor/${r.id}` })));
  const attempts = await db
    .select({ id: learningAttempts.id, title: sql<string>`${learningAttempts.snapshot}->>'title'` })
    .from(learningAttempts)
    .where(
      and(eq(learningAttempts.workspaceId, workspaceId), ilike(sql`${learningAttempts.snapshot}->>'title'`, pattern)),
    )
    .orderBy(asc(learningAttempts.id))
    .limit(10);
  found.push(...attempts.map(r => ({ title: r.title, category: 'Attempt', to: `/attempts/${r.id}` })));
  const topicRows = await db
    .select({ id: topics.id, courseId: topics.courseId, title: topics.title })
    .from(topics)
    .where(and(eq(topics.workspaceId, workspaceId), ilike(topics.title, pattern)))
    .orderBy(asc(topics.id))
    .limit(10);
  found.push(
    ...topicRows.map(r => ({ title: r.title, category: 'Topic', to: `/progress?course=${r.courseId}&topic=${r.id}` })),
  );
  return { results: found, limitPerCategory: 10 };
}
async function reminders(tx: Transaction, workspaceId: string) {
  const data = await planningData(tx, workspaceId);
  const today = zonedParts(new Date(), data.timezone).date;
  const [prefs] = await tx.select().from(preferences).where(eq(preferences.workspaceId, workspaceId));
  const settings = prefs!.values.reminders,
    last = addDays(today, settings.days);
  const active = new Set(data.courses.filter(c => !c.archived).map(c => c.id));
  const rows = [] as {
    key: string;
    title: string;
    date: string;
    category: string;
    to: string;
    status?: 'read' | 'dismissed';
  }[];
  if (settings.assessments)
    for (const a of data.assessments
      .filter(isDated)
      .filter(a => active.has(a.courseId) && a.date >= today && a.date <= last))
      rows.push({
        key: `assessment:${a.id}:${a.date}:${a.time ?? ''}`,
        title: a.title,
        date: a.date,
        category: 'Assessment',
        to: '/planner',
      });
  if (settings.study)
    for (const s of data.sessions.filter(
      s => active.has(s.courseId) && s.status === 'planned' && s.date >= today && s.date <= last,
    ))
      rows.push({
        key: `study:${s.id}:${s.date}:${s.startMinutes}`,
        title: s.title,
        date: s.date,
        category: 'Planned study',
        to: '/planner',
      });
  if (settings.review)
    for (const d of data.due.filter(d => active.has(d.courseId)))
      rows.push({
        key: `review:${d.topicId}:${d.dueOn}`,
        title: data.topics.find(t => t.id === d.topicId)?.title ?? 'Topic review',
        date: today,
        category: 'Due review',
        to: `/course/${d.courseId}/practice`,
      });
  const states = await tx.select().from(reminderStates).where(eq(reminderStates.workspaceId, workspaceId));
  return rows
    .map(r => ({ ...r, status: states.find(s => s.key === r.key)?.status }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
export async function notifications(db: SocketDb, workspaceId: string) {
  return transaction(
    db,
    async tx => ({ reminders: (await reminders(tx, workspaceId)).filter(r => r.status !== 'dismissed') }),
    { isolationLevel: 'repeatable read' },
  );
}
export async function markReminder(
  db: SocketDb,
  workspaceId: string,
  operationId: string,
  key: string,
  status: 'read' | 'dismissed',
) {
  return operation(db, workspaceId, operationId, { action: 'reminder', key, status }, async tx => {
    if (!(await reminders(tx, workspaceId)).some(r => r.key === key)) throw notFound();
    await tx
      .insert(reminderStates)
      .values({ workspaceId, key, status })
      .onConflictDoUpdate({
        target: [reminderStates.workspaceId, reminderStates.key],
        set: { status },
        setWhere: sql`${reminderStates.status} <> 'dismissed'`,
      });
    return { reminders: (await reminders(tx, workspaceId)).filter(r => r.status !== 'dismissed') };
  });
}
