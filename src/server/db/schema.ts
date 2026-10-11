import { sql } from 'drizzle-orm';
import { pgTable, date, text, boolean, timestamp, uuid, integer, bigint, jsonb, unique, index, foreignKey, primaryKey, check, vector, customType, doublePrecision, real, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { CallState, Language, Limits, ServiceTier, Usage, Validation, Vendor } from '../ai/types';
import type { Sealed } from '../ai/funding';
import type { FactKind, IngestStage, KnowledgeCoverage, PoolQuestion, PoolVerification, Readiness } from '../services/knowledge/types';
import type { PreferenceFields } from '../../shared/contracts/workspace';
import type { VersionedQuestion, LearningAttempt, FlashcardReview } from '../../shared/contracts/learning';
import type { AnswerValue } from '../../shared/domain/types';
import type { ExamConfig } from '../../shared/domain/types';
import type { ExamRuntime } from '../../shared/contracts/exams';
import type { Availability, PlannedAssessment, PlannedSession, PlanProposal, CheckIn } from '../../shared/domain/types';
import type { TutorSession, TutorMessage, TutorMessageProvenance } from '../../shared/contracts/tutor';
/** Review summary kept with legacy workspace imports. */
type ImportReview = { id: string; state: 'review' | 'complete'; courses: number; materials: number; questions: number; sets: number; attempts: number; unsupported: string[]; courseIds?: string[] };
import type { BlockType, Citation, ConversionStatus, ConversionWarning, Pagination, ParsedBlock } from '../../shared/contracts/document';
import type { OutlineJobKind, OutlineJobResult, ScopeKind, ScopeSection, TopicDepth, TopicOrigin } from '../../shared/contracts/outline';

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Better Auth 1.7.7 core schema, with no optional plugins.
export const user = pgTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(), image: text('image'), ...timestamps(),
});
export const session = pgTable('session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(), ...timestamps(), ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [index('session_user_idx').on(t.userId)]);
export const account = pgTable('account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), ...timestamps(),
}, t => [index('account_user_idx').on(t.userId), unique('account_provider_identity_unique').on(t.providerId, t.accountId)]);
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), ...timestamps(),
}, t => [index('verification_identifier_idx').on(t.identifier)]);
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: text('owner_user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  // Who pays for AI work. Null means the platform.
  fundingSourceId: text('funding_source_id').references((): AnyPgColumn => fundingSources.id, { onDelete: 'set null' }),
  ...timestamps(),
});
export const preferences = pgTable('workspace_preferences', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  values: jsonb('values').$type<PreferenceFields>().notNull(), timezone: text('timezone').notNull().default('UTC'),
  revision: integer('revision').notNull().default(1), ...timestamps(),
}, t => [check('preferences_revision_positive', sql`${t.revision} > 0`)]);
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), description: text('description').notNull(),
  archived: boolean('archived').notNull().default(false),
  revision: integer('revision').notNull().default(1), createFingerprint: text('create_fingerprint').notNull(), ...timestamps(),
  // The course's one syllabus. New uploads to the syllabus slot are versions of this material.
  syllabusMaterialId: uuid('syllabus_material_id'),
  // Changes with every outline correction or job, so Undo applies only to the latest change.
  outlineRevision: integer('outline_revision').notNull().default(1),
}, t => [
  unique('courses_workspace_id_unique').on(t.workspaceId, t.id),
  foreignKey({ name: 'courses_syllabus_fk', columns: [t.workspaceId, t.id, t.syllabusMaterialId], foreignColumns: syllabusColumns() }),
  index('courses_workspace_list_idx').on(t.workspaceId, t.archived, t.id),
  check('courses_revision_positive', sql`${t.revision} > 0`),
]);
export const topics = pgTable('topics', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), courseId: uuid('course_id').notNull(),
  title: text('title').notNull(), summary: text('summary').notNull(),
  module: text('module').notNull(), order: integer('order').notNull(), revision: integer('revision').notNull().default(1), ...timestamps(),
  // Where the topic came from, the blocks it was read from, and whether the student changed it.
  origin: text('origin').$type<TopicOrigin>().notNull().default('student'),
  source: jsonb('source').$type<Citation>(), edited: boolean('edited').notNull().default(false),
}, t => [
  unique('topics_scope_id_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }).onDelete('cascade'),
  index('topics_course_order_idx').on(t.workspaceId, t.courseId, t.order, t.id),
  check('topics_revision_positive', sql`${t.revision} > 0`),
  check('topics_origin_valid', sql`${t.origin} in ('syllabus', 'materials', 'student')`),
]);

function syllabusColumns(): [AnyPgColumn, AnyPgColumn, AnyPgColumn] {
  return [materials.workspaceId, materials.courseId, materials.id];
}
const materialScope = () => ({ workspaceId: uuid('workspace_id').notNull(), courseId: uuid('course_id').notNull() });
function currentVersionColumns(): [AnyPgColumn, AnyPgColumn, AnyPgColumn, AnyPgColumn] {
  return [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id];
}
export const materials = pgTable('materials', {
  id: uuid('id').primaryKey(), ...materialScope(), title: text('title').notNull(), kind: text('kind').notNull(),
  attribution: text('attribution').notNull(), archived: boolean('archived').notNull().default(false),
  currentVersionId: uuid('current_version_id').references((): AnyPgColumn => materialVersions.id),
  revision: integer('revision').notNull().default(1), createFingerprint: text('create_fingerprint').notNull(), ...timestamps(),
}, t => [
  unique('materials_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ name: 'materials_current_version_scope_fk', columns: [t.workspaceId, t.courseId, t.id, t.currentVersionId], foreignColumns: currentVersionColumns() }),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  index('materials_list_idx').on(t.workspaceId, t.courseId, t.archived, t.id),
  check('materials_revision_positive', sql`${t.revision} > 0`),
  check('materials_kind_valid', sql`${t.kind} in ('reading', 'slides', 'other', 'syllabus')`),
]);
export const fileObjects = pgTable('file_objects', {
  id: uuid('id').primaryKey(), ...materialScope(), key: text('key').notNull().unique(),
  size: bigint('size', { mode: 'number' }).notNull(), detectedType: text('detected_type').notNull(),
  checksum: text('checksum').notNull(), etag: text('etag').notNull(), fileName: text('file_name').notNull(),
  // Originals are uploads. Assets are images extracted by conversion, raw is a provider response.
  role: text('role').$type<'original' | 'asset' | 'raw'>().notNull().default('original'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('objects_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  check('objects_size_positive', sql`${t.size} > 0`),
  check('objects_role_valid', sql`${t.role} in ('original', 'asset', 'raw')`),
]);
export const materialVersions = pgTable('material_versions', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), number: integer('number').notNull(),
  requestId: uuid('request_id').notNull().unique(), fingerprint: text('fingerprint').notNull(),
  origin: text('origin').$type<'paste' | 'upload'>().notNull(), sourceObjectId: uuid('source_object_id'), format: text('format').notNull(),
  // The conversion that produced this version's blocks.
  schemaVersion: integer('schema_version').notNull(), adapter: text('adapter').$type<'markdown' | 'datalab'>().notNull(), adapterVersion: text('adapter_version').notNull(),
  status: text('status').$type<ConversionStatus>().notNull(), failedPages: integer('failed_pages').array().notNull().default(sql`'{}'::integer[]`),
  warnings: jsonb('warnings').$type<ConversionWarning[]>().notNull().default([]), failure: text('failure'), rawObjectId: uuid('raw_object_id'),
  pageCount: integer('page_count'), pagination: text('pagination').$type<Pagination>().notNull(),
  // Detected when the knowledge layer is built. Prompts and search configuration follow it.
  language: text('language').$type<Language>().notNull().default('en'),
  // Asynchronous conversion job. A lease fences workers, attempts count provider submissions,
  // and completion failures count results that arrived but could not be saved.
  providerRequestId: text('provider_request_id'), attempts: integer('attempts').notNull().default(0),
  completionFailures: integer('completion_failures').notNull().default(0),
  leaseToken: uuid('lease_token'), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  nextPollAt: timestamp('next_poll_at', { withTimezone: true }), submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index('versions_conversion_idx').on(t.status, t.nextPollAt),
  unique('versions_scope_unique').on(t.workspaceId, t.courseId, t.materialId, t.id),
  unique('versions_material_number_unique').on(t.materialId, t.number),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId], foreignColumns: [materials.workspaceId, materials.courseId, materials.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.sourceObjectId], foreignColumns: [fileObjects.workspaceId, fileObjects.courseId, fileObjects.id] }),
  foreignKey({ name: 'versions_raw_object_fk', columns: [t.workspaceId, t.courseId, t.rawObjectId], foreignColumns: [fileObjects.workspaceId, fileObjects.courseId, fileObjects.id] }),
  check('versions_number_positive', sql`${t.number} > 0`),
  check('versions_status_valid', sql`${t.status} in ('pending', 'processing', 'ready', 'partial', 'failed')`),
  check('versions_adapter_valid', sql`${t.adapter} in ('markdown', 'datalab')`),
  check('versions_pagination_valid', sql`${t.pagination} in ('source', 'slides', 'converted', 'none')`),
  check('versions_origin_valid', sql`${t.origin} in ('paste', 'upload')`),
]);
// Blocks are immutable once their version is ready or partial. Ids are stable only within a version.
export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), versionId: uuid('version_id').notNull(),
  ordinal: integer('ordinal').notNull(), parentId: uuid('parent_id'), type: text('type').$type<BlockType>().notNull(),
  content: jsonb('content').$type<ParsedBlock['content']>().notNull(), sources: jsonb('sources').$type<ParsedBlock['sources']>().notNull(), flags: jsonb('flags').$type<ParsedBlock['flags']>().notNull(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId, t.versionId], foreignColumns: [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id] }),
  unique('blocks_scope_unique').on(t.workspaceId, t.courseId, t.materialId, t.versionId, t.id), unique('blocks_ordinal_unique').on(t.versionId, t.ordinal),
  check('blocks_type_valid', sql`${t.type} in ('heading', 'paragraph', 'list', 'table', 'equation', 'figure', 'code', 'quote')`),
  check('blocks_ordinal_nonnegative', sql`${t.ordinal} >= 0`),
]);
/**
 * Topics are labels over sections, rebuildable at any time. A row says how deeply a section of a
 * material treats a topic. It names the section by its key, so it follows the section to a new
 * version of the material. A student's own link or removal survives every rebuild.
 */
export const topicSections = pgTable('topic_sections', {
  ...materialScope(), topicId: uuid('topic_id').notNull(), materialId: uuid('material_id').notNull(), sectionKey: text('section_key').notNull(),
  depth: text('depth').$type<TopicDepth>().notNull(),
  origin: text('origin').$type<'suggested' | 'student'>().notNull(), removed: boolean('removed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  primaryKey({ columns: [t.topicId, t.materialId, t.sectionKey] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.topicId], foreignColumns: [topics.workspaceId, topics.courseId, topics.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId], foreignColumns: [materials.workspaceId, materials.courseId, materials.id] }).onDelete('cascade'),
  index('topic_sections_material_idx').on(t.workspaceId, t.materialId, t.sectionKey),
  check('topic_sections_depth_valid', sql`${t.depth} in ('introduces', 'covers', 'mentions')`),
  check('topic_sections_origin_valid', sql`${t.origin} in ('suggested', 'student')`),
]);
export const workspaceStorage = pgTable('workspace_storage', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id),
  usedBytes: bigint('used_bytes', { mode: 'number' }).notNull().default(0), reservedBytes: bigint('reserved_bytes', { mode: 'number' }).notNull().default(0),
  pendingCount: integer('pending_count').notNull().default(0),
}, t => [check('storage_nonnegative', sql`${t.usedBytes} >= 0 and ${t.reservedBytes} >= 0 and ${t.pendingCount} >= 0`)]);
export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), isNew: boolean('is_new').notNull(),
  fingerprint: text('fingerprint').notNull(), fields: jsonb('fields').$type<{ title: string; kind: string; attribution: string }>().notNull(),
  expectedRevision: integer('expected_revision'), expectedSize: bigint('expected_size', { mode: 'number' }).notNull(), expectedType: text('expected_type').notNull(),
  checksum: text('checksum').notNull(), fileName: text('file_name').notNull(), stagingKey: text('staging_key').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), state: text('state').$type<'pending' | 'ready' | 'failed'>().notNull().default('pending'),
  leaseToken: uuid('lease_token'), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  resultVersionId: uuid('result_version_id').unique(), failure: text('failure'), stagingCleanedAt: timestamp('staging_cleaned_at', { withTimezone: true }), ...timestamps(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId, t.resultVersionId], foreignColumns: [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id] }),
  check('uploads_state_valid', sql`${t.state} in ('pending', 'ready', 'failed')`),
  index('uploads_maintenance_idx').on(t.state, t.expiresAt),
]);
// Attempts are recorded before R2 transfer. Cleanup and publication lock the upload row.
export const uploadCandidates = pgTable('upload_candidates', {
  token: uuid('token').primaryKey(), uploadId: uuid('upload_id').notNull().references(() => uploads.id),
  key: text('key').notNull().unique(), state: text('state').$type<'candidate' | 'published' | 'deleting'>().notNull().default('candidate'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), cleanedAt: timestamp('cleaned_at', { withTimezone: true }),
}, t => [check('candidates_state_valid', sql`${t.state} in ('candidate', 'published', 'deleting')`)]);

export const questionVersions = pgTable('question_versions', {
  id: uuid('id').primaryKey(), ...materialScope(), content: jsonb('content').$type<VersionedQuestion>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('questions_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  index('questions_course_idx').on(t.workspaceId, t.courseId, t.id)]);
export const questionSources = pgTable('question_sources', {
  ...materialScope(), questionId: uuid('question_id').primaryKey(), materialId: uuid('material_id').notNull(), versionId: uuid('version_id').notNull(),
  // Validated against the version's blocks on insert. An array cannot carry a foreign key.
  blockIds: uuid('block_ids').array().notNull(),
}, t => [foreignKey({ columns: [t.workspaceId, t.courseId, t.questionId], foreignColumns: [questionVersions.workspaceId, questionVersions.courseId, questionVersions.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId, t.versionId], foreignColumns: [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id] })]);
export const learningSets = pgTable('learning_sets', {
  id: uuid('id').primaryKey(), ...materialScope(), name: text('name').notNull(), archived: boolean('archived').notNull().default(false),
  revision: integer('revision').notNull().default(1), fingerprint: text('fingerprint').notNull(),
  feedback: text('feedback').$type<'immediate' | 'end'>().notNull(), hintsAllowed: boolean('hints_allowed').notNull(), ...timestamps(),
  purpose: text('purpose').$type<'practice' | 'exam'>().notNull().default('practice'),
  remediatesAttemptId: uuid('remediates_attempt_id'),
}, t => [unique('sets_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  index('sets_course_idx').on(t.workspaceId, t.courseId, t.archived, t.id)]);
export const setItems = pgTable('set_items', {
  id: uuid('id').primaryKey(), ...materialScope(), setId: uuid('set_id').notNull(), questionId: uuid('question_id').notNull(), position: integer('position').notNull(),
}, t => [unique('set_items_scope_unique').on(t.workspaceId, t.courseId, t.setId, t.id), unique('set_items_order_unique').on(t.setId, t.position),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.setId], foreignColumns: [learningSets.workspaceId, learningSets.courseId, learningSets.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.questionId], foreignColumns: [questionVersions.workspaceId, questionVersions.courseId, questionVersions.id] })]);
export const learningRuns = pgTable('learning_runs', {
  id: uuid('id').primaryKey(), ...materialScope(), setId: uuid('set_id').notNull(), title: text('title').notNull(),
  state: text('state').$type<'active' | 'submitted'>().notNull().default('active'), revision: integer('revision').notNull().default(1), position: integer('position').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp('completed_at', { withTimezone: true }),
  plannedSessionId: uuid('planned_session_id'),
  sampleDataset: text('sample_dataset'),
  flashcardReview: jsonb('flashcard_review').$type<FlashcardReview>(),
  exam: jsonb('exam').$type<ExamRuntime>(), deadlineAt: timestamp('deadline_at', { withTimezone: true }),
}, t => [unique('runs_scope_unique').on(t.workspaceId, t.courseId, t.setId, t.id),
  foreignKey({ name: 'runs_planner_scope_fk', columns: [t.workspaceId, t.courseId, t.plannedSessionId], foreignColumns: [plannedSessions.workspaceId, plannedSessions.courseId, plannedSessions.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.setId], foreignColumns: [learningSets.workspaceId, learningSets.courseId, learningSets.id] }),
  index('runs_expiry_idx').on(t.state, t.deadlineAt, t.id), index('runs_workspace_idx').on(t.workspaceId, t.state, t.id), check('runs_state_valid', sql`${t.state} in ('active', 'submitted')`)]);
export const runAnswers = pgTable('run_answers', {
  ...materialScope(), runId: uuid('run_id').notNull(), setId: uuid('set_id').notNull(), itemId: uuid('item_id').notNull(),
  response: jsonb('response').$type<AnswerValue>().notNull(), checked: boolean('checked').notNull().default(false), revealed: boolean('revealed').notNull().default(false), hinted: boolean('hinted').notNull().default(false),
}, t => [primaryKey({ columns: [t.runId, t.itemId] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.setId, t.runId], foreignColumns: [learningRuns.workspaceId, learningRuns.courseId, learningRuns.setId, learningRuns.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.setId, t.itemId], foreignColumns: [setItems.workspaceId, setItems.courseId, setItems.setId, setItems.id] })]);
export const learningAttempts = pgTable('learning_attempts', {
  id: uuid('id').primaryKey(), ...materialScope(), runId: uuid('run_id').notNull().unique(), setId: uuid('set_id').notNull(),
  snapshot: jsonb('snapshot').$type<LearningAttempt>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('attempts_scope_unique').on(t.workspaceId, t.courseId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId, t.setId, t.runId], foreignColumns: [learningRuns.workspaceId, learningRuns.courseId, learningRuns.setId, learningRuns.id] }),
  index('attempts_course_idx').on(t.workspaceId, t.courseId, t.id), index('attempts_chronology_idx').on(t.workspaceId, t.courseId, sql`(${t.snapshot}->>'completedAt')`, t.id)]);
export const learningOperations = pgTable('learning_operations', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), id: uuid('id').notNull(),
  fingerprint: text('fingerprint').notNull(), result: jsonb('result').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })]);
export const examConfigs = pgTable('exam_configs', {
  id: uuid('id').primaryKey(), ...materialScope(), config: jsonb('config').$type<ExamConfig>().notNull(),
  archived: boolean('archived').notNull().default(false), revision: integer('revision').notNull().default(1), ...timestamps(),
}, t => [foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('exam_configs_scope_idx').on(t.workspaceId, t.courseId, t.id)]);
export const plannerState = pgTable('planner_state', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id),
  availability: jsonb('availability').$type<Availability>().notNull(), revision: integer('revision').notNull().default(1),
});
export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey(), ...materialScope(), date: date('date', { mode: 'string' }), content: jsonb('content').$type<PlannedAssessment>().notNull(), revision: integer('revision').notNull().default(1),
  // The syllabus blocks it was read from. A re-read leaves edited assessments alone.
  source: jsonb('source').$type<Citation>(), edited: boolean('edited').notNull().default(true),
}, t => [foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('assessments_scope_idx').on(t.workspaceId, t.courseId), unique('assessments_scope_unique').on(t.workspaceId, t.courseId, t.id)]);
export const plannedSessions = pgTable('planned_sessions', {
  assessmentId: uuid('assessment_id').generatedAlwaysAs(sql`(content->>'assessmentId')::uuid`),
  status: text('status').generatedAlwaysAs(sql`content->>'status'`),
  activity: text('activity').generatedAlwaysAs(sql`content->>'activity'`),
  id: uuid('id').primaryKey(), ...materialScope(), date: date('date', { mode: 'string' }).notNull(), content: jsonb('content').$type<PlannedSession>().notNull(), revision: integer('revision').notNull().default(1),
}, t => [unique('planned_sessions_scope_unique').on(t.workspaceId, t.courseId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('planned_sessions_scope_idx').on(t.workspaceId, t.courseId), foreignKey({ name: 'planned_assessment_scope_fk', columns: [t.workspaceId, t.courseId, t.assessmentId], foreignColumns: [assessments.workspaceId, assessments.courseId, assessments.id] })]);
export const checkIns = pgTable('check_ins', {
  courseId: uuid('course_id').generatedAlwaysAs(sql`(content->>'courseId')::uuid`),
  at: text('at').generatedAlwaysAs(sql`content->>'at'`),
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), content: jsonb('content').$type<CheckIn>().notNull(),
}, t => [index('check_ins_scope_idx').on(t.workspaceId), foreignKey({ name: 'check_in_course_scope_fk', columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] })]);
export const planProposals = pgTable('plan_proposals', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), baseRevision: integer('base_revision').notNull(),
  proposal: jsonb('proposal').$type<PlanProposal>().notNull(), fingerprint: text('fingerprint').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const tutorSessions = pgTable('tutor_sessions', {
  id: uuid('id').primaryKey(), ...materialScope(), topicId: uuid('topic_id'), topicLabel: text('topic_label'), title: text('title').notNull(),
  archived: boolean('archived').notNull().default(false), revision: integer('revision').notNull().default(1), stage: text('stage').$type<TutorSession['stage']>().notNull().default('orient'),
  source: jsonb('source').$type<TutorSession['source']>(), review: jsonb('review').$type<TutorSession['review']>(), ...timestamps(),
  plannedSessionId: uuid('planned_session_id'), completedLearning: boolean('completed_learning').notNull().default(false),
  sampleDataset: text('sample_dataset'),
  imported: boolean('imported').notNull().default(false), endedAt: timestamp('ended_at', { withTimezone: true }),
  // Older turns, summarised so a long session sends recent turns verbatim and the rest briefly.
  historySummary: text('history_summary'), summarisedThrough: integer('summarised_through').notNull().default(-1),
}, t => [unique('tutor_sessions_scope_unique').on(t.workspaceId, t.courseId, t.id), foreignKey({ name: 'tutor_planner_scope_fk', columns: [t.workspaceId, t.courseId, t.plannedSessionId], foreignColumns: [plannedSessions.workspaceId, plannedSessions.courseId, plannedSessions.id] }), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('tutor_sessions_scope_idx').on(t.workspaceId, t.courseId, t.id), index('tutor_chronology_idx').on(t.workspaceId, t.courseId, t.createdAt, t.id)]);
export const tutorMessages = pgTable('tutor_messages', {
  id: uuid('id').primaryKey(), ...materialScope(), sessionId: uuid('session_id').notNull(), ordinal: integer('ordinal').notNull(),
  text: text('text').notNull(), role: text('role').$type<'student' | 'tutor'>().notNull(), state: text('state').$type<TutorMessage['state']>().notNull(),
  operationId: uuid('operation_id').notNull().unique(), failure: text('failure'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  provenance: jsonb('provenance').$type<TutorMessageProvenance>(),
}, t => [unique('tutor_message_order_unique').on(t.sessionId, t.ordinal), foreignKey({ columns: [t.workspaceId, t.courseId, t.sessionId], foreignColumns: [tutorSessions.workspaceId, tutorSessions.courseId, tutorSessions.id] })]);
export const workspaceImports = pgTable('workspace_imports', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), fingerprint: text('fingerprint').notNull(),
  original: jsonb('original').$type<unknown>().notNull(), review: jsonb('review').$type<ImportReview>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('imports_deduplicate').on(t.workspaceId, t.fingerprint)]);
export const reminderStates = pgTable('reminder_states', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), key: text('key').notNull(), status: text('status').$type<'read' | 'dismissed'>().notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.key] })]);
export const aiOperations = pgTable('ai_operations', {
  id: uuid('id').primaryKey(), ...materialScope(), task: text('task').$type<'tutor' | 'generate' | 'grade' | OutlineJobKind>().notNull(),
  targetId: uuid('target_id').notNull(), fingerprint: text('fingerprint').notNull(), input: jsonb('input').$type<unknown>().notNull(),
  // One lifecycle: queued, running, complete, failed, cancelled, or uncertain when a provider call
  // may have been charged without a result. Uncertain work is never repeated automatically.
  state: text('state').$type<'queued' | 'blocked' | 'running' | 'complete' | 'failed' | 'cancelled' | 'interrupted' | 'uncertain'>().notNull(),
  model: text('model'), promptVersion: text('prompt_version').notNull(), reason: text('reason'),
  activeExecutionId: uuid('active_execution_id'), result: jsonb('result').$type<unknown>(), ...timestamps(),
}, t => [unique('ai_operations_scope_unique').on(t.workspaceId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('ai_operations_target_idx').on(t.workspaceId, t.targetId, t.createdAt)]);
/**
 * Structured outline work: reading the syllabus, mapping a material's sections to topics, and
 * drafting an outline from materials. Jobs advance like conversions, under a short lease.
 */
export const outlineJobs = pgTable('outline_jobs', {
  id: uuid('id').primaryKey(), ...materialScope(), kind: text('kind').$type<OutlineJobKind>().notNull(),
  materialId: uuid('material_id'), versionId: uuid('version_id'),
  state: text('state').$type<'queued' | 'running' | 'done' | 'failed'>().notNull().default('queued'),
  leaseToken: uuid('lease_token'), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0), nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  result: jsonb('result').$type<OutlineJobResult>(), failure: text('failure'), ...timestamps(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  index('outline_jobs_due_idx').on(t.state, t.nextRunAt),
  index('outline_jobs_course_idx').on(t.workspaceId, t.courseId, t.createdAt),
  check('outline_jobs_kind_valid', sql`${t.kind} in ('read_syllabus', 'assign_topics')`),
  check('outline_jobs_state_valid', sql`${t.state} in ('queued', 'running', 'done', 'failed')`),
]);

/** What one outline correction changed, so its Undo can put it back. */
export const outlineChanges = pgTable('outline_changes', {
  id: uuid('id').primaryKey(), ...materialScope(), afterRevision: integer('after_revision').notNull(),
  undo: jsonb('undo').$type<unknown>().notNull(), undone: boolean('undone').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] })]);

// Explicit development provenance, never used by startup or authentication.
export const developmentSeeds = pgTable('development_seeds', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  version: text('version').notNull(), anchorDate: date('anchor_date', { mode: 'string' }).notNull(),
  timezone: text('timezone').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.version] })]);
export const developmentSeedRecords = pgTable('development_seed_records', {
  workspaceId: uuid('workspace_id').notNull(), version: text('version').notNull(), key: text('key').notNull(),
  entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(),
  baseline: text('baseline').notNull(), result: jsonb('result').$type<unknown>().notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.version, t.key] }),
  foreignKey({ columns: [t.workspaceId, t.version], foreignColumns: [developmentSeeds.workspaceId, developmentSeeds.version] }),
  index('seed_records_entity_idx').on(t.workspaceId, t.entityType, t.entityId)]);

/**
 * Who pays for AI work and on what terms: the platform, an institution's account or quota, or a
 * student's own key. Credentials are sealed, or `env` for the platform's Worker secrets.
 */
export const fundingSources = pgTable('funding_sources', {
  id: text('id').primaryKey(), kind: text('kind').$type<'platform' | 'institution' | 'user'>().notNull(), label: text('label').notNull(),
  // A student's own key belongs to their workspace. Platform and institution sources are shared.
  ownerWorkspaceId: uuid('owner_workspace_id').references((): AnyPgColumn => workspaces.id, { onDelete: 'cascade' }),
  credentials: jsonb('credentials').$type<Sealed | 'env'>().notNull(),
  vendors: jsonb('vendors').$type<Vendor[]>().notNull(),
  // Null allows every route the vendors serve.
  routes: jsonb('routes').$type<string[] | null>(),
  // The source's own limits, and for a shared source each workspace's share.
  limits: jsonb('limits').$type<Limits>().notNull(), perWorkspace: jsonb('per_workspace').$type<Limits | null>(),
  // `none` admits only routes that keep no prompts. Student content stays on those unless widened here.
  retention: text('retention').$type<'none' | 'standard'>().notNull(), studentRetention: text('student_retention').$type<'none' | 'standard'>().notNull().default('none'),
  active: boolean('active').notNull().default(true), ...timestamps(),
}, t => [
  check('funding_kind_valid', sql`${t.kind} in ('platform', 'institution', 'user')`),
  check('funding_retention_valid', sql`${t.retention} in ('none', 'standard') and ${t.studentRetention} in ('none', 'standard')`),
  // One own key per workspace.
  unique('funding_owner_kind_unique').on(t.ownerWorkspaceId, t.kind),
]);
/**
 * One provider call: the meter and the trace together. A call is reserved before it is sent and
 * settled from its usage after. An uncertain outcome stays charged at its reservation.
 */
export const aiCalls = pgTable('ai_calls', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fundingSourceId: text('funding_source_id').references(() => fundingSources.id, { onDelete: 'set null' }),
  // The student-facing operation or background job the call serves, when there is one.
  operationId: uuid('operation_id'), jobId: uuid('job_id'),
  task: text('task').notNull(), step: integer('step').notNull().default(0),
  vendor: text('vendor').$type<Vendor>().notNull(), model: text('model').notNull(), region: text('region').notNull(),
  serviceTier: text('service_tier').$type<ServiceTier>().notNull().default('standard'), language: text('language').$type<Language>().notNull(),
  state: text('state').$type<CallState>().notNull(),
  reservedMicros: bigint('reserved_micros', { mode: 'number' }).notNull(), chargedMicros: bigint('charged_micros', { mode: 'number' }),
  usage: jsonb('usage').$type<Usage>(), latencyMs: integer('latency_ms'), ttftMs: integer('ttft_ms'),
  validation: text('validation').$type<Validation>(), error: text('error'), partial: text('partial').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), settledAt: timestamp('settled_at', { withTimezone: true }),
}, t => [
  index('ai_calls_budget_idx').on(t.workspaceId, t.createdAt), index('ai_calls_source_idx').on(t.fundingSourceId, t.createdAt), index('ai_calls_open_idx').on(t.state, t.createdAt),
  index('ai_calls_health_idx').on(t.vendor, t.model, t.createdAt), index('ai_calls_operation_idx').on(t.operationId),
  check('ai_calls_state_valid', sql`${t.state} in ('reserved', 'settled', 'ambiguous', 'released')`),
  check('ai_calls_reservation_nonnegative', sql`${t.reservedMicros} >= 0 AND (${t.chargedMicros} IS NULL OR ${t.chargedMicros} >= 0)`),
]);

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const versionScope = () => ({ ...materialScope(), materialId: uuid('material_id').notNull(), versionId: uuid('version_id').notNull() });
const versionFk = (t: { workspaceId: AnyPgColumn; courseId: AnyPgColumn; materialId: AnyPgColumn; versionId: AnyPgColumn }) =>
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId, t.versionId], foreignColumns: [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id] }).onDelete('cascade');

/**
 * Builds a version's knowledge layer once, in stages, under a lease. A newer version of the
 * same material supersedes a waiting job. Progress lets a large version continue across steps.
 */
export const ingestJobs = pgTable('ingest_jobs', {
  id: uuid('id').primaryKey(), ...versionScope(),
  state: text('state').$type<'queued' | 'running' | 'done' | 'failed' | 'superseded'>().notNull().default('queued'),
  stage: text('stage').$type<IngestStage>().notNull().default('structure'),
  progress: jsonb('progress').$type<{ cursor: number }>().notNull().default({ cursor: 0 }),
  // Readable once its blocks exist. Searchable once every block is in a chunk. Enriched once
  // embeddings, digests, facts and figure descriptions are complete too. Coverage says what is
  // missing, so a gap is never hidden.
  readiness: text('readiness').$type<Readiness>().notNull().default('readable'),
  coverage: jsonb('coverage').$type<KnowledgeCoverage>().notNull().default({}),
  // The structure, chunking, embedding and digest configuration the layer was built with. A change rebuilds it.
  indexVersion: text('index_version').notNull().default(''),
  leaseToken: uuid('lease_token'), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0), nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  failure: text('failure'), ...timestamps(),
}, t => [
  unique('ingest_jobs_version_unique').on(t.versionId), versionFk(t), index('ingest_jobs_due_idx').on(t.state, t.nextRunAt),
  check('ingest_jobs_state_valid', sql`${t.state} in ('queued', 'running', 'done', 'failed', 'superseded')`),
  check('ingest_jobs_stage_valid', sql`${t.stage} in ('structure', 'embed', 'digest', 'figures', 'repair', 'done')`),
  check('ingest_jobs_readiness_valid', sql`${t.readiness} in ('readable', 'searchable', 'enriched')`),
]);
/**
 * A section of one version: a heading and the blocks under it up to the next heading of any
 * level, or the lead before the first heading. Sections do not overlap. The key is the heading
 * path, so a section keeps its identity when its material is replaced, and scopes and topics
 * that name it follow it to the new version.
 */
export const sections = pgTable('sections', {
  id: uuid('id').primaryKey(), ...versionScope(), ordinal: integer('ordinal').notNull(),
  key: text('key').notNull(), headingBlockId: uuid('heading_block_id'), heading: text('heading').notNull(), path: jsonb('path').$type<string[]>().notNull(),
  level: integer('level').notNull(), blockIds: jsonb('block_ids').$type<string[]>().notNull(), tokens: integer('tokens').notNull(),
  // The section's text, hashed with the digest prompt version, so an unchanged section is never read twice.
  contentHash: text('content_hash').notNull(),
  summary: text('summary'), keyTerms: jsonb('key_terms').$type<string[]>().notNull().default([]), digestedBy: text('digested_by'),
  language: text('language').$type<Language>().notNull(),
  // When topic assignment last looked at this section, so a section that fits no topic is not sent again.
  topicsAt: timestamp('topics_at', { withTimezone: true }),
}, t => [
  versionFk(t), unique('sections_version_key_unique').on(t.versionId, t.key), unique('sections_version_order_unique').on(t.versionId, t.ordinal),
  index('sections_course_idx').on(t.workspaceId, t.courseId, t.materialId, t.key), index('sections_hash_idx').on(t.workspaceId, t.contentHash),
]);
/**
 * Atomic, typed facts with a pointer to where they are stated. Code builds questions from them,
 * so each carries how it was extracted and how far its source text bears it out.
 */
export const facts = pgTable('facts', {
  id: uuid('id').primaryKey(), ...versionScope(), sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<FactKind>().notNull(),
  // The term defined, the quantity measured, the process ordered or the formula named.
  subject: text('subject').notNull(), text: text('text').notNull(),
  value: doublePrecision('value'), unit: text('unit'), items: jsonb('items').$type<string[]>(),
  blockIds: jsonb('block_ids').$type<string[]>().notNull(), position: integer('position').notNull(),
  confidence: real('confidence').notNull(), extractor: text('extractor').notNull(), language: text('language').$type<Language>().notNull(),
}, t => [
  versionFk(t), index('facts_section_idx').on(t.sectionId, t.kind),
  check('facts_kind_valid', sql`${t.kind} in ('fact', 'definition', 'number', 'steps', 'formula')`),
  check('facts_confidence_range', sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
]);
/**
 * What a section builds on, read from the material: a term it uses that an earlier section
 * defines, or an explicit reference to an earlier part. Rebuilt for a course whenever one of its
 * current versions changes.
 */
export const prerequisites = pgTable('prerequisites', {
  ...materialScope(), sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  requiresId: uuid('requires_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  reason: text('reason').$type<'term' | 'reference'>().notNull(), detail: text('detail').notNull(),
}, t => [
  primaryKey({ columns: [t.sectionId, t.requiresId] }), index('prerequisites_course_idx').on(t.workspaceId, t.courseId),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }).onDelete('cascade'),
  check('prerequisites_reason_valid', sql`${t.reason} in ('term', 'reference')`),
]);
/** Retrieval units: consecutive blocks of one section, searched by text and by embedding. */
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey(), ...versionScope(), ordinal: integer('ordinal').notNull(),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  heading: text('heading').notNull(), blockIds: jsonb('block_ids').$type<string[]>().notNull(),
  text: text('text').notNull(), language: text('language').$type<Language>().notNull(), tokens: integer('tokens').notNull(),
  search: tsvector('search').notNull(), embedding: vector('embedding', { dimensions: 768 }), embeddingModel: text('embedding_model'),
  // `figure` is a generated description of a figure, never the material's own words.
  kind: text('kind').$type<'text' | 'figure'>().notNull().default('text'),
  // Conversion was unsure of some text here, so it is not used to write questions.
  uncertain: boolean('uncertain').notNull().default(false),
}, t => [
  check('knowledge_chunks_kind_valid', sql`${t.kind} in ('text', 'figure')`),
  versionFk(t), unique('knowledge_chunks_order_unique').on(t.versionId, t.ordinal),
  index('knowledge_chunks_scope_idx').on(t.workspaceId, t.courseId, t.versionId), index('knowledge_chunks_section_idx').on(t.sectionId),
  index('knowledge_chunks_search_idx').using('gin', t.search),
  index('knowledge_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
]);
/** One description per figure, written once from the image. */
export const figureDescriptions = pgTable('figure_descriptions', {
  blockId: uuid('block_id').primaryKey(), ...versionScope(), description: text('description').notNull(),
  language: text('language').$type<Language>().notNull(), model: text('model').notNull(),
}, t => [versionFk(t)]);
/**
 * Checked candidate questions. The key is version, section, format, difficulty and prompt version,
 * never the workspace, so a cohort can share a pool once organisations exist.
 */
export const questionPool = pgTable('question_pool', {
  id: uuid('id').primaryKey(), ...versionScope(), sectionBlockId: uuid('section_block_id'),
  cacheKey: text('cache_key').notNull(), format: text('format').notNull(), difficulty: text('difficulty').notNull(),
  language: text('language').$type<Language>().notNull(), content: jsonb('content').$type<PoolQuestion>().notNull(),
  blockIds: jsonb('block_ids').$type<string[]>().notNull(), verification: jsonb('verification').$type<PoolVerification>().notNull(),
  state: text('state').$type<'verified' | 'rejected'>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [versionFk(t), index('question_pool_key_idx').on(t.cacheKey, t.state), check('question_pool_state_valid', sql`${t.state} in ('verified', 'rejected')`)]);
/**
 * What a student is working on: a topic, a selection of sections, an assessment or the whole
 * course. Tutor sessions and practice take a scope. A scope ranks its sections first and never
 * limits what can be found. Topic and assessment scopes read their sections live, so a rebuilt
 * outline or a replaced material changes them with it.
 */
export const scopes = pgTable('scopes', {
  id: uuid('id').primaryKey(), ...materialScope(), name: text('name').notNull(), kind: text('kind').$type<ScopeKind>().notNull(),
  topicId: uuid('topic_id'), assessmentId: uuid('assessment_id'),
  sections: jsonb('sections').$type<ScopeSection[]>().notNull().default([]),
  archived: boolean('archived').notNull().default(false), revision: integer('revision').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }), ...timestamps(),
}, t => [
  unique('scopes_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.topicId], foreignColumns: [topics.workspaceId, topics.courseId, topics.id] }).onDelete('cascade'),
  foreignKey({ name: 'scopes_assessment_fk', columns: [t.workspaceId, t.courseId, t.assessmentId], foreignColumns: [assessments.workspaceId, assessments.courseId, assessments.id] }).onDelete('cascade'),
  uniqueIndex('scopes_topic_unique').on(t.courseId, t.topicId).where(sql`${t.kind} = 'topic'`),
  uniqueIndex('scopes_assessment_unique').on(t.courseId, t.assessmentId).where(sql`${t.kind} = 'assessment'`),
  uniqueIndex('scopes_course_unique').on(t.courseId).where(sql`${t.kind} = 'course'`),
  index('scopes_list_idx').on(t.workspaceId, t.courseId, t.archived),
  check('scopes_kind_valid', sql`${t.kind} in ('topic', 'sections', 'assessment', 'course')`),
]);
