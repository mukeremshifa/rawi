ALTER TABLE "tutor_messages" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD COLUMN "ended_at" timestamp with time zone;