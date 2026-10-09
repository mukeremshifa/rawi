import { z } from 'zod';
import { uuid } from './workspace';
import type { Citation } from './document';
import type { Course, Topic } from './workspace';
import type { Material, MaterialVersion } from './materials';
import type { PlannedAssessment } from '../domain/types';

/**
 * The course outline: topics read from the syllabus or drafted from
 * materials, corrected in place, and linked to sections of materials.
 * A section is a heading and the blocks under it, or the lead before the
 * first heading.
 */
export type TopicOrigin = 'syllabus' | 'materials' | 'student';
export type OutlineJobKind = 'read_syllabus' | 'map_material' | 'draft_outline';
/** What a finished job did, for the quiet line under the outline. */
export interface OutlineJobResult {
  provider: 'anthropic' | 'rules';
  /** Why the rules pass ran instead of the model. */
  fallback?: 'unconfigured' | 'budget' | 'failed';
  topics?: number; assessments?: number; links?: number;
}

export const OUTLINE_MIN = 8;
export const OUTLINE_MAX = 20;

/** A place to read about a topic: one section of a material's current version. */
export interface ReadingPlace { materialId: string; versionId: string; materialTitle: string; heading: string; blockId: string | null }
export interface OutlineTopic extends Topic { places: ReadingPlace[]; sourceTitle: string | null }
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
export interface Covers { versionId: string; topics: { id: string; title: string; origin: 'suggested' | 'student' }[]; mapping: boolean }
