-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

-- Slack式のチャンネル種別と DM 参加者テーブルを追加
CREATE TYPE "channel_type" AS ENUM ('workspace', 'project', 'dm');

ALTER TABLE "channels"
  ADD COLUMN "type"        "channel_type" NOT NULL DEFAULT 'project',
  ALTER COLUMN "name"      DROP NOT NULL;

CREATE TABLE "channel_members" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "joined_at"  timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("channel_id", "user_id")
);
