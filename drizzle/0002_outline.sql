ALTER TABLE "material_topic_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "topic_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "material_topic_links" CASCADE;--> statement-breakpoint
DROP TABLE "topic_links" CASCADE;--> statement-breakpoint
ALTER TABLE "topics" DROP CONSTRAINT "topics_priority_valid";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "goal";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN "priority";--> statement-breakpoint
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
	CONSTRAINT "outline_jobs_kind_valid" CHECK ("outline_jobs"."kind" in ('read_syllabus', 'map_material', 'draft_outline')),
	CONSTRAINT "outline_jobs_state_valid" CHECK ("outline_jobs"."state" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "section_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"heading_block_id" uuid,
	"heading_text" text NOT NULL,
	"origin" text NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_links_unique" UNIQUE NULLS NOT DISTINCT("version_id","heading_block_id","topic_id"),
	CONSTRAINT "section_links_origin_valid" CHECK ("section_links"."origin" in ('suggested', 'student'))
);
--> statement-breakpoint
ALTER TABLE "materials" DROP CONSTRAINT "materials_kind_valid";--> statement-breakpoint
ALTER TABLE "assessments" ALTER COLUMN "date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ALTER COLUMN "topic_label" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "edited" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "syllabus_material_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "outline_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "origin" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outline_changes" ADD CONSTRAINT "outline_changes_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_jobs" ADD CONSTRAINT "outline_jobs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_workspace_id_course_id_topic_id_topics_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","topic_id") REFERENCES "public"."topics"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outline_jobs_due_idx" ON "outline_jobs" USING btree ("state","next_run_at");--> statement-breakpoint
CREATE INDEX "outline_jobs_course_idx" ON "outline_jobs" USING btree ("workspace_id","course_id","created_at");--> statement-breakpoint
CREATE INDEX "section_links_course_idx" ON "section_links" USING btree ("workspace_id","course_id","topic_id");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_syllabus_fk" FOREIGN KEY ("workspace_id","id","syllabus_material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_kind_valid" CHECK ("materials"."kind" in ('reading', 'slides', 'other', 'syllabus'));--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_origin_valid" CHECK ("topics"."origin" in ('syllabus', 'materials', 'student'));