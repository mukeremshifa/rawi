CREATE TABLE "reminder_states" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "reminder_states_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "note_source" jsonb;--> statement-breakpoint
ALTER TABLE "reminder_states" ADD CONSTRAINT "reminder_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;