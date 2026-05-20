-- channelsテーブルのワークスペース・プロジェクト検索を高速化するためのインデックス
CREATE INDEX IF NOT EXISTS "idx_channels_workspace_type" ON "channels" USING btree ("workspace_id","type");
CREATE INDEX IF NOT EXISTS "idx_channels_project" ON "channels" USING btree ("project_id");
