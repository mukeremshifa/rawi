CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"course_id" uuid,
	"ordinal" integer NOT NULL,
	"tool" text NOT NULL,
	"key" text NOT NULL,
	"decided_by" text NOT NULL,
	"reason" text NOT NULL,
	"input" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"status" text NOT NULL,
	"notify" boolean DEFAULT false NOT NULL,
	"remind_on" date,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_actions_order_unique" UNIQUE("run_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"observation" jsonb,
	"summary" text,
	"summary_by" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_runs_state_valid" CHECK ("agent_runs"."state" in ('running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "study_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"date" date,
	"assessment_id" uuid,
	"scope_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_goals_source_valid" CHECK ("study_goals"."source" in ('student', 'syllabus')),
	CONSTRAINT "study_goals_status_valid" CHECK ("study_goals"."status" in ('active', 'done', 'dropped'))
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_goals" ADD CONSTRAINT "study_goals_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_goals" ADD CONSTRAINT "study_goals_scope_fk" FOREIGN KEY ("workspace_id","course_id","scope_id") REFERENCES "public"."scopes"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_goals" ADD CONSTRAINT "study_goals_assessment_fk" FOREIGN KEY ("workspace_id","course_id","assessment_id") REFERENCES "public"."assessments"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_actions_recent_idx" ON "agent_actions" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE INDEX "agent_actions_key_idx" ON "agent_actions" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_one_running" ON "agent_runs" USING btree ("workspace_id") WHERE "agent_runs"."state" = 'running';--> statement-breakpoint
CREATE INDEX "agent_runs_recent_idx" ON "agent_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "study_goals_assessment_unique" ON "study_goals" USING btree ("course_id","assessment_id") WHERE "study_goals"."assessment_id" is not null;--> statement-breakpoint
CREATE INDEX "study_goals_list_idx" ON "study_goals" USING btree ("workspace_id","status");