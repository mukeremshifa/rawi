import { z } from 'zod';
import { uuid } from './workspace';
import type { Citation } from './document';
import type { Course, Topic } from './workspace';
import type { Material, MaterialVersion } from './materials';
import type { PlannedAssessment } from '../domain/types';

/**
 * The course outline: topics read from the syllabus or worked out from the
 * materials, corrected in place, and computed over sections. A section is a
 * heading and the blocks under it up to the next heading, or the lead before
 * the first heading. A topic is a label, not a backbone: a course may have
 * none at first, a new material can bring new ones, and one section can
 * belong to several topics at different depths.
 */
export type TopicOrigin = 'syllabus' | 'materials' | 'student';
export type OutlineJobKind = 'read_syllabus' | 'assign_topics';
/** How deeply a section treats a topic. The first section in reading order that covers it introduces it. */
export type TopicDepth = 'introduces' | 'covers' | 'mentions';
/** What a finished job did, for the quiet line under the outline. */
export interface OutlineJobResult {
  provider: 'model' | 'rules';
  /** The model that did the work, when one did. */
  model?: string;
  /** Why the rules pass ran instead of a model. */
  fallback?: 'unconfigured' | 'budget' | 'failed';
  topics?: number; assessments?: number; links?: number;
}

export const OUTLINE_MIN = 8;
export const OUTLINE_MAX = 20;

/** A place to read about a topic: one section of a material's current version. */
export interface ReadingPlace { materialId: string; versionId: string; materialTitle: string; heading: string; blockId: string | null; sectionKey: string; depth: TopicDepth }
/** `buildsOn` lists earlier topics whose sections this topic's sections rely on, read from the material. */
export interface OutlineTopic extends Topic { places: ReadingPlace[]; sourceTitle: string | null; buildsOn: string[] }
export interface OutlineView {
  course: Course;
  topics: OutlineTopic[];
  syllabus: { material: Material; version: MaterialVersion | null } | null;
  /** The outline job still to run or running, if any. */
  pending: OutlineJobKind | null;
  /** The latest finished read or draft, for the fallback note and the ready toast. */
  latest: { id: string; kind: OutlineJobKind; result: OutlineJobResult | null; failure: string | null; finishedAt: string } | null;
  /** Ready materials other than the syllabus. */
  readyMaterials: number;
  assessments: (PlannedAssessment & { source: Citation | null; edited: boolean })[];
}

const write = { operationId: uuid, expectedRevision: z.number().int().positive() };
export const outlineCorrection = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('rename'), topicId: uuid, title: z.string().trim().min(1).max(200), ...write }),
  z.strictObject({ action: z.literal('merge'), topicId: uuid, targetId: uuid, ...write }),
  z.strictObject({ action: z.literal('remove'), topicId: uuid, ...write }),
  z.strictObject({ action: z.literal('add'), title: z.string().trim().min(1).max(200), module: z.string().trim().max(200), afterId: uuid.nullable(), ...write }),
  z.strictObject({ action: z.literal('move'), topicId: uuid, step: z.union([z.literal(-1), z.literal(1)]), ...write }),
]);
export type OutlineCorrection = z.infer<typeof outlineCorrection>;
export const outlineUndo = z.strictObject({ operationId: uuid, changeId: uuid });
export interface CorrectionResult { outline: OutlineView; changeId: string; message: string }

/** Covers in the Reader: the topics a material's current version is linked to. */
export const coversInput = z.strictObject({ operationId: uuid, versionId: uuid, topicId: uuid, action: z.enum(['add', 'remove']) });
export interface Covers { versionId: string; topics: { id: string; title: string; origin: 'suggested' | 'student'; depth: TopicDepth }[]; mapping: boolean }

/* ── Scopes ──────────────────────────────────────────────────────────── */

export type ScopeKind = 'topic' | 'sections' | 'assessment' | 'course';
/** A section named by its material and key, so it follows the section into new versions. */
export interface ScopeSection { materialId: string; key: string }
export const scopeSection = z.strictObject({ materialId: uuid, key: z.string().min(1).max(2000) });
export const scopeInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('topic'), topicId: uuid }),
  z.strictObject({ kind: z.literal('assessment'), assessmentId: uuid }),
  z.strictObject({ kind: z.literal('course') }),
  z.strictObject({ kind: z.literal('sections'), id: uuid, name: z.string().trim().min(1).max(200), sections: z.array(scopeSection).min(1).max(200) }),
]);
export const scopePatch = z.strictObject({ operationId: uuid, expectedRevision: z.number().int().positive(), name: z.string().trim().min(1).max(200).optional(), sections: z.array(scopeSection).min(1).max(200).optional(), archived: z.boolean().optional() });
export interface ScopeSummary { id: string; courseId: string; name: string; kind: ScopeKind; topicId: string | null; assessmentId: string | null; archived: boolean; revision: number; sectionCount: number; lastUsedAt: string | null }
/** A scope's sections in their current versions, with what they build on outside the scope. */
export interface ScopeView extends ScopeSummary {
  sections: { id: string; materialId: string; versionId: string; materialTitle: string; key: string; heading: string; blockId: string | null; weight: number }[];
  /** Saved sections whose material no longer has them. */
  missing: ScopeSection[];
  prerequisites: { id: string; materialId: string; versionId: string; materialTitle: string; heading: string; blockId: string | null; detail: string }[];
}
