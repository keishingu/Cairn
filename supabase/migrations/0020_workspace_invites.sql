-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

CREATE TABLE "workspace_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "token" text NOT NULL,
  "created_by" uuid NOT NULL,
  "expires_at" timestamp with time zone,
  "max_uses" integer,
  "use_count" integer NOT NULL DEFAULT 0,
  "role" "workspace_role" NOT NULL DEFAULT 'member',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_invites_token_unique" UNIQUE ("token")
);

ALTER TABLE "workspace_invites"
  ADD CONSTRAINT "workspace_invites_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;

ALTER TABLE "workspace_invites"
  ADD CONSTRAINT "workspace_invites_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");
