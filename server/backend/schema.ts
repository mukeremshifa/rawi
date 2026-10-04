import { sql } from 'drizzle-orm';
import { pgTable, text, boolean, timestamp, uuid, integer, jsonb, unique, index, foreignKey, primaryKey, check } from 'drizzle-orm/pg-core';
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
