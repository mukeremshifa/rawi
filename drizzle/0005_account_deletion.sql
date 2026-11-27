ALTER TABLE "ai_operations" DROP CONSTRAINT "ai_operations_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk";
--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_in_course_scope_fk";
--> statement-breakpoint
ALTER TABLE "development_seeds" DROP CONSTRAINT "development_seeds_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "exam_configs" DROP CONSTRAINT "exam_configs_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "file_objects" DROP CONSTRAINT "file_objects_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_attempts" DROP CONSTRAINT "learning_attempts_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_operations" DROP CONSTRAINT "learning_operations_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_runs" DROP CONSTRAINT "learning_runs_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_sets" DROP CONSTRAINT "learning_sets_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "material_versions" DROP CONSTRAINT "material_versions_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk";
--> statement-breakpoint
ALTER TABLE "materials" DROP CONSTRAINT "materials_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "outline_changes" DROP CONSTRAINT "outline_changes_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "outline_jobs" DROP CONSTRAINT "outline_jobs_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_proposals" DROP CONSTRAINT "plan_proposals_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "planned_sessions" DROP CONSTRAINT "planned_sessions_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "planner_state" DROP CONSTRAINT "planner_state_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "reminder_states" DROP CONSTRAINT "reminder_states_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "run_answers" DROP CONSTRAINT "run_answers_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk";
--> statement-breakpoint
ALTER TABLE "run_answers" DROP CONSTRAINT "run_answers_workspace_id_course_id_set_id_item_id_set_items_workspace_id_course_id_set_id_id_fk";
--> statement-breakpoint
ALTER TABLE "set_items" DROP CONSTRAINT "set_items_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk";
--> statement-breakpoint
ALTER TABLE "tutor_messages" DROP CONSTRAINT "tutor_messages_workspace_id_course_id_session_id_tutor_sessions_workspace_id_course_id_id_fk";
--> statement-breakpoint
ALTER TABLE "tutor_sessions" DROP CONSTRAINT "tutor_sessions_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "upload_candidates" DROP CONSTRAINT "upload_candidates_upload_id_uploads_id_fk";
--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_workspace_id_course_id_courses_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_storage" DROP CONSTRAINT "workspace_storage_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workspace_id_course_id_material_id_version_id_material_versions_workspace_id_course_id_material_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id","version_id") REFERENCES "public"."material_versions"("workspace_id","course_id","material_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_in_course_scope_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_seeds" ADD CONSTRAINT "development_seeds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_configs" ADD CONSTRAINT "exam_configs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_operations" ADD CONSTRAINT "learning_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_runs" ADD CONSTRAINT "learning_runs_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sets" ADD CONSTRAINT "learning_sets_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_workspace_id_course_id_material_id_materials_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","material_id") REFERENCES "public"."materials"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_changes" ADD CONSTRAINT "outline_changes_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_jobs" ADD CONSTRAINT "outline_jobs_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_state" ADD CONSTRAINT "planner_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_states" ADD CONSTRAINT "reminder_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_run_id_learning_runs_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","run_id") REFERENCES "public"."learning_runs"("workspace_id","course_id","set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_answers" ADD CONSTRAINT "run_answers_workspace_id_course_id_set_id_item_id_set_items_workspace_id_course_id_set_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id","item_id") REFERENCES "public"."set_items"("workspace_id","course_id","set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_items" ADD CONSTRAINT "set_items_workspace_id_course_id_set_id_learning_sets_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","set_id") REFERENCES "public"."learning_sets"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_workspace_id_course_id_session_id_tutor_sessions_workspace_id_course_id_id_fk" FOREIGN KEY ("workspace_id","course_id","session_id") REFERENCES "public"."tutor_sessions"("workspace_id","course_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_candidates" ADD CONSTRAINT "upload_candidates_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_storage" ADD CONSTRAINT "workspace_storage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;