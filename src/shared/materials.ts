import { z } from 'zod';
import { uuid, revision } from './online';

export const fileTypes = ['txt', 'md', 'pdf', 'docx', 'pptx'] as const;
export const materialFields = z.strictObject({
  title: z.string().trim().min(1).max(200), kind: z.enum(['reading', 'notes', 'slides', 'other']),
  attribution: z.string().max(4000), topicIds: z.array(uuid).max(200).refine(ids => new Set(ids).size === ids.length),
});
// Do not trim source content. Wording and whitespace belong to the learner.
export const sourceText = z.string().min(1).max(1048576).refine(text => text.trim().length > 0);
export const createMaterialInput = materialFields.extend({ id: uuid, text: sourceText, format: z.enum(['txt', 'md']) }).strict();
export const materialPatch = materialFields.partial().extend({ archived: z.boolean().optional(), expectedRevision: revision }).strict();
export const textVersionInput = z.strictObject({ requestId: uuid, expectedRevision: revision, text: sourceText, format: z.enum(['txt', 'md']) });
export const uploadInput = materialFields.extend({
  requestId: uuid, materialId: uuid.optional(), expectedRevision: revision.optional(),
  fileName: z.string().min(1).max(240).refine(s => !/[\x00-\x1f\x7f]/.test(s)),
  size: z.number().int().positive().max(25 * 1024 * 1024), type: z.enum(fileTypes),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(v => !!v.materialId === !!v.expectedRevision);
export const pageInput = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: uuid.optional() });
export const materialListInput = pageInput.extend({ archived: z.enum(['true', 'false', 'all']).default('false'), topicId: uuid.optional() });
export interface OnlineMaterial {
  id: string; courseId: string; title: string; kind: z.infer<typeof materialFields>['kind']; attribution: string;
  archived: boolean; currentVersionId: string | null; revision: number; createdAt: string; updatedAt: string; topicIds: string[];
  contentStatus: 'readable' | 'not_extracted' | 'failed' | null;
}
export interface MaterialVersion {
  id: string; materialId: string; number: number; origin: 'paste' | 'upload' | 'edit';
  sourceObjectId: string | null; contentStatus: 'readable' | 'not_extracted' | 'failed'; format: typeof fileTypes[number]; createdAt: string;
}
export interface OnlinePassage { id: string; heading: string; text: string; order: number }
export interface VersionDetail { version: MaterialVersion; passages: OnlinePassage[]; nextCursor: number | null }
export interface UploadState {
  id: string; courseId: string; materialId: string; fileName: string; state: 'pending' | 'ready' | 'failed';
  expiresAt: string; resultVersionId: string | null; failure: string | null; inProgress: boolean;
}
export interface UploadTicket { upload: UploadState; url?: string; headers?: Record<string, string> }
