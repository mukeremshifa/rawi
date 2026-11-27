import { z } from 'zod';
import { uuid, revision } from './workspace';
import type { ConversionStatus, ConversionWarning, Pagination } from './document';

import { fileTypes } from './constants';
export { fileTypes };
export const materialFields = z.strictObject({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['reading', 'slides', 'other']),
  attribution: z.string().max(4000),
});
// Do not trim source content. Wording and whitespace belong to the learner.
export const sourceText = z
  .string()
  .min(1)
  .max(1048576)
  .refine(text => text.trim().length > 0);
export const createMaterialInput = materialFields
  .extend({ id: uuid, text: sourceText, format: z.enum(['txt', 'md']) })
  .strict();
export const materialPatch = materialFields
  .partial()
  .extend({ archived: z.boolean().optional(), expectedRevision: revision })
  .strict();
// A syllabus upload goes to the course's syllabus slot rather than the library.
export const uploadInput = materialFields
  .extend({
    kind: z.enum(['reading', 'slides', 'other', 'syllabus']),
    requestId: uuid,
    materialId: uuid.optional(),
    expectedRevision: revision.optional(),
    fileName: z
      .string()
      .min(1)
      .max(240)
      .refine(s => !/[\x00-\x1f\x7f]/.test(s)),
    size: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    type: z.enum(fileTypes),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine(v => !!v.materialId === !!v.expectedRevision);
export const pageInput = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuid.optional(),
});
export const materialListInput = pageInput.extend({
  archived: z.enum(['true', 'false', 'all']).default('false'),
  topicId: uuid.optional(),
});
export interface Material {
  id: string;
  courseId: string;
  title: string;
  kind: z.infer<typeof uploadInput>['kind'];
  attribution: string;
  archived: boolean;
  currentVersionId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Topics the current version's sections are linked to. */
  topicIds: string[];
  /** Conversion status of the current version. */
  status: ConversionStatus | null;
  /**
   * How far Rawi has read the current version: readable once converted, searchable once every
   * block can be found, enriched once its summaries, facts and figures are done. Null before any.
   */
  readiness: 'readable' | 'searchable' | 'enriched' | null;
}
export interface MaterialVersion {
  id: string;
  materialId: string;
  number: number;
  origin: 'paste' | 'upload';
  sourceObjectId: string | null;
  format: (typeof fileTypes)[number];
  createdAt: string;
  schemaVersion: number;
  adapter: 'markdown' | 'datalab';
  adapterVersion: string;
  status: ConversionStatus;
  failedPages: number[];
  warnings: ConversionWarning[];
  failure: string | null;
  pageCount: number | null;
  pagination: Pagination;
  /** A failed conversion that the learner may start again. */
  retryable: boolean;
}
export interface UploadState {
  id: string;
  courseId: string;
  materialId: string;
  fileName: string;
  state: 'pending' | 'ready' | 'failed';
  expiresAt: string;
  resultVersionId: string | null;
  failure: string | null;
  inProgress: boolean;
}
export interface UploadTicket {
  upload: UploadState;
  url?: string;
  headers?: Record<string, string>;
}
