import { z } from 'zod';

/** The version of the pilot terms. A new version asks every student to agree again. */
export const CONSENT_VERSION = 'pilot-2026-12';
export const uuid = z.uuid().transform(value => value.toLowerCase());
export const revision = z.number().int().min(1).max(2147483646);
export const preferenceFields = z.strictObject({
  onboardingCompleted: z.boolean().default(true),
  displayName: z.string().trim().max(80),
  workspaceName: z.string().trim().min(1).max(80),
  questionCount: z.number().int().min(1).max(30),
  hints: z.boolean(),
  feedback: z.enum(['immediate', 'end']),
  readingSize: z.enum(['normal', 'large', 'larger']),
  motion: z.enum(['system', 'reduced', 'full']),
  theme: z.enum(['system', 'light', 'dark']),
  // The language the student thinks in, for glossaries and explanations. Checks stay in the course's language.
  firstLanguage: z.enum(['none', 'ar']).default('none'),
  reminders: z.strictObject({
    assessments: z.boolean(),
    study: z.boolean(),
    review: z.boolean(),
    days: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]),
  }),
});
export type PreferenceFields = z.infer<typeof preferenceFields>;
export const defaultPreferences: PreferenceFields = {
  onboardingCompleted: false,
  displayName: '',
  workspaceName: 'My workspace',
  questionCount: 6,
  hints: true,
  feedback: 'immediate',
  readingSize: 'normal',
  motion: 'system',
  theme: 'system',
  firstLanguage: 'none',
  reminders: { assessments: true, study: true, review: false, days: 1 },
};
export const timezone = z
  .string()
  .max(100)
  .refine(value => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return !/^[+-]/.test(value);
    } catch {
      return false;
    }
  }, 'Use an IANA timezone such as Asia/Dubai.');
export const preferencesPatch = preferenceFields
  .partial()
  .extend({ operationId: uuid.optional(), timezone: timezone.optional(), expectedRevision: revision })
  .strict();
export const courseFields = z.strictObject({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
});
// A course starts with a name. Its outline comes from the syllabus or its materials.
export const createCourseInput = courseFields
  .extend({ id: uuid, description: courseFields.shape.description.default('') })
  .strict();
export const coursePatch = courseFields
  .partial()
  .extend({ operationId: uuid.optional(), archived: z.boolean().optional(), expectedRevision: revision })
  .strict();
export type CreateCourseInput = z.infer<typeof createCourseInput>;
export interface Course extends z.infer<typeof courseFields> {
  id: string;
  workspaceId: string;
  archived: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  syllabusMaterialId: string | null;
  outlineRevision: number;
}
export interface Topic {
  id: string;
  title: string;
  /** One or two sentences written from the source. A topic the student added may have none. */
  summary: string;
  /** The week or unit label, when the source has one. */
  module: string;
  order: number;
  origin: 'syllabus' | 'materials' | 'student';
  source: { materialId: string; versionId: string; blockIds: string[] } | null;
  edited: boolean;
  workspaceId: string;
  courseId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Preferences {
  workspaceId: string;
  values: PreferenceFields;
  timezone: string;
  revision: number;
  /** The pilot terms agreed to, or null before agreeing. */
  consentVersion: string | null;
  consentedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  workspace: { id: string; ownerUserId: string; createdAt: string; updatedAt: string };
  preferences: Preferences;
}
export interface CourseDetail {
  course: Course;
  topics: Topic[];
}
export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}
