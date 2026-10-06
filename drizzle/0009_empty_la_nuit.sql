CREATE TABLE "feedback_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"grading" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_revisions_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "feedback_revision_unique" UNIQUE("attempt_id","question_id","revision")
);
--> statement-breakpoint
ALTER TABLE "feedback_revisions" ADD CONSTRAINT "feedback_revisions_attempt_id_learning_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."learning_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_revisions" ADD CONSTRAINT "feedback_revisions_workspace_id_operation_id_ai_operations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","operation_id") REFERENCES "public"."ai_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_revisions" ADD CONSTRAINT "feedback_revisions_workspace_id_course_id_question_id_question_versions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","question_id") REFERENCES "public"."question_versions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER immutable_feedback_revisions BEFORE UPDATE OR DELETE ON feedback_revisions FOR EACH ROW EXECUTE FUNCTION rawi_immutable_learning_content();
