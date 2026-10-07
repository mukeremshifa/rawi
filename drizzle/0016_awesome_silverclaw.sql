DROP INDEX "assessments_calendar_idx";--> statement-breakpoint
DROP INDEX "planned_sessions_calendar_idx";--> statement-breakpoint
DROP INDEX learning_operations_age_idx;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rawi_guard_run_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_state text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.workspace_id,NEW.course_id,NEW.run_id,NEW.set_id,NEW.item_id) IS DISTINCT FROM (OLD.workspace_id,OLD.course_id,OLD.run_id,OLD.set_id,OLD.item_id) THEN RAISE EXCEPTION 'Answer identity is immutable'; END IF;
 SELECT state INTO run_state FROM learning_runs WHERE id=COALESCE(NEW.run_id,OLD.run_id) FOR UPDATE;
 IF run_state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Submitted answers are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
ALTER TABLE set_items ADD CONSTRAINT set_question_unique UNIQUE(set_id,question_id);
ALTER TABLE question_versions ADD CONSTRAINT question_document_valid CHECK ((jsonb_typeof(content)='object' AND content->>'id'=id::text AND content->>'courseId'=course_id::text AND content->>'format' IN ('flashcard','multiple-choice','multiple-select','matching','ordering','fill-blank','written-recall','source-analysis','essay') AND content->>'difficulty' IN ('recall','reasoning','stretch') AND (content->>'marks')::numeric > 0 AND content->>'topicId' IS NOT NULL AND content->>'topicLabel' IS NOT NULL) IS TRUE);
ALTER TABLE assessments ADD CONSTRAINT assessment_required_fields CHECK ((content->>'id'=id::text AND content->>'courseId'=course_id::text AND content->>'date'=date::text) IS TRUE);
ALTER TABLE planned_sessions ADD CONSTRAINT planned_required_fields CHECK ((content->>'id'=id::text AND content->>'courseId'=course_id::text AND content->>'date'=date::text AND status IS NOT NULL AND activity IS NOT NULL AND (content->>'durationMinutes')::int > 0) IS TRUE);
ALTER TABLE ai_operations ADD CONSTRAINT active_execution_state CHECK ((state='running')=(active_execution_id IS NOT NULL));
ALTER TABLE ai_executions ADD CONSTRAINT execution_charge_valid CHECK ((state='settled' AND charged_micros IS NOT NULL) OR (state='released' AND charged_micros=0) OR (state IN ('reserved','ambiguous') AND charged_micros IS NULL));
CREATE UNIQUE INDEX ai_execution_one_unsettled_idx ON ai_executions(operation_id) WHERE state IN ('reserved','ambiguous');
--> statement-breakpoint
CREATE FUNCTION rawi_guard_ai_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.task='tutor' AND NOT EXISTS(SELECT 1 FROM tutor_sessions t WHERE t.workspace_id=NEW.workspace_id AND t.course_id=NEW.course_id AND t.id=NEW.target_id) THEN RAISE EXCEPTION 'Tutor operation target mismatch'; END IF;
 IF NEW.task='grade' AND NOT EXISTS(SELECT 1 FROM learning_attempts a WHERE a.workspace_id=NEW.workspace_id AND a.course_id=NEW.course_id AND a.id=NEW.target_id) THEN RAISE EXCEPTION 'Grade operation target mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_ai_target BEFORE INSERT OR UPDATE OF workspace_id,course_id,target_id,task ON ai_operations FOR EACH ROW EXECUTE FUNCTION rawi_guard_ai_target();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_execution_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.workspace_id,NEW.operation_id,NEW.id,NEW.reserved_micros) IS DISTINCT FROM (OLD.workspace_id,OLD.operation_id,OLD.id,OLD.reserved_micros) THEN RAISE EXCEPTION 'Execution identity and reservation are immutable'; END IF;
 IF OLD.state IN ('settled','released') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Settled execution is immutable'; END IF;
 IF OLD.state='ambiguous' AND NEW.state NOT IN ('ambiguous','settled') THEN RAISE EXCEPTION 'Uncertain charges must be reconciled'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_execution_transition BEFORE UPDATE ON ai_executions FOR EACH ROW EXECUTE FUNCTION rawi_guard_execution_transition();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_fixed_attempt_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT count(*) FROM set_items WHERE set_id=NEW.set_id) <> jsonb_array_length(NEW.snapshot->'questions') OR (SELECT count(DISTINCT q->'question'->>'id') FROM jsonb_array_elements(NEW.snapshot->'questions') q) <> jsonb_array_length(NEW.snapshot->'questions') THEN RAISE EXCEPTION 'Attempt must contain its entire fixed set exactly once'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_fixed_attempt_set BEFORE INSERT ON learning_attempts FOR EACH ROW EXECUTE FUNCTION rawi_guard_fixed_attempt_set();
--> statement-breakpoint
CREATE FUNCTION rawi_guard_planned_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref jsonb; completed text;
BEGIN
 ref=NEW.content->'link'; completed=NEW.content->>'completedBy';
 IF TG_OP='UPDATE' AND OLD.content->>'completedBy' IS NOT NULL AND (NEW.content->>'completedBy',NEW.content->>'completedAt',NEW.content->>'status') IS DISTINCT FROM (OLD.content->>'completedBy',OLD.content->>'completedAt',OLD.content->>'status') THEN RAISE EXCEPTION 'Activity completion is immutable'; END IF;
 IF completed IS NOT NULL AND NOT EXISTS(SELECT 1 FROM learning_attempts a WHERE a.workspace_id=NEW.workspace_id AND a.course_id=NEW.course_id AND a.id::text=completed) AND NOT EXISTS(SELECT 1 FROM tutor_sessions t WHERE t.workspace_id=NEW.workspace_id AND t.course_id=NEW.course_id AND t.id::text=completed) THEN RAISE EXCEPTION 'Completion is outside the course'; END IF;
 IF ref->>'kind'='material' AND NOT EXISTS(SELECT 1 FROM materials m WHERE m.workspace_id=NEW.workspace_id AND m.course_id=NEW.course_id AND m.id::text=ref->>'materialId') THEN RAISE EXCEPTION 'Planned material is outside the course'; END IF;
 IF ref->>'kind'='practice-set' AND NOT EXISTS(SELECT 1 FROM learning_sets t WHERE t.workspace_id=NEW.workspace_id AND t.course_id=NEW.course_id AND t.id::text=ref->>'setId') THEN RAISE EXCEPTION 'Planned set is outside the course'; END IF;
 IF ref->>'kind'='exam-config' AND NOT EXISTS(SELECT 1 FROM exam_configs e WHERE e.workspace_id=NEW.workspace_id AND e.course_id=NEW.course_id AND e.id::text=ref->>'configId') THEN RAISE EXCEPTION 'Planned exam is outside the course'; END IF;
 IF ref->>'kind'='mistake-review' AND NOT EXISTS(SELECT 1 FROM learning_attempts a WHERE a.workspace_id=NEW.workspace_id AND a.course_id=NEW.course_id AND a.id::text=ref->>'attemptId') THEN RAISE EXCEPTION 'Planned review is outside the course'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER guard_planned_references AFTER INSERT OR UPDATE ON planned_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rawi_guard_planned_references();
