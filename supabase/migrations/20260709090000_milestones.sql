CREATE TABLE "milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "start_date" date,
  "end_date" date,
  "completed" boolean DEFAULT false NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_milestones_project" ON "milestones" USING btree ("project_id", "start_date");

ALTER TABLE "channels" ADD COLUMN "milestone_id" uuid REFERENCES "milestones"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "idx_channels_milestone_unique" ON "channels" USING btree ("milestone_id");
