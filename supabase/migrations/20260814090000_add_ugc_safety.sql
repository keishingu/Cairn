CREATE TYPE "public"."content_report_reason" AS ENUM('harassment', 'discriminatory', 'sexual', 'violence', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint

CREATE TABLE "user_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "blocker_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "blocked_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_blocks_blocker_id_blocked_id_unique" UNIQUE("blocker_id", "blocked_id"),
  CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
);--> statement-breakpoint
CREATE INDEX "idx_user_blocks_blocked" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint

CREATE TABLE "content_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id"),
  "reporter_id" uuid NOT NULL REFERENCES "profiles"("id"),
  "reported_user_id" uuid NOT NULL REFERENCES "profiles"("id"),
  "reason" "content_report_reason" NOT NULL,
  "details" text,
  "content_snapshot" text NOT NULL,
  "status" "content_report_status" DEFAULT 'open' NOT NULL,
  "resolution_note" text,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid REFERENCES "profiles"("id"),
  "message_deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_reports_message_id_reporter_id_unique" UNIQUE("message_id", "reporter_id")
);--> statement-breakpoint
CREATE INDEX "idx_content_reports_status_created" ON "content_reports" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX "idx_content_reports_workspace" ON "content_reports" USING btree ("workspace_id");
