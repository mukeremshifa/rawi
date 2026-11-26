CREATE TABLE "glosses" (
	"workspace_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"fact_id" uuid NOT NULL,
	"language" text NOT NULL,
	"term" text NOT NULL,
	"gloss" text NOT NULL,
	"explanation" text NOT NULL,
	"written_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glosses_fact_id_language_pk" PRIMARY KEY("fact_id","language")
);
--> statement-breakpoint
ALTER TABLE "item_results" ADD COLUMN "language_support" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "run_answers" ADD COLUMN "language_support" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_workspace_id_course_id_courses_workspace_id_id_fk" FOREIGN KEY ("workspace_id","course_id") REFERENCES "public"."courses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "glosses_course_idx" ON "glosses" USING btree ("workspace_id","course_id","language");