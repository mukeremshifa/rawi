CREATE TABLE "learning_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_attempts_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "learning_operations" (
	"workspace_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_operations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "learning_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "runs_scope_unique" UNIQUE("workspace_id","course_id","set_id","id"),
	CONSTRAINT "runs_state_valid" CHECK ("learning_runs"."state" in ('active', 'submitted'))
);
--> statement-breakpoint
CREATE TABLE "learning_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"feedback" text NOT NULL,
	"hints_allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sets_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "question_sources" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"question_id" uuid PRIMARY KEY NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_scope_unique" UNIQUE("workspace_id","course_id","id")
);
--> statement-breakpoint
CREATE TABLE "run_answers" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"hinted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "run_answers_run_id_item_id_pk" PRIMARY KEY("run_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "set_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "set_items_scope_unique" UNIQUE("workspace_id","course_id","set_id","id"),
	CONSTRAINT "set_items_order_unique" UNIQUE("set_id","position")
);
--> statement-breakpoint
ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_operations" ADD CONSTRAINT "learning_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD CONSTRAINT "learning_runs_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sets" ADD CONSTRAINT "learning_sets_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_workspace_id_course_id_question_id_question_versions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","question_id") REFERENCES "public"."question_versions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_item_id_set_items_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","item_id") REFERENCES "public"."set_items"("workspace_id","course_id","set_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_items" ADD CONSTRAINT "set_items_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_items" ADD CONSTRAINT "set_items_workspace_id_course_id_question_id_question_versions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","question_id") REFERENCES "public"."question_versions"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_course_idx" ON "learning_attempts" USING btree ("workspace_id","course_id","id");--> statement-breakpoint
CREATE INDEX "runs_workspace_idx" ON "learning_runs" USING btree ("workspace_id","state","id");--> statement-breakpoint
CREATE INDEX "sets_course_idx" ON "learning_sets" USING btree ("workspace_id","course_id","archived","id");--> statement-breakpoint
CREATE INDEX "questions_course_idx" ON "question_versions" USING btree ("workspace_id","course_id","id");
--> statement-breakpoint
CREATE FUNCTION rawi_immutable_learning_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Learning history is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_questions BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION rawi_immutable_learning_content();
--> statement-breakpoint
CREATE TRIGGER immutable_question_sources BEFORE UPDATE OR DELETE ON question_sources FOR EACH ROW EXECUTE FUNCTION rawi_immutable_learning_content();
--> statement-breakpoint
CREATE TRIGGER immutable_set_items BEFORE UPDATE OR DELETE ON set_items FOR EACH ROW EXECUTE FUNCTION rawi_immutable_learning_content();
--> statement-breakpoint
CREATE TRIGGER immutable_attempts BEFORE UPDATE OR DELETE ON learning_attempts FOR EACH ROW EXECUTE FUNCTION rawi_immutable_learning_content();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_run_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_state text;
BEGIN
  SELECT state INTO run_state FROM learning_runs WHERE id = COALESCE(NEW.run_id, OLD.run_id) FOR UPDATE;
  IF run_state <> 'active' THEN RAISE EXCEPTION 'Submitted answers are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_run_answer BEFORE INSERT OR UPDATE OR DELETE ON run_answers FOR EACH ROW EXECUTE FUNCTION rawi_guard_run_answer();
