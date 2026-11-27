-- Every AI call now goes through OpenRouter. The platform source serves it, keeps no prompts, and each
-- workspace's share is $0.50 a day and $5 a month. Own keys saved for Bedrock or Vertex no longer work.
UPDATE "funding_sources" SET "vendors" = '["openrouter"]', "retention" = 'none', "student_retention" = 'none',
  "per_workspace" = '{"dailyMicros":500000,"monthlyMicros":5000000,"concurrent":2}', "updated_at" = now()
  WHERE "id" = 'platform';--> statement-breakpoint
UPDATE "funding_sources" SET "active" = false, "updated_at" = now()
  WHERE "kind" = 'user' AND NOT ("vendors" @> '["openrouter"]');
