DROP INDEX "attempts_chronology_idx";--> statement-breakpoint
CREATE INDEX "attempts_chronology_idx" ON "learning_attempts" USING btree ("workspace_id","course_id",("snapshot"->>'completedAt'),"id");