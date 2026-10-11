ALTER TABLE "ingest_jobs" DROP CONSTRAINT "ingest_jobs_stage_valid";--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "readiness" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "coverage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD COLUMN "index_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "uncertain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_readiness_valid" CHECK ("ingest_jobs"."readiness" in ('pending', 'searchable', 'enriched'));--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_stage_valid" CHECK ("ingest_jobs"."stage" in ('chunk', 'embed', 'digest', 'figures', 'repair', 'done'));--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_kind_valid" CHECK ("knowledge_chunks"."kind" in ('text', 'figure'));--> statement-breakpoint
UPDATE "ingest_jobs" SET "readiness" = 'searchable' WHERE "stage" = 'done' AND EXISTS (SELECT 1 FROM "knowledge_chunks" c WHERE c."version_id" = "ingest_jobs"."version_id");