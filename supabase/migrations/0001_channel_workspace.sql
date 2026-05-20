-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

-- channels テーブルを拡張してワークスペースレベルのチャンネルをサポート
ALTER TABLE "channels"
  ALTER COLUMN "project_id" DROP NOT NULL,
  ADD COLUMN "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD COLUMN "is_private"   boolean NOT NULL DEFAULT false;
