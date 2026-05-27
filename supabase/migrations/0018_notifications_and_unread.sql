-- notification_type enum
CREATE TYPE "public"."notification_type" AS ENUM('mention', 'task', 'file', 'status', 'invite', 'reaction', 'ai');

-- channel_read_states: チャンネルごとの未読管理（ユーザー × チャンネル）
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
ALTER TABLE "channel_read_states"
  ADD CONSTRAINT "channel_read_states_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "channel_read_states_channel_id_channels_id_fk"
    FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "channel_read_states_last_read_message_id_messages_id_fk"
    FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_channel_read_states_user" ON "channel_read_states" ("user_id");

-- notifications: アプリ内通知
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "type" "public"."notification_type" NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "data" jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_notifications_user_created" ON "notifications" ("user_id", "created_at");

-- push_subscriptions: Web Push / Expo Push トークン管理
CREATE TABLE "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "device_type" text NOT NULL,
  "endpoint" text NOT NULL,
  "keys" jsonb,
  "expo_token" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "push_subscriptions_user_id_endpoint_unique" UNIQUE("user_id","endpoint")
);
ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" ("user_id");
