-- ファイル一覧（GET /api/files）を新しい順にカーソルでページ分割して読むため、
-- ワークスペース内の (created_at, id) 降順で先頭から辿れるインデックスを追加する。
CREATE INDEX IF NOT EXISTS "idx_files_workspace_created_at_id" ON "files" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
