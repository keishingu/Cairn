-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

CREATE TABLE "pinned_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "pinned_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pinned_projects_user_id_project_id_unique" UNIQUE ("user_id", "project_id")
);

CREATE INDEX "idx_pinned_projects_user" ON "pinned_projects" USING btree ("user_id", "workspace_id");

ALTER TABLE "pinned_projects"
  ADD CONSTRAINT "pinned_projects_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;

ALTER TABLE "pinned_projects"
  ADD CONSTRAINT "pinned_projects_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;

ALTER TABLE "pinned_projects"
  ADD CONSTRAINT "pinned_projects_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;
