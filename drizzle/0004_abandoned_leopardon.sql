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
	CONSTRAINT "tutor_messages_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "tutor_message_order_unique" UNIQUE("session_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "tutor_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"topic_label" text NOT NULL,
	"title" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"stage" text DEFAULT 'orient' NOT NULL,
	"source" jsonb,
	"review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_sessions_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_workspace_id_course_id_session_id_tutor_sessions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","session_id") REFERENCES "public"."tutor_sessions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_sessions_scope_idx" ON "tutor_sessions" USING btree ("workspace_id","course_id","id");