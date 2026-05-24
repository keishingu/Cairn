-- ai_conversations をワークスペースレベルの会話に対応させる
-- project_id・agent_id を nullable にし、workspace_id と title カラムを追加する

ALTER TABLE "ai_conversations"
  ALTER COLUMN "project_id" DROP NOT NULL,
  ALTER COLUMN "agent_id" DROP NOT NULL;

ALTER TABLE "ai_conversations"
  ADD COLUMN "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD COLUMN "title" text;

CREATE INDEX "idx_ai_conversations_workspace" ON "ai_conversations" ("workspace_id");
