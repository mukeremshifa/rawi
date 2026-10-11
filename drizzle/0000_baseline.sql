CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_identity_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"funding_source_id" text,
	"operation_id" uuid,
	"job_id" uuid,
	"task" text NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"vendor" text NOT NULL,
	"model" text NOT NULL,
	"region" text NOT NULL,
	"service_tier" text DEFAULT 'standard' NOT NULL,
	"language" text NOT NULL,
	"state" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"charged_micros" bigint,
	"usage" jsonb,
	"latency_ms" integer,
	"ttft_ms" integer,
	"validation" text,
	"error" text,
	"partial" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_calls_state_valid" CHECK ("ai_calls"."state" in ('reserved', 'settled', 'ambiguous', 'released')),
	CONSTRAINT "ai_calls_reservation_nonnegative" CHECK ("ai_calls"."reserved_micros" >= 0 AND ("ai_calls"."charged_micros" IS NULL OR "ai_calls"."charged_micros" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ai_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"task" text NOT NULL,
	"target_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"input" jsonb NOT NULL,
	"state" text NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"reason" text,
	"active_execution_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_operations_scope_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"date" date,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source" jsonb,
	"edited" boolean DEFAULT true NOT NULL,
	CONSTRAINT "assessments_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "bank_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"material_id" uuid,
	"section_key" text,
	"content_hash" text,
	"fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" text NOT NULL,
	"difficulty" text NOT NULL,
	"origin" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"template_id" uuid,
	"template" jsonb,
	"verification" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_items_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "bank_items_state_valid" CHECK ("bank_items"."state" in ('active', 'template', 'retired')),
	CONSTRAINT "bank_items_origin_valid" CHECK ("bank_items"."origin" in ('built', 'generated'))
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"flags" jsonb NOT NULL,
	CONSTRAINT "blocks_scope_unique" UNIQUE("workspace_id","course_id","material_id","version_id","id"),
	CONSTRAINT "blocks_ordinal_unique" UNIQUE("version_id","ordinal"),
	CONSTRAINT "blocks_type_valid" CHECK ("blocks"."type" in ('heading', 'paragraph', 'list', 'table', 'equation', 'figure', 'code', 'quote')),
	CONSTRAINT "blocks_ordinal_nonnegative" CHECK ("blocks"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"course_id" uuid GENERATED ALWAYS AS ((content->>'courseId')::uuid) STORED,
	"at" text GENERATED ALWAYS AS (content->>'at') STORED,
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"create_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"syllabus_material_id" uuid,
	"outline_revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "courses_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "courses_revision_positive" CHECK ("courses"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "development_seeds" (
	"workspace_id" uuid NOT NULL,
	"version" text NOT NULL,
	"anchor_date" date NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_seeds_workspace_id_version_pk" PRIMARY KEY("workspace_id","version")
);
--> statement-breakpoint
CREATE TABLE "exam_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"value" double precision,
	"unit" text,
	"items" jsonb,
	"block_ids" jsonb NOT NULL,
	"position" integer NOT NULL,
	"confidence" real NOT NULL,
	"extractor" text NOT NULL,
	"language" text NOT NULL,
	CONSTRAINT "facts_kind_valid" CHECK ("facts"."kind" in ('fact', 'definition', 'number', 'steps', 'formula')),
	CONSTRAINT "facts_confidence_range" CHECK ("facts"."confidence" >= 0 and "facts"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "figure_descriptions" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"description" text NOT NULL,
	"language" text NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"key" text NOT NULL,
	"size" bigint NOT NULL,
	"detected_type" text NOT NULL,
	"checksum" text NOT NULL,
	"etag" text NOT NULL,
	"file_name" text NOT NULL,
	"role" text DEFAULT 'original' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_objects_key_unique" UNIQUE("key"),
	CONSTRAINT "objects_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "objects_size_positive" CHECK ("file_objects"."size" > 0),
	CONSTRAINT "objects_role_valid" CHECK ("file_objects"."role" in ('original', 'asset', 'raw'))
);
--> statement-breakpoint
CREATE TABLE "funding_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"owner_workspace_id" uuid,
	"credentials" jsonb NOT NULL,
	"vendors" jsonb NOT NULL,
	"routes" jsonb,
	"limits" jsonb NOT NULL,
	"per_workspace" jsonb,
	"retention" text NOT NULL,
	"student_retention" text DEFAULT 'none' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_owner_kind_unique" UNIQUE("owner_workspace_id","kind"),
	CONSTRAINT "funding_kind_valid" CHECK ("funding_sources"."kind" in ('platform', 'institution', 'user')),
	CONSTRAINT "funding_retention_valid" CHECK ("funding_sources"."retention" in ('none', 'standard') and "funding_sources"."student_retention" in ('none', 'standard'))
);
--> statement-breakpoint
CREATE TABLE "ingest_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'structure' NOT NULL,
	"progress" jsonb DEFAULT '{"cursor":0}'::jsonb NOT NULL,
	"readiness" text DEFAULT 'readable' NOT NULL,
	"coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"index_version" text DEFAULT '' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_jobs_version_unique" UNIQUE("version_id"),
	CONSTRAINT "ingest_jobs_state_valid" CHECK ("ingest_jobs"."state" in ('queued', 'running', 'done', 'failed', 'superseded')),
	CONSTRAINT "ingest_jobs_stage_valid" CHECK ("ingest_jobs"."stage" in ('structure', 'embed', 'digest', 'figures', 'repair', 'done')),
	CONSTRAINT "ingest_jobs_readiness_valid" CHECK ("ingest_jobs"."readiness" in ('readable', 'searchable', 'enriched'))
);
--> statement-breakpoint
CREATE TABLE "item_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"material_id" uuid,
	"section_key" text,
	"fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"score" real NOT NULL,
	"used_hint" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_results_run_item_unique" UNIQUE("run_id","item_id"),
	CONSTRAINT "item_results_score_range" CHECK ("item_results"."score" >= 0 and "item_results"."score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section_id" uuid NOT NULL,
	"heading" text NOT NULL,
	"block_ids" jsonb NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"tokens" integer NOT NULL,
	"search" "tsvector" NOT NULL,
	"embedding" vector(768),
	"embedding_model" text,
	"kind" text DEFAULT 'text' NOT NULL,
	"uncertain" boolean DEFAULT false NOT NULL,
	CONSTRAINT "knowledge_chunks_order_unique" UNIQUE("version_id","ordinal"),
	CONSTRAINT "knowledge_chunks_kind_valid" CHECK ("knowledge_chunks"."kind" in ('text', 'figure'))
);
--> statement-breakpoint
CREATE TABLE "learning_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_attempts_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "attempts_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "learning_operations" (
	"workspace_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_operations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "learning_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"planned_session_id" uuid,
	"flashcard_review" jsonb,
	"exam" jsonb,
	"deadline_at" timestamp with time zone,
	"scope_id" uuid,
	"pending_items" integer DEFAULT 0 NOT NULL,
	"pending_note" text,
	CONSTRAINT "runs_scope_unique" UNIQUE("workspace_id","course_id","set_id","id"),
	CONSTRAINT "runs_state_valid" CHECK ("learning_runs"."state" in ('active', 'submitted'))
);
--> statement-breakpoint
CREATE TABLE "learning_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"feedback" text NOT NULL,
	"hints_allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text DEFAULT 'practice' NOT NULL,
	"remediates_attempt_id" uuid,
	CONSTRAINT "sets_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"origin" text NOT NULL,
	"source_object_id" uuid,
	"format" text NOT NULL,
	"schema_version" integer NOT NULL,
	"adapter" text NOT NULL,
	"adapter_version" text NOT NULL,
	"status" text NOT NULL,
	"failed_pages" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure" text,
	"raw_object_id" uuid,
	"page_count" integer,
	"pagination" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"provider_request_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"completion_failures" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_versions_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "versions_scope_unique" UNIQUE("workspace_id","course_id","material_id","id"),
	CONSTRAINT "versions_material_number_unique" UNIQUE("material_id","number"),
	CONSTRAINT "versions_number_positive" CHECK ("material_versions"."number" > 0),
	CONSTRAINT "versions_status_valid" CHECK ("material_versions"."status" in ('pending', 'processing', 'ready', 'partial', 'failed')),
	CONSTRAINT "versions_adapter_valid" CHECK ("material_versions"."adapter" in ('markdown', 'datalab')),
	CONSTRAINT "versions_pagination_valid" CHECK ("material_versions"."pagination" in ('source', 'slides', 'converted', 'none')),
	CONSTRAINT "versions_origin_valid" CHECK ("material_versions"."origin" in ('paste', 'upload'))
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"attribution" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"create_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "materials_revision_positive" CHECK ("materials"."revision" > 0),
	CONSTRAINT "materials_kind_valid" CHECK ("materials"."kind" in ('reading', 'slides', 'other', 'syllabus'))
);
--> statement-breakpoint
CREATE TABLE "outline_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"after_revision" integer NOT NULL,
	"undo" jsonb NOT NULL,
	"undone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outline_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"material_id" uuid,
	"version_id" uuid,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"result" jsonb,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outline_jobs_kind_valid" CHECK ("outline_jobs"."kind" in ('read_syllabus', 'assign_topics')),
	CONSTRAINT "outline_jobs_state_valid" CHECK ("outline_jobs"."state" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "plan_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"proposal" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_sessions" (
	"assessment_id" uuid GENERATED ALWAYS AS ((content->>'assessmentId')::uuid) STORED,
	"status" text GENERATED ALWAYS AS (content->>'status') STORED,
	"activity" text GENERATED ALWAYS AS (content->>'activity') STORED,
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"date" date NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "planned_sessions_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "planner_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"availability" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_preferences" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"values" jsonb NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_revision_positive" CHECK ("workspace_preferences"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "prerequisites" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"requires_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	CONSTRAINT "prerequisites_section_id_requires_id_pk" PRIMARY KEY("section_id","requires_id"),
	CONSTRAINT "prerequisites_reason_valid" CHECK ("prerequisites"."reason" in ('term', 'reference'))
);
--> statement-breakpoint
CREATE TABLE "reminder_states" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "reminder_states_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE "run_answers" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"hinted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "run_answers_run_id_item_id_pk" PRIMARY KEY("run_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"topic_id" uuid,
	"assessment_id" uuid,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scopes_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "scopes_kind_valid" CHECK ("scopes"."kind" in ('topic', 'sections', 'assessment', 'course'))
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"key" text NOT NULL,
	"heading_block_id" uuid,
	"heading" text NOT NULL,
	"path" jsonb NOT NULL,
	"level" integer NOT NULL,
	"block_ids" jsonb NOT NULL,
	"tokens" integer NOT NULL,
	"content_hash" text NOT NULL,
	"summary" text,
	"key_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"digested_by" text,
	"language" text NOT NULL,
	"topics_at" timestamp with time zone,
	CONSTRAINT "sections_version_key_unique" UNIQUE("version_id","key"),
	CONSTRAINT "sections_version_order_unique" UNIQUE("version_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "set_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "set_items_scope_unique" UNIQUE("workspace_id","course_id","set_id","id"),
	CONSTRAINT "set_items_order_unique" UNIQUE("set_id","position")
);
--> statement-breakpoint
CREATE TABLE "topic_sections" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"depth" text NOT NULL,
	"origin" text NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_sections_topic_id_material_id_section_key_pk" PRIMARY KEY("topic_id","material_id","section_key"),
	CONSTRAINT "topic_sections_depth_valid" CHECK ("topic_sections"."depth" in ('introduces', 'covers', 'mentions')),
	CONSTRAINT "topic_sections_origin_valid" CHECK ("topic_sections"."origin" in ('suggested', 'student'))
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"module" text NOT NULL,
	"order" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" text DEFAULT 'student' NOT NULL,
	"source" jsonb,
	"edited" boolean DEFAULT false NOT NULL,
	CONSTRAINT "topics_scope_id_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "topics_revision_positive" CHECK ("topics"."revision" > 0),
	CONSTRAINT "topics_origin_valid" CHECK ("topics"."origin" in ('syllabus', 'materials', 'student'))
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"role" text NOT NULL,
	"state" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provenance" jsonb,
	CONSTRAINT "tutor_messages_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "tutor_message_order_unique" UNIQUE("session_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "tutor_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid,
	"topic_label" text,
	"title" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"stage" text DEFAULT 'orient' NOT NULL,
	"source" jsonb,
	"review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_session_id" uuid,
	"completed_learning" boolean DEFAULT false NOT NULL,
	"sample_dataset" text,
	"imported" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"history_summary" text,
	"summarised_through" integer DEFAULT -1 NOT NULL,
	CONSTRAINT "tutor_sessions_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "upload_candidates" (
	"token" uuid PRIMARY KEY NOT NULL,
	"upload_id" uuid NOT NULL,
	"key" text NOT NULL,
	"state" text DEFAULT 'candidate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "upload_candidates_key_unique" UNIQUE("key"),
	CONSTRAINT "candidates_state_valid" CHECK ("upload_candidates"."state" in ('candidate', 'published', 'deleting'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"is_new" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"fields" jsonb NOT NULL,
	"expected_revision" integer,
	"expected_size" bigint NOT NULL,
	"expected_type" text NOT NULL,
	"checksum" text NOT NULL,
	"file_name" text NOT NULL,
	"staging_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"result_version_id" uuid,
	"failure" text,
	"staging_cleaned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "uploads_result_version_id_unique" UNIQUE("result_version_id"),
	CONSTRAINT "uploads_state_valid" CHECK ("uploads"."state" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_storage" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "storage_nonnegative" CHECK ("workspace_storage"."used_bytes" >= 0 and "workspace_storage"."reserved_bytes" >= 0 and "workspace_storage"."pending_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"funding_source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_funding_source_id_funding_sources_id_fk" FOREIGN KEY ("funding_source_id") REFERENCES "public"."funding_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_items" ADD CONSTRAINT "bank_items_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_in_course_scope_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_syllabus_fk" FOREIGN KEY ("workspace_id","id","syllabus_material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_seeds" ADD CONSTRAINT "development_seeds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_configs" ADD CONSTRAINT "exam_configs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_descriptions" ADD CONSTRAINT "figure_descriptions_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_sources" ADD CONSTRAINT "funding_sources_owner_workspace_id_workspaces_id_fk" FOREIGN KEY ("owner_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_results" ADD CONSTRAINT "item_results_workspace_id_course_id_item_id_bank_items_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","item_id") REFERENCES "public"."bank_items"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_operations" ADD CONSTRAINT "learning_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD CONSTRAINT "runs_planner_scope_fk" FOREIGN KEY ("workspace_id","course_id","planned_session_id") REFERENCES "public"."planned_sessions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD CONSTRAINT "learning_runs_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sets" ADD CONSTRAINT "learning_sets_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_workspace_id_course_id_source_object_id_file_objects_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","source_object_id") REFERENCES "public"."file_objects"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "versions_raw_object_fk" FOREIGN KEY ("workspace_id","course_id","raw_object_id") REFERENCES "public"."file_objects"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_current_version_id_material_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_current_version_scope_fk" FOREIGN KEY ("workspace_id","course_id","id","current_version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_changes" ADD CONSTRAINT "outline_changes_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_jobs" ADD CONSTRAINT "outline_jobs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_assessment_scope_fk" FOREIGN KEY ("workspace_id","course_id","assessment_id") REFERENCES "public"."assessments"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_state" ADD CONSTRAINT "planner_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_requires_id_sections_id_fk" FOREIGN KEY ("requires_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_states" ADD CONSTRAINT "reminder_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_item_id_set_items_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","item_id") REFERENCES "public"."set_items"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_workspace_id_course_id_topic_id_topics_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","topic_id") REFERENCES "public"."topics"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_assessment_fk" FOREIGN KEY ("workspace_id","course_id","assessment_id") REFERENCES "public"."assessments"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_items" ADD CONSTRAINT "set_items_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_items" ADD CONSTRAINT "set_items_workspace_id_course_id_question_id_bank_items_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","question_id") REFERENCES "public"."bank_items"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_sections" ADD CONSTRAINT "topic_sections_workspace_id_course_id_topic_id_topics_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","topic_id") REFERENCES "public"."topics"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_sections" ADD CONSTRAINT "topic_sections_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_workspace_id_course_id_session_id_tutor_sessions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","session_id") REFERENCES "public"."tutor_sessions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_planner_scope_fk" FOREIGN KEY ("workspace_id","course_id","planned_session_id") REFERENCES "public"."planned_sessions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_candidates" ADD CONSTRAINT "upload_candidates_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_course_id_material_id_result_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","result_version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage" ADD CONSTRAINT "workspace_storage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_funding_source_id_funding_sources_id_fk" FOREIGN KEY ("funding_source_id") REFERENCES "public"."funding_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_calls_budget_idx" ON "ai_calls" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_source_idx" ON "ai_calls" USING btree ("funding_source_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_open_idx" ON "ai_calls" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_health_idx" ON "ai_calls" USING btree ("vendor","model","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_operation_idx" ON "ai_calls" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "ai_operations_target_idx" ON "ai_operations" USING btree ("workspace_id","target_id","created_at");--> statement-breakpoint
CREATE INDEX "assessments_scope_idx" ON "assessments" USING btree ("workspace_id","course_id");--> statement-breakpoint
CREATE INDEX "bank_items_draw_idx" ON "bank_items" USING btree ("workspace_id","material_id","section_key","format","state");--> statement-breakpoint
CREATE INDEX "check_ins_scope_idx" ON "check_ins" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "courses_workspace_list_idx" ON "courses" USING btree ("workspace_id","archived","id");--> statement-breakpoint
CREATE INDEX "exam_configs_scope_idx" ON "exam_configs" USING btree ("workspace_id","course_id","id");--> statement-breakpoint
CREATE INDEX "facts_section_idx" ON "facts" USING btree ("section_id","kind");--> statement-breakpoint
CREATE INDEX "ingest_jobs_due_idx" ON "ingest_jobs" USING btree ("state","next_run_at");--> statement-breakpoint
CREATE INDEX "item_results_item_idx" ON "item_results" USING btree ("workspace_id","item_id","at");--> statement-breakpoint
CREATE INDEX "item_results_section_idx" ON "item_results" USING btree ("workspace_id","material_id","section_key","at");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_scope_idx" ON "knowledge_chunks" USING btree ("workspace_id","course_id","version_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_section_idx" ON "knowledge_chunks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_search_idx" ON "knowledge_chunks" USING gin ("search");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "attempts_course_idx" ON "learning_attempts" USING btree ("workspace_id","course_id","id");--> statement-breakpoint
CREATE INDEX "attempts_chronology_idx" ON "learning_attempts" USING btree ("workspace_id","course_id",("snapshot"->>'completedAt'),"id");--> statement-breakpoint
CREATE INDEX "runs_expiry_idx" ON "learning_runs" USING btree ("state","deadline_at","id");--> statement-breakpoint
CREATE INDEX "runs_workspace_idx" ON "learning_runs" USING btree ("workspace_id","state","id");--> statement-breakpoint
CREATE INDEX "sets_course_idx" ON "learning_sets" USING btree ("workspace_id","course_id","archived","id");--> statement-breakpoint
CREATE INDEX "versions_conversion_idx" ON "material_versions" USING btree ("status","next_poll_at");--> statement-breakpoint
CREATE INDEX "materials_list_idx" ON "materials" USING btree ("workspace_id","course_id","archived","id");--> statement-breakpoint
CREATE INDEX "outline_jobs_due_idx" ON "outline_jobs" USING btree ("state","next_run_at");--> statement-breakpoint
CREATE INDEX "outline_jobs_course_idx" ON "outline_jobs" USING btree ("workspace_id","course_id","created_at");--> statement-breakpoint
CREATE INDEX "planned_sessions_scope_idx" ON "planned_sessions" USING btree ("workspace_id","course_id");--> statement-breakpoint
CREATE INDEX "prerequisites_course_idx" ON "prerequisites" USING btree ("workspace_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_topic_unique" ON "scopes" USING btree ("course_id","topic_id") WHERE "scopes"."kind" = 'topic';--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_assessment_unique" ON "scopes" USING btree ("course_id","assessment_id") WHERE "scopes"."kind" = 'assessment';--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_course_unique" ON "scopes" USING btree ("course_id") WHERE "scopes"."kind" = 'course';--> statement-breakpoint
CREATE INDEX "scopes_list_idx" ON "scopes" USING btree ("workspace_id","course_id","archived");--> statement-breakpoint
CREATE INDEX "sections_course_idx" ON "sections" USING btree ("workspace_id","course_id","material_id","key");--> statement-breakpoint
CREATE INDEX "sections_hash_idx" ON "sections" USING btree ("workspace_id","content_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topic_sections_material_idx" ON "topic_sections" USING btree ("workspace_id","material_id","section_key");--> statement-breakpoint
CREATE INDEX "topics_course_order_idx" ON "topics" USING btree ("workspace_id","course_id","order","id");--> statement-breakpoint
CREATE INDEX "tutor_sessions_scope_idx" ON "tutor_sessions" USING btree ("workspace_id","course_id","id");--> statement-breakpoint
CREATE INDEX "tutor_chronology_idx" ON "tutor_sessions" USING btree ("workspace_id","course_id","created_at","id");--> statement-breakpoint
CREATE INDEX "uploads_maintenance_idx" ON "uploads" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
INSERT INTO "funding_sources" ("id", "kind", "label", "credentials", "vendors", "routes", "limits", "per_workspace", "retention", "student_retention") VALUES ('platform', 'platform', 'Rawi', '"env"', '["bedrock","vertex"]', NULL, '{"dailyMicros":10000000,"monthlyMicros":100000000,"concurrent":8}', '{"dailyMicros":2000000,"monthlyMicros":20000000,"concurrent":2}', 'standard', 'none');
