CREATE TABLE "ai_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"charged_micros" bigint,
	"usage" jsonb,
	"partial" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_reservation_nonnegative" CHECK ("ai_executions"."reserved_micros" >= 0 AND ("ai_executions"."charged_micros" IS NULL OR "ai_executions"."charged_micros" >= 0))
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
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"reason" text,
	"active_execution_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_operations_scope_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_workspace_id_operation_id_ai_operations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","operation_id") REFERENCES "public"."ai_operations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_executions_budget_idx" ON "ai_executions" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "ai_operations_target_idx" ON "ai_operations" USING btree ("workspace_id","target_id","created_at");