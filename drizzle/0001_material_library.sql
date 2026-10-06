CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"key" text NOT NULL,
	"size" bigint NOT NULL,
	"detected_type" text NOT NULL,
	"checksum" text NOT NULL,
	"etag" text NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_objects_key_unique" UNIQUE("key"),
	CONSTRAINT "objects_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "objects_size_positive" CHECK ("file_objects"."size" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_topic_links" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "material_topic_links_material_id_topic_id_pk" PRIMARY KEY("material_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"origin" text NOT NULL,
	"source_object_id" uuid,
	"content_status" text NOT NULL,
	"format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_versions_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "versions_scope_unique" UNIQUE("workspace_id","course_id","material_id","id"),
	CONSTRAINT "versions_material_number_unique" UNIQUE("material_id","number"),
	CONSTRAINT "versions_number_positive" CHECK ("material_versions"."number" > 0),
	CONSTRAINT "versions_status_valid" CHECK ("material_versions"."content_status" in ('readable', 'not_extracted', 'failed')),
	CONSTRAINT "versions_origin_valid" CHECK ("material_versions"."origin" in ('paste', 'upload', 'edit'))
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"attribution" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"create_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_scope_unique" UNIQUE("workspace_id","course_id","id"),
	CONSTRAINT "materials_revision_positive" CHECK ("materials"."revision" > 0),
	CONSTRAINT "materials_kind_valid" CHECK ("materials"."kind" in ('reading', 'notes', 'slides', 'other'))
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"heading" text NOT NULL,
	"text" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "passages_order_unique" UNIQUE("version_id","order")
);
--> statement-breakpoint
CREATE TABLE "upload_candidates" (
	"token" uuid PRIMARY KEY NOT NULL,
	"upload_id" uuid NOT NULL,
	"key" text NOT NULL,
	"state" text DEFAULT 'candidate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "upload_candidates_key_unique" UNIQUE("key"),
	CONSTRAINT "candidates_state_valid" CHECK ("upload_candidates"."state" in ('candidate', 'published', 'deleting'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"is_new" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"fields" jsonb NOT NULL,
	"expected_revision" integer,
	"expected_size" bigint NOT NULL,
	"expected_type" text NOT NULL,
	"checksum" text NOT NULL,
	"file_name" text NOT NULL,
	"staging_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"result_version_id" uuid,
	"failure" text,
	"staging_cleaned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "uploads_result_version_id_unique" UNIQUE("result_version_id"),
	CONSTRAINT "uploads_state_valid" CHECK ("uploads"."state" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "workspace_storage" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "storage_nonnegative" CHECK ("workspace_storage"."used_bytes" >= 0 and "workspace_storage"."reserved_bytes" >= 0 and "workspace_storage"."pending_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_topic_links" ADD CONSTRAINT "material_topic_links_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_topic_links" ADD CONSTRAINT "material_topic_links_workspace_id_course_id_topic_id_topics_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","topic_id") REFERENCES "public"."topics"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_workspace_id_course_id_source_object_id_file_objects_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","source_object_id") REFERENCES "public"."file_objects"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_current_version_id_material_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."material_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_candidates" ADD CONSTRAINT "upload_candidates_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_course_id_material_id_result_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","result_version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage" ADD CONSTRAINT "workspace_storage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_list_idx" ON "materials" USING btree ("workspace_id","course_id","archived","id");--> statement-breakpoint
CREATE INDEX "uploads_maintenance_idx" ON "uploads" USING btree ("state","expires_at");
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_current_version_scope_fk" FOREIGN KEY ("workspace_id","course_id","id","current_version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION rawi_immutable_material_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Material history is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_material_versions BEFORE UPDATE OR DELETE ON material_versions FOR EACH ROW EXECUTE FUNCTION rawi_immutable_material_content();
--> statement-breakpoint
CREATE TRIGGER immutable_passages BEFORE UPDATE OR DELETE ON passages FOR EACH ROW EXECUTE FUNCTION rawi_immutable_material_content();
--> statement-breakpoint
CREATE TRIGGER immutable_file_objects BEFORE UPDATE OR DELETE ON file_objects FOR EACH ROW EXECUTE FUNCTION rawi_immutable_material_content();
