import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Attempt, StudyMaterial, StudyTopic } from '../../shared/domain/types';
import { planWeek, replacedByPlan, addDays } from '../../shared/domain/planner';
import { deriveAllEvidence, recurringMistakes, buildPlan } from '../../shared/domain/progress';
import { reviewsFrom, topicMasteryFrom, topicMasteryReads } from './questions/results';
import { reads, type Rows, type Select } from '../db/reads';
import { materialTopicsFrom, materialTopicsReads } from './outline/links';
import {
  zonedParts,
  type plannerWrite,
  type scheduleWrite,
  type assessmentWrite,
  type proposalInput,
  type checkInInput,
} from '../../shared/contracts/planner';
import {
  plannerState,
  plannedSessions,
  assessments,
  checkIns,
  planProposals,
  courses,
  topics,
  learningAttempts,
  learningRuns,
  materials,
  materialVersions,
  bankItems,
  preferences,
  tutorSessions,
} from '../db/schema';
import { operation } from './learning';
import { hash, validateTopics } from './materials';
import { usableStatus } from '../../shared/contracts/document';
import { getCourse } from './workspace';
import { isDated } from '../../shared/domain/types';
import { conflict, notFound, ApiError } from '../errors';
import type { ReadDb, SocketDb, Transaction } from '../db/client';

type Db = ReadDb | SocketDb | Transaction;

/** The planner before anything is saved. Reads use it without writing a row. */
const NEW_PLANNER = { revision: 1, availability: { windows: [], exceptions: [], sessionMinutes: 30 } };
export async function ensurePlanner(tx: Transaction, workspaceId: string) {
  await tx.insert(plannerState).values({ workspaceId, availability: NEW_PLANNER.availability }).onConflictDoNothing();
  const [row] = await tx.select().from(plannerState).where(eq(plannerState.workspaceId, workspaceId));
  return row!;
}
export async function bumpPlanner(tx: Transaction, workspaceId: string) {
  await ensurePlanner(tx, workspaceId);
  await tx
    .update(plannerState)
    .set({ revision: sql`${plannerState.revision} + 1` })
    .where(eq(plannerState.workspaceId, workspaceId));
}
/** The reads behind the learning record: attempts, and the current topic of every question in them. */
function learningReads(db: Db, workspaceId: string) {
  return {
    attempts: db
      .select({ snapshot: learningAttempts.snapshot, setId: learningAttempts.setId })
      .from(learningAttempts)
      .where(eq(learningAttempts.workspaceId, workspaceId)),
    // A question's topic is its current one, so a merged or corrected topic carries its history.
    askedTopics: db
      .select({ id: bankItems.id, topicId: sql<string | null>`${bankItems.content}->>'topicId'` })
      .from(bankItems)
      .where(
        and(
          eq(bankItems.workspaceId, workspaceId),
          sql`${bankItems.id} in (select (jsonb_array_elements(${learningAttempts.snapshot}->'questions')->'question'->>'id')::uuid from ${learningAttempts} where ${learningAttempts.workspaceId} = ${workspaceId})`,
        ),
      ),
  };
}
function learningFrom({ attempts: original, askedTopics }: Rows<ReturnType<typeof learningReads>>) {
  const topicOf = new Map(askedTopics.map(q => [q.id, q.topicId ?? undefined]));
  const current = original
    .map(r => r.snapshot)
    .map(a => ({
      ...a,
      questions: a.questions.map(q =>
        topicOf.has(q.question.id)
          ? {
              question: { ...q.question, topicId: topicOf.get(q.question.id) },
              result: { ...q.result, topicId: topicOf.get(q.question.id) },
            }
          : q,
      ),
    }));
  const rows = original.map((r, i) => ({ ...r, snapshot: current[i]! }));
  const attempts: Attempt[] = rows.map(({ snapshot: a, setId }) => ({
    id: a.id,
    courseId: a.courseId,
    kind: a.exam ? 'exam' : 'practice',
    mode: a.exam
      ? 'exam'
      : a.questions.every(q => q.question.format === 'flashcard' || q.question.format === 'self-check')
        ? 'self-rated'
        : 'practice',
    title: a.title,
    topicIds: [...new Set(a.questions.flatMap(q => q.question.topicId ?? []))],
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    questions: a.questions.map(q => q.result),
    marksAwarded: a.marksAwarded,
    marksAvailable: a.marksAvailable,
    assistanceRecord: 'tracked',
    practiceSetId: a.exam ? undefined : setId,
    examConfigSnapshot: a.exam?.configSnapshot,
    finish: a.finish,
    plannedSessionId: a.plannedSessionId,
    remediatesAttemptId: a.remediatesAttemptId,
  }));
  return { attempts, snapshots: rows.map(r => r.snapshot) };
}
export async function learningData(db: Db, workspaceId: string) {
  return learningFrom(await reads(db, learningReads(db, workspaceId)));
}
export async function planningData(db: Db, workspaceId: string, options: { calendarOnly?: boolean } = {}) {
  return (await planningWith(db, workspaceId, options, {})).data;
}
/**
 * Everything planning reads, in one round trip and one snapshot. A caller adds its own selects as
 * `extra` and gets their rows back beside the data, so a page costs a single query.
 */
export async function planningWith<E extends Record<string, Select>>(
  db: Db,
  workspaceId: string,
  options: { calendarOnly?: boolean },
  extra: E,
) {
  const calendar = {
    planner: db.select().from(plannerState).where(eq(plannerState.workspaceId, workspaceId)),
    prefs: db.select().from(preferences).where(eq(preferences.workspaceId, workspaceId)),
    courses: db.select().from(courses).where(eq(courses.workspaceId, workspaceId)),
    topics: db.select().from(topics).where(eq(topics.workspaceId, workspaceId)).orderBy(asc(topics.order)),
    assessments: db.select().from(assessments).where(eq(assessments.workspaceId, workspaceId)),
    sessions: db.select().from(plannedSessions).where(eq(plannedSessions.workspaceId, workspaceId)),
    activeLinks: db
      .select({ id: learningRuns.plannedSessionId })
      .from(learningRuns)
      .where(and(eq(learningRuns.workspaceId, workspaceId), eq(learningRuns.state, 'active'))),
    tutorLinks: db
      .select({ id: tutorSessions.plannedSessionId, endedAt: tutorSessions.endedAt })
      .from(tutorSessions)
      .where(eq(tutorSessions.workspaceId, workspaceId)),
    checkIns: db.select().from(checkIns).where(eq(checkIns.workspaceId, workspaceId)),
  };
  // Planning needs to know which materials are readable, never their text.
  const learning = {
    materials: db
      .select({ material: materials, status: materialVersions.status })
      .from(materials)
      .leftJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId))
      .where(eq(materials.workspaceId, workspaceId)),
    ...prefixed('links', materialTopicsReads(db, { workspaceId })),
    ...prefixed('learning', learningReads(db, workspaceId)),
    ...prefixed('mastery', topicMasteryReads(db, workspaceId)),
  };
  const all = await reads(db, { ...calendar, ...(options.calendarOnly ? {} : learning), ...prefixed('extra', extra) });
  const r = all as unknown as Rows<typeof calendar> & Partial<Rows<{ materials: typeof learning.materials }>>;
  const [planner = NEW_PLANNER] = r.planner;
  const [prefs] = r.prefs;
  const timezone = prefs?.timezone ?? 'UTC';
  const sessionRows = r.sessions;
  for (const row of sessionRows)
    if (r.activeLinks.some(l => l.id === row.id) || r.tutorLinks.some(l => !l.endedAt && l.id === row.id))
      row.content = { ...row.content, locked: true };
  const links = r.materials
    ? materialTopicsFrom(unprefixed('links', all) as Rows<ReturnType<typeof materialTopicsReads>>)
    : new Map<string, string[]>();
  // The syllabus is a source for the outline, not teaching material.
  const materialData: StudyMaterial[] = (r.materials ?? [])
    .filter(m => m.material.kind !== 'syllabus')
    .map(({ material: m, status }) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      kind: m.kind === 'slides' ? 'lecture-notes' : 'reading',
      archived: m.archived,
      addedAt: m.createdAt.toISOString(),
      topicIds: links.get(m.id) ?? [],
      readable: usableStatus(status),
    }));
  const { attempts, snapshots } = r.materials
    ? learningFrom(unprefixed('learning', all) as Rows<ReturnType<typeof learningReads>>)
    : { attempts: [], snapshots: [] };
  const mastery = r.materials
    ? topicMasteryFrom(unprefixed('mastery', all) as Rows<ReturnType<typeof topicMasteryReads>>, timezone)
    : [];
  const topicData: StudyTopic[] = r.topics;
  const data = {
    revision: planner.revision,
    availability: planner.availability,
    timezone,
    courses: r.courses.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })),
    topics: topicData,
    assessments: r.assessments.map(a => ({ ...a.content, revision: a.revision, source: a.source })),
    sessions: sessionRows.map(a => ({ ...a.content, revision: a.revision })),
    checkIns: r.checkIns.map(c => c.content),
    questions: [
      ...new Map(snapshots.flatMap(a => a.questions.map(q => [q.question.id, q.question] as const))).values(),
    ],
    materials: materialData,
    attempts,
    snapshots,
    due: reviewsFrom(mastery),
    mastery,
  };
  return { data, prefs, extra: unprefixed('extra', all) as Rows<E> };
}
/** Prefix each key so reads from different places can share one round trip. */
function prefixed(prefix: string, queries: Record<string, Select>) {
  return Object.fromEntries(Object.entries(queries).map(([k, v]) => [`${prefix}.${k}`, v])) as Record<string, Select>;
}
function unprefixed(prefix: string, rows: object) {
  return Object.fromEntries(
    Object.entries(rows).flatMap(([k, v]) => (k.startsWith(`${prefix}.`) ? [[k.slice(prefix.length + 1), v]] : [])),
  );
}
export async function plannerView(db: SocketDb, workspaceId: string) {
  const { data, extra } = await planningWith(
    db,
    workspaceId,
    { calendarOnly: true },
    {
      // The latest proposal made for the planner's current revision.
      proposals: db
        .select({ id: planProposals.id, baseRevision: planProposals.baseRevision, proposal: planProposals.proposal })
        .from(planProposals)
        .where(
          and(
            eq(planProposals.workspaceId, workspaceId),
            sql`${planProposals.baseRevision} = coalesce((select ${plannerState.revision} from ${plannerState} where ${plannerState.workspaceId} = ${workspaceId}), ${NEW_PLANNER.revision})`,
          ),
        )
        .orderBy(desc(planProposals.createdAt))
        .limit(1),
    },
  );
  const [savedProposal] = extra.proposals;
  return {
    savedProposal: savedProposal ?? null,
    revision: data.revision,
    availability: data.availability,
    timezone: data.timezone,
    courses: data.courses,
    topics: data.topics,
    assessments: data.assessments,
    sessions: data.sessions,
    checkIns: data.checkIns,
    today: zonedParts(new Date(), data.timezone).date,
  };
}
export async function saveAvailability(db: SocketDb, workspaceId: string, input: z.infer<typeof plannerWrite>) {
  return operation(db, workspaceId, input.operationId, { action: 'availability', input }, async tx => {
    const row = await ensurePlanner(tx, workspaceId);
    if (row.revision !== input.expectedRevision) throw conflict();
    await tx
      .update(plannerState)
      .set({ availability: input.availability, revision: row.revision + 1 })
      .where(eq(plannerState.workspaceId, workspaceId));
    return { revision: row.revision + 1, availability: input.availability };
  });
}
export async function saveSession(db: SocketDb, workspaceId: string, input: z.infer<typeof scheduleWrite>) {
  return operation(db, workspaceId, input.operationId, { action: 'schedule', input }, async tx => {
    await getCourse(tx, workspaceId, input.session.courseId);
    await validateTopics(tx, workspaceId, input.session.courseId, input.session.topicIds);
    const planner = await ensurePlanner(tx, workspaceId);
    if (planner.revision !== input.expectedRevision) throw conflict();
    if (input.session.assessmentId) {
      const [a] = await tx
        .select()
        .from(assessments)
        .where(
          and(
            eq(assessments.workspaceId, workspaceId),
            eq(assessments.courseId, input.session.courseId),
            eq(assessments.id, input.session.assessmentId),
          ),
        );
      if (!a) throw notFound();
    }
    const [prior] = await tx.select().from(plannedSessions).where(eq(plannedSessions.id, input.id));
    if (prior && (prior.workspaceId !== workspaceId || prior.courseId !== input.session.courseId)) throw notFound();
    if (prior?.content.status === 'completed')
      throw new ApiError(409, 'completed', 'Completed study remains in your history.');
    const content = {
      ...prior?.content,
      ...input.session,
      id: input.id,
      createdAt: prior?.content.createdAt ?? new Date().toISOString(),
    };
    await tx
      .insert(plannedSessions)
      .values({ id: input.id, workspaceId, courseId: input.session.courseId, date: content.date, content })
      .onConflictDoUpdate({
        target: plannedSessions.id,
        set: { content, date: content.date, revision: (prior?.revision ?? 0) + 1 },
      });
    await bumpPlanner(tx, workspaceId);
    return { revision: planner.revision + 1, session: content };
  });
}
export async function saveAssessment(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof assessmentWrite>,
) {
  return operation(db, workspaceId, input.operationId, { action: 'assessment', courseId, input }, async tx => {
    await getCourse(tx, workspaceId, courseId);
    await validateTopics(tx, workspaceId, courseId, input.assessment.topicIds);
    const planner = await ensurePlanner(tx, workspaceId);
    if (planner.revision !== input.expectedRevision) throw conflict();
    const [prior] = await tx.select().from(assessments).where(eq(assessments.id, input.id));
    if (prior && (prior.workspaceId !== workspaceId || prior.courseId !== courseId)) throw notFound();
    const content = {
      ...input.assessment,
      id: input.id,
      courseId,
      createdAt: prior?.content.createdAt ?? new Date().toISOString(),
    };
    // A student's change is theirs: a later syllabus reading leaves it alone.
    await tx
      .insert(assessments)
      .values({ id: input.id, workspaceId, courseId, date: content.date, content, edited: true })
      .onConflictDoUpdate({
        target: assessments.id,
        set: { content, date: content.date, edited: true, revision: (prior?.revision ?? 0) + 1 },
      });
    await bumpPlanner(tx, workspaceId);
    return { revision: planner.revision + 1, assessment: content };
  });
}
export async function addCheckIn(
  db: SocketDb,
  workspaceId: string,
  operationId: string,
  input: z.infer<typeof checkInInput>,
) {
  return operation(db, workspaceId, operationId, { action: 'check-in', input }, async tx => {
    if (input.courseId) {
      await getCourse(tx, workspaceId, input.courseId);
      if (input.topicId) await validateTopics(tx, workspaceId, input.courseId, [input.topicId]);
    }
    const content = { ...input, id: operationId, at: new Date().toISOString() };
    await tx.insert(checkIns).values({ id: operationId, workspaceId, content });
    await bumpPlanner(tx, workspaceId);
    return content;
  });
}
export async function propose(db: SocketDb, workspaceId: string, input: z.infer<typeof proposalInput>) {
  return operation(db, workspaceId, input.operationId, { action: 'propose', input }, async tx => {
    const data = await planningData(tx, workspaceId);
    const now = zonedParts(new Date(), data.timezone);
    const proposal = planWeek(
      { ...data, assessments: data.assessments.filter(isDated), today: now.date, weekStart: input.weekStart },
      { nowMinutes: now.minutes },
    );
    proposal.sessions = proposal.sessions.map(s => ({ ...s, id: crypto.randomUUID() }));
    const fingerprint = await hash(JSON.stringify(data));
    const [row] = await tx
      .insert(planProposals)
      .values({ id: input.operationId, workspaceId, baseRevision: data.revision, proposal, fingerprint })
      .returning();
    return row!;
  });
}
export async function applyProposal(db: SocketDb, workspaceId: string, id: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'apply-plan', id }, async tx => {
    const [row] = await tx
      .select()
      .from(planProposals)
      .where(and(eq(planProposals.workspaceId, workspaceId), eq(planProposals.id, id)));
    if (!row) throw notFound();
    const data = await planningData(tx, workspaceId);
    if (row.baseRevision !== data.revision || row.fingerprint !== (await hash(JSON.stringify(data)))) throw conflict();
    const today = zonedParts(new Date(), data.timezone).date;
    if (zonedParts(row.createdAt, data.timezone).date !== today)
      throw new ApiError(409, 'proposal_expired', 'Review a new proposal for today.');
    const removed = replacedByPlan(data.sessions, row.proposal, today);
    if (removed.length)
      await tx.delete(plannedSessions).where(
        and(
          eq(plannedSessions.workspaceId, workspaceId),
          inArray(
            plannedSessions.id,
            removed.map(s => s.id),
          ),
        ),
      );
    if (row.proposal.sessions.length)
      await tx.insert(plannedSessions).values(
        row.proposal.sessions.map(content => ({
          id: content.id,
          workspaceId,
          courseId: content.courseId,
          date: content.date,
          content,
        })),
      );
    await bumpPlanner(tx, workspaceId);
    return { applied: true, revision: data.revision + 1 };
  });
}
export async function progress(db: SocketDb, workspaceId: string) {
  const { data, extra } = await planningWith(
    db,
    workspaceId,
    {},
    {
      tutorActivity: db
        .select({
          id: tutorSessions.id,
          courseId: tutorSessions.courseId,
          title: tutorSessions.title,
          topicId: tutorSessions.topicId,
          completedAt: tutorSessions.endedAt,
        })
        .from(tutorSessions)
        .where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.completedLearning, true))),
      runs: db
        .select({ id: learningRuns.id, courseId: learningRuns.courseId, title: learningRuns.title })
        .from(learningRuns)
        .where(and(eq(learningRuns.workspaceId, workspaceId), eq(learningRuns.state, 'active')))
        .orderBy(asc(learningRuns.id))
        .limit(100),
      looseSessions: db
        .select({ courseId: tutorSessions.courseId, source: tutorSessions.source })
        .from(tutorSessions)
        .where(and(eq(tutorSessions.workspaceId, workspaceId), isNull(tutorSessions.topicId))),
    },
  );
  const { tutorActivity, runs, looseSessions } = extra;
  const now = zonedParts(new Date(), data.timezone);
  const days = [
    ...new Set([
      ...data.attempts.map(a => zonedParts(new Date(a.completedAt!), data.timezone).date),
      ...tutorActivity.flatMap(s => (s.completedAt ? [zonedParts(s.completedAt, data.timezone).date] : [])),
    ]),
  ]
    .sort()
    .reverse();
  let streak = 0,
    day = days.includes(now.date) ? now.date : addDays(now.date, -1);
  while (days.includes(day)) {
    streak++;
    day = addDays(day, -1);
  }
  // Work with no topic is never hidden: it rolls up under the material it came from.
  const known = new Set(data.topics.map(t => t.id));
  const sourceOf = new Map(data.questions.map(q => [q.id, q.source?.materialId]));
  const unlinkedRows = new Map<
    string,
    {
      courseId: string;
      materialId: string;
      title: string;
      answered: number;
      correct: number;
      tutorSessions: number;
    }
  >();
  const bucket = (courseId: string, materialId: string) => {
    const material = data.materials.find(m => m.id === materialId);
    const entry = unlinkedRows.get(materialId) ?? {
      courseId,
      materialId,
      title: material?.title ?? 'Material',
      answered: 0,
      correct: 0,
      tutorSessions: 0,
    };
    unlinkedRows.set(materialId, entry);
    return entry;
  };
  for (const a of data.attempts)
    for (const q of a.questions) {
      const materialId = sourceOf.get(q.questionId);
      if ((q.topicId && known.has(q.topicId)) || !materialId) continue;
      const entry = bucket(a.courseId, materialId);
      entry.answered++;
      if (q.outcome === 'correct') entry.correct++;
    }
  for (const t of looseSessions) if (t.source) bucket(t.courseId, t.source.materialId).tutorSessions++;
  const unlinked = [...unlinkedRows.values()];
  const suggestions = buildPlan({
    ...data,
    todaysSessions: data.sessions.filter(s => s.date === now.date),
    now: new Date(),
  }).map(s => {
    // A tutor suggestion opens a new session on its topic. Whether replies are available is the tutor page's to say.
    const course = `/course/${s.courseId}`,
      topic = s.topicId ? `?topicId=${s.topicId}` : '';
    const to = s.sessionId
      ? `/planner?session=${s.sessionId}`
      : s.kind === 'exam'
        ? `${course}/exams`
        : s.kind === 'tutor'
          ? `${course}/tutor${topic}`
          : s.kind === 'materials' || s.kind === 'setup'
            ? `${course}/materials`
            : `${course}/practice${topic}`;
    return { ...s, to };
  });
  return {
    suggestions,
    unlinked,
    tutorActivity,
    rulesVersion: 'evidence-v1',
    today: now.date,
    timezone: data.timezone,
    streak,
    topics: data.topics,
    courses: data.courses,
    evidence: [...deriveAllEvidence(data.topics, data.attempts, data.timezone).values()],
    due: data.due,
    mastery: data.mastery,
    mistakes: recurringMistakes(data.attempts, id => data.questions.find(q => q.id === id)?.prompt),
    attempts: data.attempts,
    runs,
    sessions: data.sessions.filter(s => s.date === now.date),
    assessments: data.assessments.filter(isDated).filter(a => a.date >= now.date),
    checkIns: data.checkIns.filter(c => zonedParts(new Date(c.at), data.timezone).date === now.date),
  };
}
