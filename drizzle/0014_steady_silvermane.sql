CREATE TABLE "development_seed_records" (
	"workspace_id" uuid NOT NULL,
	"version" text NOT NULL,
	"key" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"baseline" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "development_seed_records_workspace_id_version_key_pk" PRIMARY KEY("workspace_id","version","key")
);
--> statement-breakpoint
CREATE TABLE "development_seeds" (
	"workspace_id" uuid NOT NULL,
	"version" text NOT NULL,
	"anchor_date" date NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_seeds_workspace_id_version_pk" PRIMARY KEY("workspace_id","version")
);
--> statement-breakpoint
ALTER TABLE "feedback_revisions" ALTER COLUMN "operation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "course_id" uuid GENERATED ALWAYS AS ((content->>'courseId')::uuid) STORED;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "at" text GENERATED ALWAYS AS (content->>'at') STORED;--> statement-breakpoint
ALTER TABLE "feedback_revisions" ADD COLUMN "sample_dataset" text;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD COLUMN "sample_dataset" text;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD COLUMN "assessment_id" uuid GENERATED ALWAYS AS ((content->>'assessmentId')::uuid) STORED;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD COLUMN "status" text GENERATED ALWAYS AS (content->>'status') STORED;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD COLUMN "activity" text GENERATED ALWAYS AS (content->>'activity') STORED;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD COLUMN "sample_dataset" text;--> statement-breakpoint
ALTER TABLE "development_seed_records" ADD CONSTRAINT "development_seed_records_workspace_id_version_development_seeds_workspace_id_version_fk" FOREIGN KEY ("workspace_id","version") REFERENCES "public"."development_seeds"("workspace_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_seeds" ADD CONSTRAINT "development_seeds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seed_records_entity_idx" ON "development_seed_records" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_in_course_scope_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_scope_unique" UNIQUE("workspace_id","course_id","id");
--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_assessment_scope_fk" FOREIGN KEY ("workspace_id","course_id","assessment_id") REFERENCES "public"."assessments"("workspace_id","course_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_calendar_idx" ON "assessments" USING btree ("workspace_id","date","id");--> statement-breakpoint
CREATE INDEX "attempts_chronology_idx" ON "learning_attempts" USING btree ("workspace_id","course_id",(snapshot->>'completedAt'),"id");--> statement-breakpoint
CREATE INDEX "planned_sessions_calendar_idx" ON "planned_sessions" USING btree ("workspace_id","date","id");--> statement-breakpoint
CREATE INDEX "tutor_chronology_idx" ON "tutor_sessions" USING btree ("workspace_id","course_id","created_at","id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_identity_unique" UNIQUE("provider_id","account_id");--> statement-breakpoint

--> statement-breakpoint
-- SQL-only guards complement the ORM foreign keys. JSON remains authoritative.
ALTER TABLE learning_sets ADD CONSTRAINT sets_valid CHECK (revision > 0 AND feedback IN ('immediate','end') AND purpose IN ('practice','exam'));
ALTER TABLE learning_sets ADD CONSTRAINT remediation_scope_fk FOREIGN KEY (workspace_id,course_id,remediates_attempt_id) REFERENCES learning_attempts(workspace_id,course_id,id);
ALTER TABLE set_items ADD CONSTRAINT item_position_nonnegative CHECK (position >= 0);
ALTER TABLE learning_runs ADD CONSTRAINT run_completion_valid CHECK (revision > 0 AND position >= 0 AND (state='submitted') = (completed_at IS NOT NULL) AND (completed_at IS NULL OR completed_at >= started_at));
ALTER TABLE exam_configs ADD CONSTRAINT exam_identity_valid CHECK (revision > 0 AND config->>'id'=id::text AND config->>'courseId'=course_id::text AND config->>'timing' IN ('overall','per-section','untimed'));
ALTER TABLE assessments ADD CONSTRAINT assessment_identity_valid CHECK (revision > 0 AND content->>'id'=id::text AND content->>'courseId'=course_id::text AND content->>'date'=date::text);
ALTER TABLE planned_sessions ADD CONSTRAINT planned_identity_valid CHECK (revision > 0 AND content->>'id'=id::text AND content->>'courseId'=course_id::text AND content->>'date'=date::text AND status IN ('planned','completed','skipped') AND activity IN ('tutor','read','practice','flashcards','exam','review','other') AND (content->>'durationMinutes')::int > 0 AND (content->>'startMinutes')::int BETWEEN 0 AND 1439);
ALTER TABLE planner_state ADD CONSTRAINT planner_revision_positive CHECK (revision > 0);
ALTER TABLE plan_proposals ADD CONSTRAINT proposal_revision_positive CHECK (base_revision > 0);
ALTER TABLE tutor_sessions ADD CONSTRAINT tutor_state_valid CHECK (revision > 0 AND stage IN ('orient','understand','recall','reason','apply','reflect') AND (NOT completed_learning OR ended_at IS NOT NULL));
ALTER TABLE tutor_messages ADD CONSTRAINT tutor_message_valid CHECK (ordinal >= 0 AND role IN ('student','tutor') AND state IN ('complete','blocked','cancelled','interrupted','failed'));
ALTER TABLE reminder_states ADD CONSTRAINT reminder_status_valid CHECK (status IN ('read','dismissed'));
ALTER TABLE uploads ADD CONSTRAINT upload_quantities_valid CHECK (expected_size > 0 AND (expected_revision IS NULL OR expected_revision > 0) AND (state='ready') = (result_version_id IS NOT NULL) AND (lease_token IS NULL) = (lease_expires_at IS NULL));
ALTER TABLE ai_operations ADD CONSTRAINT ai_state_valid CHECK (task IN ('tutor','generate','grade') AND state IN ('blocked','running','complete','failed','cancelled','interrupted'));
ALTER TABLE ai_executions ADD CONSTRAINT execution_state_valid CHECK (state IN ('reserved','settled','ambiguous','released') AND (state IN ('settled','released')) = (settled_at IS NOT NULL));
ALTER TABLE ai_executions ADD CONSTRAINT execution_operation_unique UNIQUE(workspace_id,operation_id,id);
ALTER TABLE ai_operations ADD CONSTRAINT active_execution_scope_fk FOREIGN KEY(workspace_id,id,active_execution_id) REFERENCES ai_executions(workspace_id,operation_id,id);
ALTER TABLE feedback_revisions ADD CONSTRAINT feedback_provenance_valid CHECK (revision > 0 AND ((operation_id IS NOT NULL AND sample_dataset IS NULL) OR (operation_id IS NULL AND sample_dataset IS NOT NULL AND grading->>'method'='sample')));
CREATE INDEX learning_operations_age_idx ON learning_operations(created_at);
--> statement-breakpoint
CREATE FUNCTION rawi_guard_submitted_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='submitted' THEN RAISE EXCEPTION 'Submitted run is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (NEW.workspace_id,NEW.course_id,NEW.set_id,NEW.id) IS DISTINCT FROM (OLD.workspace_id,OLD.course_id,OLD.set_id,OLD.id) THEN RAISE EXCEPTION 'Run identity is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_submitted_run BEFORE UPDATE OR DELETE ON learning_runs FOR EACH ROW EXECUTE FUNCTION rawi_guard_submitted_run();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_attempt_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.snapshot->>'id' IS DISTINCT FROM NEW.id::text OR NEW.snapshot->>'runId' IS DISTINCT FROM NEW.run_id::text OR NEW.snapshot->>'courseId' IS DISTINCT FROM NEW.course_id::text OR jsonb_typeof(NEW.snapshot->'questions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid attempt identity'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'questions') q WHERE NOT EXISTS (SELECT 1 FROM set_items i WHERE i.workspace_id=NEW.workspace_id AND i.course_id=NEW.course_id AND i.set_id=NEW.set_id AND i.question_id::text=q->'question'->>'id')) THEN RAISE EXCEPTION 'Attempt question is outside its fixed set'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_attempt_membership BEFORE INSERT ON learning_attempts FOR EACH ROW EXECUTE FUNCTION rawi_guard_attempt_membership();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; rs text; n int;
BEGIN
 IF TG_TABLE_NAME='learning_attempts' THEN rid=NEW.run_id; ELSE rid=NEW.id; END IF;
 SELECT state INTO rs FROM learning_runs WHERE id=rid;
 SELECT count(*) INTO n FROM learning_attempts WHERE run_id=rid;
 IF (rs='submitted' AND n<>1) OR (rs='active' AND n<>0) THEN RAISE EXCEPTION 'Run finalization must publish exactly one attempt'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER finalization_run AFTER INSERT OR UPDATE ON learning_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rawi_guard_finalization();
CREATE CONSTRAINT TRIGGER finalization_attempt AFTER INSERT ON learning_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rawi_guard_finalization();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_feedback_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q jsonb;
BEGIN
 SELECT item->'question' INTO q FROM learning_attempts a, jsonb_array_elements(a.snapshot->'questions') item WHERE a.id=NEW.attempt_id AND a.workspace_id=NEW.workspace_id AND a.course_id=NEW.course_id AND item->'question'->>'id'=NEW.question_id::text;
 IF q IS NULL THEN RAISE EXCEPTION 'Feedback question is absent from attempt'; END IF;
 IF NEW.operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ai_operations o WHERE o.id=NEW.operation_id AND o.workspace_id=NEW.workspace_id AND o.course_id=NEW.course_id AND o.task='grade' AND o.target_id=NEW.attempt_id) THEN RAISE EXCEPTION 'Feedback operation target mismatch'; END IF;
 IF NEW.grading->>'status'='graded' AND (jsonb_typeof(NEW.grading->'points') IS DISTINCT FROM 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.grading->'points') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'rubric') r WHERE r->>'id'=p->>'rubricId' AND (r->>'marks')::numeric=(p->>'max')::numeric AND (p->>'awarded')::numeric BETWEEN 0 AND (r->>'marks')::numeric))) THEN RAISE EXCEPTION 'Feedback points do not match the saved rubric'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_feedback_membership BEFORE INSERT ON feedback_revisions FOR EACH ROW EXECUTE FUNCTION rawi_guard_feedback_membership();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_document_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref jsonb; review jsonb;
BEGIN
 IF TG_TABLE_NAME='materials' THEN ref=NEW.note_source; ELSE ref=NEW.source; review=NEW.review; END IF;
 IF ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM passages p WHERE p.workspace_id=NEW.workspace_id AND p.course_id=NEW.course_id AND p.material_id::text=ref->>'materialId' AND p.version_id::text=ref->>'versionId' AND p.id::text=ref->>'passageId') THEN RAISE EXCEPTION 'Source reference is outside the course'; END IF;
 IF review IS NOT NULL AND NOT EXISTS (SELECT 1 FROM learning_attempts a, jsonb_array_elements(a.snapshot->'questions') q WHERE a.workspace_id=NEW.workspace_id AND a.course_id=NEW.course_id AND a.id::text=review->>'attemptId' AND q->'question'->>'id'=review->>'questionId') THEN RAISE EXCEPTION 'Reviewed question is absent from attempt'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_note_source BEFORE INSERT OR UPDATE OF note_source ON materials FOR EACH ROW EXECUTE FUNCTION rawi_guard_document_references();
CREATE TRIGGER guard_tutor_source BEFORE INSERT OR UPDATE OF source,review ON tutor_sessions FOR EACH ROW EXECUTE FUNCTION rawi_guard_document_references();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_tutor_citations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.provenance->'citations','[]'::jsonb)) r WHERE NOT EXISTS(SELECT 1 FROM passages p WHERE p.workspace_id=NEW.workspace_id AND p.course_id=NEW.course_id AND p.material_id::text=r->>'materialId' AND p.version_id::text=r->>'versionId' AND p.id::text=r->>'passageId')) THEN RAISE EXCEPTION 'Tutor citation is outside the course'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_tutor_citations BEFORE INSERT OR UPDATE OF provenance ON tutor_messages FOR EACH ROW EXECUTE FUNCTION rawi_guard_tutor_citations();
