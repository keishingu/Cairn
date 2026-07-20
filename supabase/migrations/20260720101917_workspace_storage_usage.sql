-- Phase 0（計測）: ストレージ使用量の把握。制限・課金はまだかけない。
-- 使用量は files.file_size の都度集約（SUM）で算出する。専用カウンタは持たない。
--   - 計測フェーズはホットパスが無く、集約1発で十分（設定画面の時々の閲覧のみ）
--   - カウンタは CASCADE 削除（プロジェクト削除で files 行が消える等）でドリフトし、
--     再集計を伴わないと計測値が静かにズレる。enforcement がホットパスに乗る Phase 1 で、
--     トランザクション・reconciliation と一緒に正しく導入する
-- 詳細: docs/billing-implementation-design.md #4

-- workspace 単位の集約を軽くするためのインデックス（既存は project_id のみ）
CREATE INDEX IF NOT EXISTS "idx_files_workspace" ON "files" ("workspace_id");
--> statement-breakpoint

-- 既存 files.file_size の NULL 行を Storage の実サイズで補正する（SUM の正確性のため）。
-- SUM は NULL を無視するため、埋めないと過小計測になる。
UPDATE "files" f
SET "file_size" = (o.metadata->>'size')::bigint
FROM storage.objects o
WHERE f."file_size" IS NULL
  AND f."storage_path" IS NOT NULL
  AND o.bucket_id IN ('gallery', 'chat-attachments')
  AND o.name = f."storage_path"
  AND o.metadata->>'size' IS NOT NULL;
