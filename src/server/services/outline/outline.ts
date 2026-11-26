import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  assessments,
  courses,
  materialVersions,
  outlineChanges,
  outlineJobs,
  plannedSessions,
  prerequisites,
  bankItems,
  topics,
  topicSections,
  tutorSessions,
} from '../../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import type { Citation } from '../../../shared/contracts/document';
import {
  type Covers,
  type OutlineCorrection,
  type TopicDepth,
  type TopicOrigin,
} from '../../../shared/contracts/outline';
import type { PlannedAssessment, AssessmentType } from '../../../shared/domain/types';
import { ApiError, conflict, notFound } from '../../errors';
import { operation } from '../learning';
import { materialDetail, ownMaterial, publicVersion } from '../materials';
import { bumpPlanner } from '../planning';
import { getCourse } from '../workspace';
import { liveLinks, readingPlaces, readyMaterials, setCover } from './links';
import { normalTitle } from './provider';

type Db = ReadDb | SocketDb | Transaction;
type Scope = { workspaceId: string; courseId: string };
type TopicRow = typeof topics.$inferSelect;
type LinkRow = typeof topicSections.$inferSelect;

export async function outlineView(db: Db, workspaceId: string, courseId: string) {
  const course = await getCourse(db, workspaceId, courseId);
  const scope = { workspaceId, courseId };
  const rows = await db
    .select()
    .from(topics)
    .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId)))
    .orderBy(asc(topics.order), asc(topics.id));
  const [places, links, requires] = await Promise.all([
    readingPlaces(db, scope),
    liveLinks(db, scope),
    db
      .select({ sectionId: prerequisites.sectionId, requiresId: prerequisites.requiresId })
      .from(prerequisites)
      .where(and(eq(prerequisites.workspaceId, workspaceId), eq(prerequisites.courseId, courseId))),
  ]);
  const titles = new Map(links.map(l => [l.section.materialId, l.section.title]));
  const buildsOn = topicDependencies(links, requires);
  let syllabus: {
    material: Awaited<ReturnType<typeof materialDetail>>;
    version: ReturnType<typeof publicVersion> | null;
  } | null = null;
  if (course.syllabusMaterialId) {
    const material = await materialDetail(db, workspaceId, course.syllabusMaterialId);
    const [version] = material.currentVersionId
      ? await db.select().from(materialVersions).where(eq(materialVersions.id, material.currentVersionId))
      : [];
    syllabus = { material, version: version ? publicVersion(version) : null };
  }
  const jobs = await db
    .select()
    .from(outlineJobs)
    .where(and(eq(outlineJobs.workspaceId, workspaceId), eq(outlineJobs.courseId, courseId)))
    .orderBy(desc(outlineJobs.createdAt))
    .limit(30);
  const open = jobs.filter(j => j.state === 'queued' || j.state === 'running');
  const pending = open.find(j => j.kind === 'read_syllabus')?.kind ?? open[0]?.kind ?? null;
  const finished = jobs.find(j => j.state === 'failed' || (j.state === 'done' && j.result));
  const assessmentRows = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.workspaceId, workspaceId), eq(assessments.courseId, courseId)));
  return {
    course,
    pending,
    readyMaterials: (await readyMaterials(db, scope, course.syllabusMaterialId)).length,
    syllabus,
    topics: rows.map(t => ({
      ...t,
      places: places.get(t.id) ?? [],
      sourceTitle: t.source ? (titles.get(t.source.materialId) ?? null) : null,
      buildsOn: buildsOn.get(t.id) ?? [],
    })),
    latest: finished
      ? {
          id: finished.id,
          kind: finished.kind,
          result: finished.result,
          failure: finished.failure,
          finishedAt: finished.updatedAt.toISOString(),
        }
      : null,
    assessments: assessmentRows.map(r => ({ ...r.content, source: r.source, edited: r.edited })),
  };
}

/**
 * Which topics each topic builds on: a section of the topic requires a section that introduces or
 * covers another topic, read from the material. Mentions do not count.
 */
function topicDependencies(
  links: Awaited<ReturnType<typeof liveLinks>>,
  requires: { sectionId: string; requiresId: string }[],
) {
  const topicsOf = new Map<string, Set<string>>();
  for (const l of links)
    if (l.depth !== 'mentions') topicsOf.set(l.section.id, (topicsOf.get(l.section.id) ?? new Set()).add(l.topicId));
  const out = new Map<string, string[]>();
  for (const r of requires) {
    for (const topic of topicsOf.get(r.sectionId) ?? []) {
      for (const earlier of topicsOf.get(r.requiresId) ?? []) {
        if (earlier === topic || topicsOf.get(r.sectionId)!.has(earlier)) continue;
        const list = out.get(topic) ?? [];
        if (!list.includes(earlier)) out.set(topic, [...list, earlier]);
      }
    }
  }
  return out;
}

/**
 * Topics a job may not rename or remove: edited or added by the student, or
 * with work behind them. Coverage counts only on assessments the student set
 * or changed, since a syllabus reading writes its own coverage.
 */
export async function protectedTopics(tx: Transaction, scope: Scope) {
  const own = (table: { workspaceId: AnyPgColumn; courseId: AnyPgColumn }) =>
    and(eq(table.workspaceId, scope.workspaceId), eq(table.courseId, scope.courseId));
  const ids = new Set<string>();
  for (const t of await tx
    .select({ id: topics.id })
    .from(topics)
    .where(and(own(topics), or(eq(topics.edited, true), eq(topics.origin, 'student')))))
    ids.add(t.id);
  for (const q of await tx
    .selectDistinct({ id: sql<string>`${bankItems.content}->>'topicId'` })
    .from(bankItems)
    .where(own(bankItems)))
    if (q.id) ids.add(q.id);
  for (const s of await tx.selectDistinct({ id: tutorSessions.topicId }).from(tutorSessions).where(own(tutorSessions)))
    if (s.id) ids.add(s.id);
  for (const p of await tx
    .select({ content: plannedSessions.content })
    .from(plannedSessions)
    .where(own(plannedSessions)))
    for (const id of p.content.topicIds) ids.add(id);
  for (const a of await tx
    .select({ content: assessments.content })
    .from(assessments)
    .where(and(own(assessments), eq(assessments.edited, true))))
    for (const id of a.content.topicIds) ids.add(id);
  return ids;
}

async function bumpOutline(tx: Transaction, scope: Scope) {
  const [row] = await tx
    .update(courses)
    .set({ outlineRevision: sql`${courses.outlineRevision} + 1`, updatedAt: new Date() })
    .where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId)))
    .returning({ revision: courses.outlineRevision });
  return row!.revision;
}

export interface ProposedTopic {
  existingId: string | null;
  title: string;
  module: string;
  summary: string;
  source: Citation | null;
}

/**
 * Merge a job's outline into the current one. A proposed topic matches by
 * the id the job reused, then by normalised title. Protected topics keep
 * their title, place and module. Unprotected topics the reading no longer
 * contains are removed. Returns the topic id for each proposed topic.
 */
export async function applyTopics(
  tx: Transaction,
  scope: Scope,
  proposed: ProposedTopic[],
  origin: Exclude<TopicOrigin, 'student'>,
) {
  const current = await tx
    .select()
    .from(topics)
    .where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId)))
    .orderBy(asc(topics.order));
  const locked = await protectedTopics(tx, scope);
  const matched = new Map<string, TopicRow>(),
    used = new Set<string>();
  for (const [i, p] of proposed.entries()) {
    const hit =
      (p.existingId && current.find(t => t.id === p.existingId && !used.has(t.id))) ||
      current.find(t => !used.has(t.id) && normalTitle(t.title) === normalTitle(p.title));
    if (hit) {
      matched.set(String(i), hit);
      used.add(hit.id);
    }
  }
  // Final order: the reading's order, with kept topics it no longer contains after their old neighbour.
  const kept = current.filter(t => !used.has(t.id) && locked.has(t.id));
  const removed = current.filter(t => !used.has(t.id) && !locked.has(t.id));
  type Slot = {
    key: number;
    id: string;
    write?: { title: string; module: string; summary: string; source: Citation | null };
  };
  const slots: Slot[] = proposed.map((p, i) => {
    const hit = matched.get(String(i));
    const write = {
      title: p.title.slice(0, 200),
      module: p.module.slice(0, 200),
      summary: p.summary.slice(0, 1000),
      source: p.source,
    };
    return { key: i, id: hit?.id ?? crypto.randomUUID(), write };
  });
  for (const t of kept) {
    const before = current
      .slice(0, current.indexOf(t))
      .reverse()
      .map(x => slots.find(s => s.id === x.id))
      .find(Boolean);
    // Kept topics follow their old neighbour, or go to the end when it is gone.
    slots.push({ key: before ? before.key + 0.5 : proposed.length + current.indexOf(t), id: t.id });
  }
  slots.sort((a, b) => a.key - b.key);
  if (removed.length)
    await tx.delete(topics).where(
      inArray(
        topics.id,
        removed.map(t => t.id),
      ),
    );
  for (const [order, slot] of slots.entries()) {
    const existing = current.find(t => t.id === slot.id);
    if (!existing) {
      await tx.insert(topics).values({ id: slot.id, ...scope, ...slot.write!, order, origin });
    } else if (slot.write && !locked.has(existing.id)) {
      await tx
        .update(topics)
        .set({ ...slot.write, order, revision: existing.revision + 1, updatedAt: new Date() })
        .where(eq(topics.id, existing.id));
    } else if (slot.write) {
      // Protected: the reading may refresh its source and summary, never its name or place.
      const changes = existing.edited
        ? {}
        : {
            summary: slot.write.summary,
            source: slot.write.source,
            ...(existing.origin === 'student' ? {} : { order }),
          };
      await tx
        .update(topics)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(topics.id, existing.id));
    } else if (existing.order !== order && !existing.edited) {
      await tx.update(topics).set({ order }).where(eq(topics.id, existing.id));
    }
  }
  await renumber(tx, scope);
  await bumpOutline(tx, scope);
  return {
    ids: proposed.map((_p, i) => slots.find(s => s.key === i)!.id),
    added: slots.filter(s => !current.some(t => t.id === s.id)).length,
    removed: removed.length,
  };
}

/**
 * Add topics an assignment proposed, after the existing ones. A proposal with the title of an
 * existing topic is that topic, so its sections join it instead of making a duplicate.
 */
export async function addTopics(tx: Transaction, scope: Scope, add: Omit<ProposedTopic, 'existingId'>[]) {
  const current = await tx
    .select({ id: topics.id, title: topics.title })
    .from(topics)
    .where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId)));
  const out: (Omit<ProposedTopic, 'existingId'> & { id: string })[] = [];
  let order = current.length,
    added = 0;
  for (const a of add) {
    const same =
      current.find(t => normalTitle(t.title) === normalTitle(a.title)) ??
      out.find(t => normalTitle(t.title) === normalTitle(a.title));
    if (same) {
      out.push({ ...a, id: same.id });
      continue;
    }
    const id = crypto.randomUUID();
    await tx.insert(topics).values({
      id,
      ...scope,
      title: a.title.slice(0, 200),
      module: a.module.slice(0, 200),
      summary: a.summary.slice(0, 1000),
      source: a.source,
      order: order++,
      origin: 'materials',
    });
    out.push({ ...a, id });
    added++;
  }
  if (added) await bumpOutline(tx, scope);
  return out;
}

async function renumber(tx: Transaction, scope: Scope) {
  const rows = await tx
    .select({ id: topics.id, order: topics.order })
    .from(topics)
    .where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId)))
    .orderBy(asc(topics.order), asc(topics.createdAt));
  for (const [i, row] of rows.entries())
    if (row.order !== i) await tx.update(topics).set({ order: i }).where(eq(topics.id, row.id));
}

export interface ProposedAssessment {
  title: string;
  type: AssessmentType;
  date: string | null;
  weight: number | null;
  topicIds: string[];
  source: Citation;
}
/**
 * Assessments from the syllabus. One the student edited is never changed.
 * An unedited one is updated by title, and one the new reading drops is
 * removed unless a planned session prepares for it.
 */
export async function applyAssessments(
  tx: Transaction,
  scope: Scope,
  syllabusId: string,
  proposed: ProposedAssessment[],
) {
  const rows = await tx
    .select()
    .from(assessments)
    .where(and(eq(assessments.workspaceId, scope.workspaceId), eq(assessments.courseId, scope.courseId)));
  const fromSyllabus = rows.filter(r => r.source?.materialId === syllabusId);
  const seen = new Set<string>();
  let written = 0;
  for (const p of proposed) {
    const existing = rows.find(r => normalTitle(r.content.title) === normalTitle(p.title));
    seen.add(existing?.id ?? '');
    if (existing?.edited) continue;
    const id = existing?.id ?? crypto.randomUUID();
    const content: PlannedAssessment = {
      ...existing?.content,
      id,
      courseId: scope.courseId,
      title: p.title.slice(0, 200),
      type: p.type,
      date: p.date,
      topicIds: p.topicIds,
      ...(p.weight === null ? {} : { weightPercent: p.weight }),
      createdAt: existing?.content.createdAt ?? new Date().toISOString(),
    };
    if (existing)
      await tx
        .update(assessments)
        .set({ content, date: p.date, source: p.source, revision: existing.revision + 1 })
        .where(eq(assessments.id, id));
    else await tx.insert(assessments).values({ id, ...scope, date: p.date, content, source: p.source, edited: false });
    written++;
  }
  const stale = fromSyllabus.filter(r => !r.edited && !seen.has(r.id));
  if (stale.length) {
    const used = await tx
      .select({ id: plannedSessions.assessmentId })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.workspaceId, scope.workspaceId),
          inArray(
            plannedSessions.assessmentId,
            stale.map(r => r.id),
          ),
        ),
      );
    const free = stale.filter(r => !used.some(u => u.id === r.id));
    if (free.length)
      await tx.delete(assessments).where(
        inArray(
          assessments.id,
          free.map(r => r.id),
        ),
      );
  }
  if (written || stale.length) await bumpPlanner(tx, scope.workspaceId);
  return written;
}

/* ── Corrections ─────────────────────────────────────────────────────── */

type LinkKey = { topicId: string; materialId: string; sectionKey: string };
interface Undo {
  topics: TopicRow[];
  deleteTopicIds: string[];
  links: LinkRow[];
  deleteLinks: LinkKey[];
  questions: { id: string; topicId?: string; topicLabel?: string }[];
  tutor: { id: string; topicId: string | null; topicLabel: string | null }[];
  planned: { id: string; topicIds: string[]; link?: unknown }[];
  assessments: { id: string; topicIds: string[] }[];
}
const emptyUndo = (): Undo => ({
  topics: [],
  deleteTopicIds: [],
  links: [],
  deleteLinks: [],
  questions: [],
  tutor: [],
  planned: [],
  assessments: [],
});

async function outlineTopic(tx: Transaction, scope: Scope, id: string) {
  const [row] = await tx
    .select()
    .from(topics)
    .where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId), eq(topics.id, id)));
  if (!row) throw notFound();
  return row;
}

export async function correctOutline(db: SocketDb, workspaceId: string, courseId: string, input: OutlineCorrection) {
  return operation(db, workspaceId, input.operationId, { action: 'outline-correction', courseId, input }, async tx => {
    const scope = { workspaceId, courseId };
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, courseId)))
      .for('update');
    if (!course) throw notFound();
    if (course.outlineRevision !== input.expectedRevision) throw conflict();
    const undo = emptyUndo();
    let message = '';
    const all = await tx
      .select()
      .from(topics)
      .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId)))
      .orderBy(asc(topics.order));
    if (input.action === 'rename') {
      const topic = await outlineTopic(tx, scope, input.topicId);
      undo.topics.push(topic);
      await tx
        .update(topics)
        .set({ title: input.title, edited: true, revision: topic.revision + 1, updatedAt: new Date() })
        .where(eq(topics.id, topic.id));
      await tx
        .update(tutorSessions)
        .set({ topicLabel: input.title })
        .where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.topicId, topic.id)));
      message = `Renamed to ${input.title}`;
    } else if (input.action === 'move') {
      const index = all.findIndex(t => t.id === input.topicId),
        other = all[index + input.step];
      if (index < 0) throw notFound();
      if (!other) throw new ApiError(409, 'cannot_move', 'This topic is already at that end of the outline.');
      const topic = all[index]!;
      undo.topics.push(topic, other);
      await tx
        .update(topics)
        .set({ order: other.order, edited: true, updatedAt: new Date() })
        .where(eq(topics.id, topic.id));
      await tx.update(topics).set({ order: topic.order }).where(eq(topics.id, other.id));
      message = `Moved ${topic.title} ${input.step < 0 ? 'up' : 'down'}`;
    } else if (input.action === 'add') {
      if (all.length >= 200) throw new ApiError(409, 'outline_full', 'An outline can hold up to 200 topics.');
      const after = input.afterId ? all.findIndex(t => t.id === input.afterId) : all.length - 1;
      const id = crypto.randomUUID();
      for (const t of all.slice(after + 1)) {
        undo.topics.push(t);
        await tx
          .update(topics)
          .set({ order: t.order + 1 })
          .where(eq(topics.id, t.id));
      }
      await tx.insert(topics).values({
        id,
        ...scope,
        title: input.title,
        module: input.module,
        summary: '',
        order: (all[after]?.order ?? -1) + 1,
        origin: 'student',
        edited: true,
      });
      undo.deleteTopicIds.push(id);
      message = `Added ${input.title}`;
    } else if (input.action === 'remove') {
      const topic = await outlineTopic(tx, scope, input.topicId);
      undo.topics.push(topic);
      undo.links.push(...(await tx.select().from(topicSections).where(eq(topicSections.topicId, topic.id))));
      await tx.delete(topics).where(eq(topics.id, topic.id));
      message = `Removed ${topic.title}`;
    } else {
      if (input.topicId === input.targetId)
        throw new ApiError(400, 'invalid_input', 'Choose a different topic to merge into.');
      const source = await outlineTopic(tx, scope, input.topicId),
        target = await outlineTopic(tx, scope, input.targetId);
      undo.topics.push(source, target);
      const links = await tx.select().from(topicSections).where(eq(topicSections.topicId, source.id));
      undo.links.push(...links);
      if (links.length) {
        const moved = await tx
          .insert(topicSections)
          .values(links.map(({ createdAt: _c, ...l }) => ({ ...l, topicId: target.id })))
          .onConflictDoNothing()
          .returning({
            topicId: topicSections.topicId,
            materialId: topicSections.materialId,
            sectionKey: topicSections.sectionKey,
          });
        undo.deleteLinks.push(...moved);
      }
      await moveReferences(tx, scope, source.id, target, undo);
      await tx.delete(topics).where(eq(topics.id, source.id));
      await tx
        .update(topics)
        .set({ edited: true, revision: target.revision + 1, updatedAt: new Date() })
        .where(eq(topics.id, target.id));
      message = `Merged ${source.title} into ${target.title}`;
    }
    await renumber(tx, scope);
    const afterRevision = await bumpOutline(tx, scope);
    const changeId = crypto.randomUUID();
    await tx.insert(outlineChanges).values({ id: changeId, ...scope, afterRevision, undo });
    await bumpPlanner(tx, workspaceId);
    return { outline: await outlineView(tx, workspaceId, courseId), changeId, message };
  });
}

/** Questions, tutor sessions, planned sessions and assessment coverage follow a merged topic. */
async function moveReferences(tx: Transaction, scope: Scope, from: string, to: TopicRow, undo: Undo) {
  const own = (table: { workspaceId: AnyPgColumn; courseId: AnyPgColumn }) =>
    and(eq(table.workspaceId, scope.workspaceId), eq(table.courseId, scope.courseId));
  for (const q of await tx
    .select()
    .from(bankItems)
    .where(and(own(bankItems), sql`${bankItems.content}->>'topicId' = ${from}`))) {
    undo.questions.push({ id: q.id, topicId: q.content.topicId, topicLabel: q.content.topicLabel });
    await tx
      .update(bankItems)
      .set({ content: { ...q.content, topicId: to.id, topicLabel: to.title } })
      .where(eq(bankItems.id, q.id));
  }
  for (const s of await tx
    .select()
    .from(tutorSessions)
    .where(and(own(tutorSessions), eq(tutorSessions.topicId, from)))) {
    undo.tutor.push({ id: s.id, topicId: s.topicId, topicLabel: s.topicLabel });
    await tx.update(tutorSessions).set({ topicId: to.id, topicLabel: to.title }).where(eq(tutorSessions.id, s.id));
  }
  const swap = (ids: string[]) => [...new Set(ids.map(id => (id === from ? to.id : id)))];
  for (const p of await tx.select().from(plannedSessions).where(own(plannedSessions))) {
    const link =
      p.content.link?.kind === 'tutor' && p.content.link.topicId === from
        ? { kind: 'tutor' as const, topicId: to.id }
        : p.content.link?.kind === 'practice-new' && p.content.link.topicIds.includes(from)
          ? { ...p.content.link, topicIds: swap(p.content.link.topicIds) }
          : null;
    if (!p.content.topicIds.includes(from) && !link) continue;
    undo.planned.push({ id: p.id, topicIds: p.content.topicIds, link: p.content.link });
    await tx
      .update(plannedSessions)
      .set({ content: { ...p.content, topicIds: swap(p.content.topicIds), ...(link ? { link } : {}) } })
      .where(eq(plannedSessions.id, p.id));
  }
  for (const a of await tx.select().from(assessments).where(own(assessments))) {
    if (!a.content.topicIds.includes(from)) continue;
    undo.assessments.push({ id: a.id, topicIds: a.content.topicIds });
    await tx
      .update(assessments)
      .set({ content: { ...a.content, topicIds: swap(a.content.topicIds) } })
      .where(eq(assessments.id, a.id));
  }
}

export async function undoCorrection(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  operationId: string,
  changeId: string,
) {
  return operation(db, workspaceId, operationId, { action: 'outline-undo', courseId, changeId }, async tx => {
    const scope = { workspaceId, courseId };
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, courseId)))
      .for('update');
    const [change] = await tx
      .select()
      .from(outlineChanges)
      .where(
        and(
          eq(outlineChanges.workspaceId, workspaceId),
          eq(outlineChanges.courseId, courseId),
          eq(outlineChanges.id, changeId),
        ),
      );
    if (!course || !change) throw notFound();
    if (change.undone || course.outlineRevision !== change.afterRevision)
      throw new ApiError(409, 'undo_unavailable', 'The outline changed after this, so it can no longer be undone.');
    const undo = change.undo as Undo;
    const revive = (t: TopicRow) => ({ ...t, createdAt: new Date(t.createdAt), updatedAt: new Date() });
    for (const l of undo.deleteLinks ?? [])
      await tx
        .delete(topicSections)
        .where(
          and(
            eq(topicSections.topicId, l.topicId),
            eq(topicSections.materialId, l.materialId),
            eq(topicSections.sectionKey, l.sectionKey),
          ),
        );
    if (undo.deleteTopicIds.length) await tx.delete(topics).where(inArray(topics.id, undo.deleteTopicIds));
    for (const t of undo.topics)
      await tx
        .insert(topics)
        .values(revive(t))
        .onConflictDoUpdate({
          target: topics.id,
          set: {
            title: t.title,
            summary: t.summary,
            module: t.module,
            order: t.order,
            edited: t.edited,
            source: t.source,
            updatedAt: new Date(),
          },
        });
    if (undo.links.length)
      await tx
        .insert(topicSections)
        .values(undo.links.map(l => ({ ...l, createdAt: new Date(l.createdAt) })))
        .onConflictDoNothing();
    for (const q of undo.questions) {
      const [row] = await tx.select().from(bankItems).where(eq(bankItems.id, q.id));
      if (row)
        await tx
          .update(bankItems)
          .set({ content: { ...row.content, topicId: q.topicId, topicLabel: q.topicLabel } })
          .where(eq(bankItems.id, q.id));
    }
    for (const s of undo.tutor)
      await tx
        .update(tutorSessions)
        .set({ topicId: s.topicId, topicLabel: s.topicLabel })
        .where(eq(tutorSessions.id, s.id));
    for (const p of undo.planned) {
      const [row] = await tx.select().from(plannedSessions).where(eq(plannedSessions.id, p.id));
      if (row)
        await tx
          .update(plannedSessions)
          .set({ content: { ...row.content, topicIds: p.topicIds, link: p.link as typeof row.content.link } })
          .where(eq(plannedSessions.id, p.id));
    }
    for (const a of undo.assessments) {
      const [row] = await tx.select().from(assessments).where(eq(assessments.id, a.id));
      if (row)
        await tx
          .update(assessments)
          .set({ content: { ...row.content, topicIds: a.topicIds } })
          .where(eq(assessments.id, a.id));
    }
    await renumber(tx, scope);
    await tx.update(outlineChanges).set({ undone: true }).where(eq(outlineChanges.id, changeId));
    await bumpOutline(tx, scope);
    await bumpPlanner(tx, workspaceId);
    return { outline: await outlineView(tx, workspaceId, courseId), changeId, message: 'Undone' };
  });
}

/* ── Covers ──────────────────────────────────────────────────────────── */

const DEPTH_RANK: Record<TopicDepth, number> = { introduces: 0, covers: 1, mentions: 2 };

export async function getCovers(db: Db, workspaceId: string, materialId: string): Promise<Covers> {
  const material = await ownMaterial(db, workspaceId, materialId);
  if (!material.currentVersionId) return { versionId: '', topics: [], mapping: false };
  const scope = { workspaceId, courseId: material.courseId };
  const [links, rows, [job]] = await Promise.all([
    liveLinks(db, scope, [materialId]),
    db
      .select({ id: topics.id, title: topics.title, order: topics.order })
      .from(topics)
      .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, material.courseId)))
      .orderBy(asc(topics.order)),
    db
      .select({ id: outlineJobs.id })
      .from(outlineJobs)
      .where(
        and(
          eq(outlineJobs.workspaceId, workspaceId),
          eq(outlineJobs.courseId, material.courseId),
          inArray(outlineJobs.state, ['queued', 'running']),
        ),
      )
      .limit(1),
  ]);
  const out: Covers['topics'] = [];
  for (const t of rows) {
    const own = links.filter(l => l.topicId === t.id).sort((a, b) => DEPTH_RANK[a.depth] - DEPTH_RANK[b.depth]);
    if (own.length)
      out.push({
        id: t.id,
        title: t.title,
        origin: own.some(l => l.origin === 'student') ? 'student' : 'suggested',
        depth: own[0]!.depth,
      });
  }
  return { versionId: material.currentVersionId, topics: out, mapping: !!job };
}

export async function changeCovers(
  db: SocketDb,
  workspaceId: string,
  materialId: string,
  input: { operationId: string; versionId: string; topicId: string; action: 'add' | 'remove' },
) {
  return operation(db, workspaceId, input.operationId, { action: 'covers', materialId, input }, async tx => {
    const material = await ownMaterial(tx, workspaceId, materialId);
    if (material.currentVersionId !== input.versionId) throw conflict();
    if (material.kind === 'syllabus') throw new ApiError(400, 'invalid_input', 'The syllabus is not linked to topics.');
    await outlineTopic(tx, { workspaceId, courseId: material.courseId }, input.topicId);
    await setCover(tx, { workspaceId, courseId: material.courseId, materialId }, input.topicId, input.action === 'add');
    await bumpPlanner(tx, workspaceId);
    return getCovers(tx, workspaceId, materialId);
  });
}
