import { sql } from 'drizzle-orm';
import { pgTable, date, text, boolean, timestamp, uuid, integer, bigint, jsonb, unique, index, foreignKey, primaryKey, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PreferenceFields } from '../../src/shared/online';
import type { VersionedQuestion, LearningAttempt } from '../../src/shared/learning';
import type { AnswerValue } from '../../src/shared/types';
import type { ExamConfig } from '../../src/shared/types';
import type { ExamRuntime } from '../../src/shared/online-exams';
import type { Availability, PlannedAssessment, PlannedSession, PlanProposal, CheckIn } from '../../src/shared/types';
import type { OnlineTutorSession, OnlineTutorMessage } from '../../src/shared/online-tutor';
import type { ImportReview } from '../../src/shared/transfer';
import type { WrittenGrading } from '../../src/shared/types';

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
}, t => [index('account_user_idx').on(t.userId)]);
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), ...timestamps(),
}, t => [index('verification_identifier_idx').on(t.identifier)]);
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: text('owner_user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps(),
});
export const preferences = pgTable('workspace_preferences', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  values: jsonb('values').$type<PreferenceFields>().notNull(), timezone: text('timezone').notNull().default('UTC'),
  revision: integer('revision').notNull().default(1), ...timestamps(),
}, t => [check('preferences_revision_positive', sql`${t.revision} > 0`)]);
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), description: text('description').notNull(), goal: text('goal').notNull(),
  accent: text('accent').$type<PreferenceFields['accent']>().notNull(), archived: boolean('archived').notNull().default(false),
  revision: integer('revision').notNull().default(1), createFingerprint: text('create_fingerprint').notNull(), ...timestamps(),
}, t => [
  unique('courses_workspace_id_unique').on(t.workspaceId, t.id),
  index('courses_workspace_list_idx').on(t.workspaceId, t.archived, t.id),
  check('courses_revision_positive', sql`${t.revision} > 0`),
  check('courses_accent_valid', sql`${t.accent} in ('indigo', 'amber', 'teal', 'rose', 'violet')`),
]);
export const topics = pgTable('topics', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), courseId: uuid('course_id').notNull(),
  title: text('title').notNull(), summary: text('summary').notNull(), priority: text('priority').$type<'low' | 'normal' | 'high'>().notNull(),
  module: text('module').notNull(), order: integer('order').notNull(), revision: integer('revision').notNull().default(1), ...timestamps(),
}, t => [
  unique('topics_scope_id_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }).onDelete('cascade'),
  index('topics_course_order_idx').on(t.workspaceId, t.courseId, t.order, t.id),
  check('topics_revision_positive', sql`${t.revision} > 0`),
  check('topics_priority_valid', sql`${t.priority} in ('low', 'normal', 'high')`),
]);
export const topicLinks = pgTable('topic_links', {
  workspaceId: uuid('workspace_id').notNull(), courseId: uuid('course_id').notNull(),
  sourceId: uuid('source_id').notNull(), targetId: uuid('target_id').notNull(),
}, t => [
  primaryKey({ columns: [t.workspaceId, t.courseId, t.sourceId, t.targetId] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.sourceId], foreignColumns: [topics.workspaceId, topics.courseId, topics.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.targetId], foreignColumns: [topics.workspaceId, topics.courseId, topics.id] }).onDelete('cascade'),
  check('topic_links_not_self', sql`${t.sourceId} <> ${t.targetId}`),
]);

const materialScope = () => ({ workspaceId: uuid('workspace_id').notNull(), courseId: uuid('course_id').notNull() });
function currentVersionColumns(): [AnyPgColumn, AnyPgColumn, AnyPgColumn, AnyPgColumn] {
  return [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id];
}
export const materials = pgTable('materials', {
  id: uuid('id').primaryKey(), ...materialScope(), title: text('title').notNull(), kind: text('kind').notNull(),
  attribution: text('attribution').notNull(), noteSource: jsonb('note_source').$type<{ materialId: string; versionId: string; passageId: string }>(), archived: boolean('archived').notNull().default(false),
  currentVersionId: uuid('current_version_id').references((): AnyPgColumn => materialVersions.id),
  revision: integer('revision').notNull().default(1), createFingerprint: text('create_fingerprint').notNull(), ...timestamps(),
}, t => [
  unique('materials_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ name: 'materials_current_version_scope_fk', columns: [t.workspaceId, t.courseId, t.id, t.currentVersionId], foreignColumns: currentVersionColumns() }),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  index('materials_list_idx').on(t.workspaceId, t.courseId, t.archived, t.id),
  check('materials_revision_positive', sql`${t.revision} > 0`),
  check('materials_kind_valid', sql`${t.kind} in ('reading', 'notes', 'slides', 'other')`),
]);
export const fileObjects = pgTable('file_objects', {
  id: uuid('id').primaryKey(), ...materialScope(), key: text('key').notNull().unique(),
  size: bigint('size', { mode: 'number' }).notNull(), detectedType: text('detected_type').notNull(),
  checksum: text('checksum').notNull(), etag: text('etag').notNull(), fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('objects_scope_unique').on(t.workspaceId, t.courseId, t.id),
  foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }),
  check('objects_size_positive', sql`${t.size} > 0`),
]);
export const materialVersions = pgTable('material_versions', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), number: integer('number').notNull(),
  requestId: uuid('request_id').notNull().unique(), fingerprint: text('fingerprint').notNull(),
  origin: text('origin').$type<'paste' | 'upload' | 'edit'>().notNull(), sourceObjectId: uuid('source_object_id'),
  contentStatus: text('content_status').$type<'readable' | 'not_extracted' | 'failed'>().notNull(), format: text('format').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique('versions_scope_unique').on(t.workspaceId, t.courseId, t.materialId, t.id),
  unique('versions_material_number_unique').on(t.materialId, t.number),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId], foreignColumns: [materials.workspaceId, materials.courseId, materials.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.sourceObjectId], foreignColumns: [fileObjects.workspaceId, fileObjects.courseId, fileObjects.id] }),
  check('versions_number_positive', sql`${t.number} > 0`),
  check('versions_status_valid', sql`${t.contentStatus} in ('readable', 'not_extracted', 'failed')`),
  check('versions_origin_valid', sql`${t.origin} in ('paste', 'upload', 'edit')`),
]);
export const passages = pgTable('passages', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), versionId: uuid('version_id').notNull(),
  heading: text('heading').notNull(), text: text('text').notNull(), order: integer('order').notNull(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId, t.versionId], foreignColumns: [materialVersions.workspaceId, materialVersions.courseId, materialVersions.materialId, materialVersions.id] }),
  unique('passages_scope_unique').on(t.workspaceId, t.courseId, t.materialId, t.versionId, t.id), unique('passages_order_unique').on(t.versionId, t.order),
]);
export const materialTopicLinks = pgTable('material_topic_links', {
  ...materialScope(), materialId: uuid('material_id').notNull(), topicId: uuid('topic_id').notNull(),
}, t => [
  primaryKey({ columns: [t.materialId, t.topicId] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.materialId], foreignColumns: [materials.workspaceId, materials.courseId, materials.id] }),
  foreignKey({ columns: [t.workspaceId, t.courseId, t.topicId], foreignColumns: [topics.workspaceId, topics.courseId, topics.id] }).onDelete('cascade'),
]);
export const workspaceStorage = pgTable('workspace_storage', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id),
  usedBytes: bigint('used_bytes', { mode: 'number' }).notNull().default(0), reservedBytes: bigint('reserved_bytes', { mode: 'number' }).notNull().default(0),
  pendingCount: integer('pending_count').notNull().default(0),
}, t => [check('storage_nonnegative', sql`${t.usedBytes} >= 0 and ${t.reservedBytes} >= 0 and ${t.pendingCount} >= 0`)]);
export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey(), ...materialScope(), materialId: uuid('material_id').notNull(), isNew: boolean('is_new').notNull(),
  fingerprint: text('fingerprint').notNull(), fields: jsonb('fields').$type<{ title: string; kind: string; attribution: string; topicIds: string[] }>().notNull(),
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
  ...materialScope(), questionId: uuid('question_id').primaryKey(), materialId: uuid('material_id').notNull(), versionId: uuid('version_id').notNull(), passageId: uuid('passage_id').notNull().references(() => passages.id),
}, t => [foreignKey({ name: 'question_sources_passage_scope_fk', columns: [t.workspaceId, t.courseId, t.materialId, t.versionId, t.passageId], foreignColumns: [passages.workspaceId, passages.courseId, passages.materialId, passages.versionId, passages.id] }), foreignKey({ columns: [t.workspaceId, t.courseId, t.questionId], foreignColumns: [questionVersions.workspaceId, questionVersions.courseId, questionVersions.id] }),
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
  index('attempts_course_idx').on(t.workspaceId, t.courseId, t.id)]);
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
  id: uuid('id').primaryKey(), ...materialScope(), date: date('date', { mode: 'string' }).notNull(), content: jsonb('content').$type<PlannedAssessment>().notNull(), revision: integer('revision').notNull().default(1),
}, t => [foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('assessments_scope_idx').on(t.workspaceId, t.courseId)]);
export const plannedSessions = pgTable('planned_sessions', {
  id: uuid('id').primaryKey(), ...materialScope(), date: date('date', { mode: 'string' }).notNull(), content: jsonb('content').$type<PlannedSession>().notNull(), revision: integer('revision').notNull().default(1),
}, t => [unique('planned_sessions_scope_unique').on(t.workspaceId, t.courseId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('planned_sessions_scope_idx').on(t.workspaceId, t.courseId)]);
export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), content: jsonb('content').$type<CheckIn>().notNull(),
}, t => [index('check_ins_scope_idx').on(t.workspaceId)]);
export const planProposals = pgTable('plan_proposals', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), baseRevision: integer('base_revision').notNull(),
  proposal: jsonb('proposal').$type<PlanProposal>().notNull(), fingerprint: text('fingerprint').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const tutorSessions = pgTable('tutor_sessions', {
  id: uuid('id').primaryKey(), ...materialScope(), topicId: uuid('topic_id').notNull(), topicLabel: text('topic_label').notNull(), title: text('title').notNull(),
  archived: boolean('archived').notNull().default(false), revision: integer('revision').notNull().default(1), stage: text('stage').$type<OnlineTutorSession['stage']>().notNull().default('orient'),
  source: jsonb('source').$type<OnlineTutorSession['source']>(), review: jsonb('review').$type<OnlineTutorSession['review']>(), ...timestamps(),
}, t => [unique('tutor_sessions_scope_unique').on(t.workspaceId, t.courseId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('tutor_sessions_scope_idx').on(t.workspaceId, t.courseId, t.id)]);
export const tutorMessages = pgTable('tutor_messages', {
  id: uuid('id').primaryKey(), ...materialScope(), sessionId: uuid('session_id').notNull(), ordinal: integer('ordinal').notNull(),
  text: text('text').notNull(), role: text('role').$type<'student' | 'tutor'>().notNull(), state: text('state').$type<OnlineTutorMessage['state']>().notNull(),
  operationId: uuid('operation_id').notNull().unique(), failure: text('failure'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('tutor_message_order_unique').on(t.sessionId, t.ordinal), foreignKey({ columns: [t.workspaceId, t.courseId, t.sessionId], foreignColumns: [tutorSessions.workspaceId, tutorSessions.courseId, tutorSessions.id] })]);
export const workspaceImports = pgTable('workspace_imports', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), fingerprint: text('fingerprint').notNull(),
  original: jsonb('original').$type<unknown>().notNull(), review: jsonb('review').$type<ImportReview>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('imports_deduplicate').on(t.workspaceId, t.fingerprint)]);
export const reminderStates = pgTable('reminder_states', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id), key: text('key').notNull(), status: text('status').$type<'read' | 'dismissed'>().notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.key] })]);
export const aiOperations = pgTable('ai_operations', {
  id: uuid('id').primaryKey(), ...materialScope(), task: text('task').$type<'tutor' | 'generate' | 'grade'>().notNull(),
  targetId: uuid('target_id').notNull(), fingerprint: text('fingerprint').notNull(), input: jsonb('input').$type<unknown>().notNull(),
  state: text('state').$type<'blocked' | 'running' | 'complete' | 'failed' | 'cancelled' | 'interrupted'>().notNull(),
  model: text('model').notNull(), promptVersion: text('prompt_version').notNull(), reason: text('reason'),
  activeExecutionId: uuid('active_execution_id'), result: jsonb('result').$type<unknown>(), ...timestamps(),
}, t => [unique('ai_operations_scope_unique').on(t.workspaceId, t.id), foreignKey({ columns: [t.workspaceId, t.courseId], foreignColumns: [courses.workspaceId, courses.id] }), index('ai_operations_target_idx').on(t.workspaceId, t.targetId, t.createdAt)]);
export const aiExecutions = pgTable('ai_executions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), operationId: uuid('operation_id').notNull(),
  state: text('state').$type<'reserved' | 'settled' | 'ambiguous' | 'released'>().notNull(),
  reservedMicros: bigint('reserved_micros', { mode: 'number' }).notNull(), chargedMicros: bigint('charged_micros', { mode: 'number' }),
  usage: jsonb('usage').$type<unknown>(), partial: text('partial').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), settledAt: timestamp('settled_at', { withTimezone: true }),
}, t => [foreignKey({ columns: [t.workspaceId, t.operationId], foreignColumns: [aiOperations.workspaceId, aiOperations.id] }), index('ai_executions_budget_idx').on(t.state, t.createdAt), check('ai_reservation_nonnegative', sql`${t.reservedMicros} >= 0 AND (${t.chargedMicros} IS NULL OR ${t.chargedMicros} >= 0)`)]);
export const feedbackRevisions = pgTable('feedback_revisions', {
  id: uuid('id').primaryKey(), ...materialScope(), attemptId: uuid('attempt_id').notNull().references(() => learningAttempts.id), questionId: uuid('question_id').notNull(),
  operationId: uuid('operation_id').notNull().unique(), revision: integer('revision').notNull(), grading: jsonb('grading').$type<WrittenGrading>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [unique('feedback_revision_unique').on(t.attemptId, t.questionId, t.revision), foreignKey({ name: 'feedback_attempt_scope_fk', columns: [t.workspaceId, t.courseId, t.attemptId], foreignColumns: [learningAttempts.workspaceId, learningAttempts.courseId, learningAttempts.id] }), foreignKey({ columns: [t.workspaceId, t.operationId], foreignColumns: [aiOperations.workspaceId, aiOperations.id] }), foreignKey({ columns: [t.workspaceId, t.courseId, t.questionId], foreignColumns: [questionVersions.workspaceId, questionVersions.courseId, questionVersions.id] })]);
