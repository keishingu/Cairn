ALTER TABLE "workspace_members" ADD COLUMN "profile_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE OR REPLACE VIEW "public"."active_workspace_members" AS
  SELECT "id", "workspace_id", "user_id", "role", "joined_at", "avatar_url", "status", "status_message", "membership_status", "deactivated_at", "deactivated_by", "display_name", "profile_attributes"
  FROM "workspace_members"
  WHERE "membership_status" = 'active';
