ALTER TABLE "learning_attempts" ADD CONSTRAINT "attempts_scope_unique" UNIQUE("workspace_id","course_id","id");
--> statement-breakpoint
ALTER TABLE "feedback_revisions" ADD CONSTRAINT "feedback_attempt_scope_fk" FOREIGN KEY ("workspace_id","course_id","attempt_id") REFERENCES "public"."learning_attempts"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;
