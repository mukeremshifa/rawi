ALTER TABLE "tutor_sessions" ADD COLUMN "history_summary" text;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD COLUMN "summarised_through" integer DEFAULT -1 NOT NULL;