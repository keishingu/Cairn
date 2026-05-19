-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

-- Enums
CREATE TYPE "workspace_role"       AS ENUM ('owner', 'admin', 'member', 'guest');
CREATE TYPE "project_member_role"  AS ENUM ('leader', 'subleader', 'member', 'reviewer', 'observer');
CREATE TYPE "attendance_status"    AS ENUM ('attending', 'tentative', 'declined');
CREATE TYPE "message_type"         AS ENUM ('text', 'html', 'system');
CREATE TYPE "file_type"            AS ENUM ('document', 'image', 'video', 'audio', 'other');
CREATE TYPE "task_status"          AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE "task_priority"        AS ENUM ('high', 'medium', 'low');
CREATE TYPE "ai_scope"             AS ENUM ('workspace', 'project');

-- profiles (id mirrors auth.users.id)
CREATE TABLE "profiles" (
  "id"           uuid PRIMARY KEY,
  "display_name" text NOT NULL,
  "avatar_url"   text,
  "bio"          text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- workspaces
CREATE TABLE "workspaces" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        text NOT NULL,
  "slug"        text NOT NULL UNIQUE,
  "description" text,
  "logo_url"    text,
  "created_by"  uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "workspace_members" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role"         "workspace_role" NOT NULL DEFAULT 'member',
  "joined_at"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("workspace_id", "user_id")
);

CREATE TABLE "tags" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "color"        text,
  UNIQUE ("workspace_id", "name")
);

CREATE TABLE "project_statuses" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "color"        text NOT NULL DEFAULT '#3B82F6',
  "sort_order"   text NOT NULL,
  "is_final"     boolean NOT NULL DEFAULT false,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("workspace_id", "name")
);

-- projects
CREATE TABLE "projects" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title"        text NOT NULL,
  "description"  text,
  "status_id"    uuid REFERENCES "project_statuses"("id"),
  "start_date"   date,
  "end_date"     date,
  "archived"     boolean NOT NULL DEFAULT false,
  "created_by"   uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_projects_workspace" ON "projects" ("workspace_id");
CREATE INDEX "idx_projects_status"    ON "projects" ("status_id");
CREATE INDEX "idx_projects_date"      ON "projects" ("start_date", "end_date");

CREATE TABLE "project_members" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role"       "project_member_role" NOT NULL DEFAULT 'member',
  "attendance" "attendance_status"   NOT NULL DEFAULT 'attending',
  "notes"      text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("project_id", "user_id")
);

CREATE TABLE "member_experiences" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "category"   text NOT NULL,
  "title"      text NOT NULL,
  "level"      text,
  "notes"      text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "project_tags" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "tag_id"     uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  UNIQUE ("project_id", "tag_id")
);

-- channels & messages
CREATE TABLE "channels" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name"       text NOT NULL DEFAULT 'general',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "messages" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id"        uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "parent_message_id" uuid,
  "sender_id"         uuid NOT NULL REFERENCES "profiles"("id"),
  "message_type"      "message_type" NOT NULL DEFAULT 'text',
  "content"           text NOT NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  "deleted_at"        timestamptz
);
CREATE INDEX "idx_messages_channel" ON "messages" ("channel_id", "created_at");

CREATE TABLE "message_reactions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "emoji"      text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("message_id", "user_id", "emoji")
);

-- files
CREATE TABLE "files" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id"   uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "uploaded_by"  uuid NOT NULL REFERENCES "profiles"("id"),
  "storage_path" text NOT NULL,
  "file_name"    text NOT NULL,
  "mime_type"    text,
  "file_size"    bigint,
  "file_type"    "file_type" NOT NULL DEFAULT 'document',
  "version"      integer NOT NULL DEFAULT 1,
  "metadata"     jsonb NOT NULL DEFAULT '{}',
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_files_project" ON "files" ("project_id");

-- gallery
CREATE TABLE "gallery_items" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"   uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "uploaded_by"  uuid NOT NULL REFERENCES "profiles"("id"),
  "file_id"      uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "caption"      text,
  "taken_at"     timestamptz,
  "latitude"     numeric(10, 7),
  "longitude"    numeric(10, 7),
  "metadata"     jsonb NOT NULL DEFAULT '{}',
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_gallery_project"  ON "gallery_items" ("project_id");
CREATE INDEX "idx_gallery_taken_at" ON "gallery_items" ("taken_at");

CREATE TABLE "gallery_comments" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gallery_item_id" uuid NOT NULL REFERENCES "gallery_items"("id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "content"         text NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "gallery_likes" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gallery_item_id" uuid NOT NULL REFERENCES "gallery_items"("id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("gallery_item_id", "user_id")
);

-- tasks
CREATE TABLE "tasks" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"  uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "title"       text NOT NULL,
  "description" text,
  "status"      "task_status"    NOT NULL DEFAULT 'todo',
  "priority"    "task_priority"  NOT NULL DEFAULT 'medium',
  "assignee_id" uuid REFERENCES "profiles"("id"),
  "due_date"    date,
  "created_by"  uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- AI
CREATE TABLE "ai_agents" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"    uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id"      uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "scope"           "ai_scope" NOT NULL,
  "name"            text NOT NULL,
  "description"     text,
  "model"           text NOT NULL,
  "system_prompt"   text,
  "agents_md"       text,
  "html_template"   text,
  "is_active"       boolean NOT NULL DEFAULT true,
  "created_by"      uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "ai_conversations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "agent_id"   uuid NOT NULL REFERENCES "ai_agents"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "ai_messages" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role"            text NOT NULL,
  "content"         text NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

-- integrations
CREATE TABLE "connected_accounts" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"             uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"                  uuid REFERENCES "profiles"("id") ON DELETE CASCADE,
  "provider"                 text NOT NULL,
  "provider_account_id"      text,
  "access_token_encrypted"   text,
  "refresh_token_encrypted"  text,
  "expires_at"               timestamptz,
  "metadata"                 jsonb NOT NULL DEFAULT '{}',
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "external_integrations" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"     uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider"         text NOT NULL,
  "integration_type" text NOT NULL,
  "config"           jsonb NOT NULL DEFAULT '{}',
  "is_active"        boolean NOT NULL DEFAULT true,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "external_events" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"        uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "provider"          text NOT NULL,
  "external_event_id" text NOT NULL,
  "sync_status"       text NOT NULL DEFAULT 'synced',
  "last_synced_at"    timestamptz,
  "metadata"          jsonb NOT NULL DEFAULT '{}',
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "audit_logs" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid REFERENCES "profiles"("id"),
  "entity_type"  text NOT NULL,
  "entity_id"    uuid,
  "action"       text NOT NULL,
  "payload"      jsonb NOT NULL DEFAULT '{}',
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
