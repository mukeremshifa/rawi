CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
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
CREATE TABLE "ai_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "ingest_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'chunk' NOT NULL,
	"progress" jsonb DEFAULT '{"cursor":0}'::jsonb NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_jobs_version_unique" UNIQUE("version_id"),
	CONSTRAINT "ingest_jobs_state_valid" CHECK ("ingest_jobs"."state" in ('queued', 'running', 'done', 'failed', 'superseded')),
	CONSTRAINT "ingest_jobs_stage_valid" CHECK ("ingest_jobs"."stage" in ('chunk', 'embed', 'digest', 'figures', 'done'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section_block_id" uuid,
	"heading" text NOT NULL,
	"block_ids" jsonb NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"tokens" integer NOT NULL,
	"search" "tsvector" NOT NULL,
	"embedding" vector(768),
	"embedding_model" text,
	CONSTRAINT "knowledge_chunks_order_unique" UNIQUE("version_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "knowledge_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_block_id" uuid,
	"text" text NOT NULL,
	"block_ids" jsonb NOT NULL,
	"language" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_block_id" uuid,
	"heading" text NOT NULL,
	"summary" text NOT NULL,
	"key_terms" jsonb NOT NULL,
	"block_ids" jsonb NOT NULL,
	"language" text NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "knowledge_sections_unique" UNIQUE NULLS NOT DISTINCT("version_id","section_block_id")
);
--> statement-breakpoint
CREATE TABLE "question_pool" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_block_id" uuid,
	"cache_key" text NOT NULL,
	"format" text NOT NULL,
	"difficulty" text NOT NULL,
	"language" text NOT NULL,
	"content" jsonb NOT NULL,
	"block_ids" jsonb NOT NULL,
	"verification" jsonb NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_pool_state_valid" CHECK ("question_pool"."state" in ('verified', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "ai_operations" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_plan_id" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_descriptions" ADD CONSTRAINT "figure_descriptions_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sections" ADD CONSTRAINT "knowledge_sections_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pool" ADD CONSTRAINT "question_pool_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_budget_idx" ON "ai_calls" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_open_idx" ON "ai_calls" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_health_idx" ON "ai_calls" USING btree ("vendor","model","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_operation_idx" ON "ai_calls" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "ingest_jobs_due_idx" ON "ingest_jobs" USING btree ("state","next_run_at");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_scope_idx" ON "knowledge_chunks" USING btree ("workspace_id","course_id","version_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_search_idx" ON "knowledge_chunks" USING gin ("search");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_facts_section_idx" ON "knowledge_facts" USING btree ("version_id","section_block_id");--> statement-breakpoint
CREATE INDEX "question_pool_key_idx" ON "question_pool" USING btree ("cache_key","state");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ai_plan_id_ai_plans_id_fk" FOREIGN KEY ("ai_plan_id") REFERENCES "public"."ai_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "ai_plans" ("id", "policy") VALUES ('default', '{"dailyMicros":2000000,"monthlyMicros":20000000,"concurrent":2,"vendors":["bedrock","vertex"],"retention":"standard"}'), ('platform', '{"dailyMicros":10000000,"monthlyMicros":100000000,"concurrent":8,"vendors":["bedrock","vertex"],"retention":"standard"}') ON CONFLICT DO NOTHING;
