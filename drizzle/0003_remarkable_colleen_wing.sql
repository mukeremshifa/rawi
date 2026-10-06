CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content" jsonb NOT NULL
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
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"availability" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_runs" ADD COLUMN "exam" jsonb;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learning_sets" ADD COLUMN "purpose" text DEFAULT 'practice' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_configs" ADD CONSTRAINT "exam_configs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_state" ADD CONSTRAINT "planner_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_scope_idx" ON "assessments" USING btree ("workspace_id","course_id");--> statement-breakpoint
CREATE INDEX "check_ins_scope_idx" ON "check_ins" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "exam_configs_scope_idx" ON "exam_configs" USING btree ("workspace_id","course_id","id");--> statement-breakpoint
CREATE INDEX "planned_sessions_scope_idx" ON "planned_sessions" USING btree ("workspace_id","course_id");