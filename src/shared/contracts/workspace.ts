import { z } from 'zod';

export const accents = ['indigo', 'amber', 'teal', 'rose', 'violet'] as const;
export const uuid = z.uuid().transform(value => value.toLowerCase());
export const revision = z.number().int().min(1).max(2147483646);
export const preferenceFields = z.strictObject({
  onboardingCompleted: z.boolean().default(true),
  displayName: z.string().trim().max(80),
  workspaceName: z.string().trim().min(1).max(80),
  accent: z.enum(accents),
  questionCount: z.number().int().min(1).max(30),
  hints: z.boolean(),
  feedback: z.enum(['immediate', 'end']),
  readingSize: z.enum(['normal', 'large', 'larger']),
  motion: z.enum(['system', 'reduced', 'full']),
  theme: z.enum(['system', 'light', 'dark']),
  reminders: z.strictObject({
    assessments: z.boolean(), study: z.boolean(), review: z.boolean(),
    days: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]),
  }),
});
export type PreferenceFields = z.infer<typeof preferenceFields>;
export const defaultPreferences: PreferenceFields = {
  onboardingCompleted: false,
  displayName: '', workspaceName: 'My workspace', accent: 'indigo', questionCount: 6,
  hints: true, feedback: 'immediate', readingSize: 'normal', motion: 'system', theme: 'system',
  reminders: { assessments: true, study: true, review: false, days: 1 },
};
export const timezone = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return !/^[+-]/.test(value); }
  catch { return false; }
}, 'Use an IANA timezone such as Asia/Dubai.');
export const preferencesPatch = preferenceFields.partial().extend({ operationId: uuid.optional(), timezone: timezone.optional(), expectedRevision: revision }).strict();
export const courseFields = z.strictObject({
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(4000),
  goal: z.string().trim().max(4000), accent: z.enum(accents),
});
export const topicInput = z.strictObject({
  id: uuid, title: z.string().trim().min(1).max(200), summary: z.string().trim().max(4000),
  priority: z.enum(['low', 'normal', 'high']), module: z.string().trim().max(200),
  order: z.number().int().min(0).max(100000), relatedTopicIds: z.array(uuid).max(200),
});
export const outline = z.array(topicInput).max(200).superRefine((topics, ctx) => {
  const ids = new Set(topics.map(t => t.id));
  if (ids.size !== topics.length) ctx.addIssue({ code: 'custom', message: 'Topic IDs must be unique.' });
  if (topics.reduce((count, topic) => count + topic.relatedTopicIds.length, 0) > 2000) ctx.addIssue({ code: 'custom', message: 'An outline can contain up to 2000 links.' });
  for (const topic of topics) {
    if (new Set(topic.relatedTopicIds).size !== topic.relatedTopicIds.length || topic.relatedTopicIds.some(id => id === topic.id || !ids.has(id))) {
      ctx.addIssue({ code: 'custom', message: 'Topic links must be unique and refer to another topic in this outline.' });
    }
  }
});
export const createCourseInput = courseFields.extend({ id: uuid, topics: outline.default([]) }).strict();
export const coursePatch = courseFields.partial().extend({ operationId: uuid.optional(), archived: z.boolean().optional(), expectedRevision: revision }).strict();
export const replaceOutlineInput = z.strictObject({ operationId: uuid.optional(), expectedRevision: revision, topics: outline });
export type TopicInput = z.infer<typeof topicInput>;
export type CreateCourseInput = z.infer<typeof createCourseInput>;
export interface Course extends z.infer<typeof courseFields> {
  id: string; workspaceId: string; archived: boolean; revision: number; createdAt: string; updatedAt: string;
}
export interface Topic extends TopicInput {
  workspaceId: string; courseId: string; revision: number; createdAt: string; updatedAt: string;
}
export interface Preferences {
  workspaceId: string; values: PreferenceFields; timezone: string; revision: number; createdAt: string; updatedAt: string;
}
export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  workspace: { id: string; ownerUserId: string; createdAt: string; updatedAt: string };
  preferences: Preferences;
}
export interface CourseDetail { course: Course; topics: Topic[] }
export interface CoursePage { courses: Course[]; nextCursor: string | null }
export interface ApiErrorBody { error: { code: string; message: string; requestId: string } }
