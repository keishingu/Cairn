-- ワークスペース設定を将来の拡張に備えて JSONB カラムで管理する
-- 専用カラム (project_label) から settings JSONB へ移行
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "project_label";
ALTER TABLE "workspaces" ADD COLUMN "settings" jsonb;
