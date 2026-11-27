ALTER TABLE "workspace_preferences" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD COLUMN "consented_at" timestamp with time zone;