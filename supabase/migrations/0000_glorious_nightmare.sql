CREATE TYPE "public"."ai_scope" AS ENUM('workspace', 'project');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('attending', 'tentative', 'declined');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('workspace', 'project', 'dm');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('document', 'image', 'video', 'audio', 'other', 'link');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'html', 'system');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('mention', 'task', 'file', 'status', 'invite', 'reaction', 'ai');--> statement-breakpoint
CREATE TYPE "public"."project_member_role" AS ENUM('leader', 'subleader', 'member', 'reviewer', 'observer');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"ical_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_ical_token_unique" UNIQUE("ical_token")
);
--> statement-breakpoint
CREATE TABLE "project_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"sort_order" text NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_statuses_workspace_id_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	CONSTRAINT "tags_workspace_id_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "workspace_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"avatar_url" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"settings" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "member_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"level" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_member_role" DEFAULT 'member' NOT NULL,
	"attendance" "attendance_status" DEFAULT 'attending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_tags" (
	"project_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "project_tags_project_id_tag_id_unique" UNIQUE("project_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status_id" uuid,
	"start_date" date,
	"end_date" date,
	"cover_photo_url" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_members_channel_id_user_id_unique" UNIQUE("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"type" "channel_type" DEFAULT 'project' NOT NULL,
	"name" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_emoji_unique" UNIQUE("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"parent_message_id" uuid,
	"sender_id" uuid NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"storage_path" text,
	"file_name" text NOT NULL,
	"mime_type" text,
	"file_size" bigint,
	"file_type" "file_type" DEFAULT 'document' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gallery_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" text,
	"taken_at" timestamp with time zone,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gallery_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_likes_gallery_item_id_user_id_unique" UNIQUE("gallery_item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"scope" "ai_scope" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"model" text NOT NULL,
	"system_prompt" text,
	"agents_md" text,
	"html_template" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"agent_id" uuid,
	"title" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"annotations" jsonb,
	"tool_invocations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"integration_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_message_id" uuid,
	"unread_mention_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_read_states_user_id_channel_id_unique" UNIQUE("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_type" text NOT NULL,
	"endpoint" text,
	"keys" jsonb,
	"expo_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_push_web" UNIQUE("user_id","endpoint"),
	CONSTRAINT "uniq_push_expo" UNIQUE("user_id","expo_token")
);
--> statement-breakpoint
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_experiences" ADD CONSTRAINT "member_experiences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_id_project_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."project_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_comments" ADD CONSTRAINT "gallery_comments_gallery_item_id_gallery_items_id_fk" FOREIGN KEY ("gallery_item_id") REFERENCES "public"."gallery_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_comments" ADD CONSTRAINT "gallery_comments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_likes" ADD CONSTRAINT "gallery_likes_gallery_item_id_gallery_items_id_fk" FOREIGN KEY ("gallery_item_id") REFERENCES "public"."gallery_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_likes" ADD CONSTRAINT "gallery_likes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_integrations" ADD CONSTRAINT "external_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_projects_workspace" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "idx_projects_date" ON "projects" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_channels_workspace_type" ON "channels" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "idx_channels_project" ON "channels" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachments_message" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_messages_channel" ON "messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_files_project" ON "files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_gallery_project" ON "gallery_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_gallery_taken_at" ON "gallery_items" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_workspace" ON "ai_conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_document_chunks_workspace" ON "document_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_document_chunks_source" ON "document_chunks" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_channel_read_states_user" ON "channel_read_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");