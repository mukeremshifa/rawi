
ALTER TABLE "passages" ADD CONSTRAINT "passages_scope_unique" UNIQUE("workspace_id","course_id","material_id","version_id","id");--> statement-breakpoint

ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_scope_unique" UNIQUE("workspace_id","course_id","id");--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "date" date;--> statement-breakpoint

UPDATE "assessments" SET "date" = (content->>'date')::date;--> statement-breakpoint

ALTER TABLE "assessments" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "learning_runs" ADD COLUMN "planned_session_id" uuid;--> statement-breakpoint

ALTER TABLE "learning_sets" ADD COLUMN "remediates_attempt_id" uuid;--> statement-breakpoint

ALTER TABLE "planned_sessions" ADD COLUMN "date" date;--> statement-breakpoint

UPDATE "planned_sessions" SET "date" = (content->>'date')::date;--> statement-breakpoint

ALTER TABLE "planned_sessions" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "learning_runs" ADD CONSTRAINT "runs_planner_scope_fk" FOREIGN KEY ("workspace_id","course_id","planned_session_id") REFERENCES "public"."planned_sessions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_passage_scope_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id","passage_id") REFERENCES "public"."passages"("workspace_id","course_id","material_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "runs_expiry_idx" ON "learning_runs" USING btree ("state","deadline_at","id");