CREATE TABLE "workspace_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"original" jsonb NOT NULL,
	"review" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_deduplicate" UNIQUE("workspace_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "workspace_imports" ADD CONSTRAINT "workspace_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;