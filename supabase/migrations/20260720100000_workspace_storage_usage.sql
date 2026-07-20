-- Phase 0（計測）: ストレージ使用量の把握。制限・課金はまだかけない。
-- 詳細: docs/billing-implementation-design.md, docs/pricing-plan-design.md

CREATE TABLE "workspace_storage_usage" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"original_bytes" bigint DEFAULT 0 NOT NULL,
	"derived_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_storage_usage" ADD CONSTRAINT "workspace_storage_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- バックフィル1: files.file_size が NULL の既存行を Storage の実サイズで埋める
-- （upload-url + finalize / gallery アップロードは file_size を記録済みだが、
--   それ以前の行やギャップを Storage 側の実測値で補正する）
UPDATE "files" f
SET "file_size" = (o.metadata->>'size')::bigint
FROM storage.objects o
WHERE f."file_size" IS NULL
  AND f."storage_path" IS NOT NULL
  AND o.bucket_id IN ('gallery', 'chat-attachments')
  AND o.name = f."storage_path"
  AND o.metadata->>'size' IS NOT NULL;
--> statement-breakpoint

-- バックフィル2: workspace_storage_usage の初期値を files の実測合計から作る。
-- Phase 0 はアップロード前クライアント圧縮版のみの計測（オリジナル別保存は未実装）のため、
-- 実在する唯一の実体を original_bytes として扱う。derived_bytes は 0 のまま。
INSERT INTO "workspace_storage_usage" ("workspace_id", "original_bytes", "derived_bytes", "updated_at")
SELECT f."workspace_id", COALESCE(SUM(f."file_size"), 0), 0, now()
FROM "files" f
GROUP BY f."workspace_id"
ON CONFLICT ("workspace_id") DO UPDATE
SET "original_bytes" = EXCLUDED."original_bytes", "updated_at" = now();
