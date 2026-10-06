import { sql } from 'drizzle-orm';
import { pgTable, text, boolean, timestamp, uuid, integer, bigint, jsonb, unique, index, foreignKey, primaryKey, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PreferenceFields } from '../../src/shared/online';

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
  attribution: text('attribution').notNull(), archived: boolean('archived').notNull().default(false),
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
  unique('passages_order_unique').on(t.versionId, t.order),
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
