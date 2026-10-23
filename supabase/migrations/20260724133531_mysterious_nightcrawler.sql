CREATE TABLE "workspace_storage_usage" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"original_bytes" bigint DEFAULT 0 NOT NULL,
	"derived_bytes" bigint DEFAULT 0 NOT NULL,
	"unbilled_rent_credits" numeric(20, 8) DEFAULT '0' NOT NULL,
	"last_rent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "derived_storage_path" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "derived_file_size" bigint;--> statement-breakpoint
ALTER TABLE "workspace_storage_usage" ADD CONSTRAINT "workspace_storage_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- 既存ギャラリー画像は、当時からクライアント側で圧縮済みの表示用データである。
-- 原本として家賃を請求しないよう圧縮派生へ移し、以後の閲覧パスも維持する。
UPDATE "files" f
SET
  "derived_storage_path" = f."storage_path",
  "derived_file_size" = f."file_size",
  "storage_path" = NULL,
  "file_size" = NULL
FROM "gallery_items" g
WHERE g."file_id" = f."id"
  AND f."storage_path" IS NOT NULL;
--> statement-breakpoint
-- Phase 0 の実測値を初期カウンタへ引き継ぐ。既存ギャラリー画像は上で圧縮派生へ
-- 再分類済みであり、家賃の起算は migration 適用時点からにする。
INSERT INTO "workspace_storage_usage" (
  "workspace_id",
  "original_bytes",
  "derived_bytes",
  "last_rent_at",
  "last_reconciled_at",
  "updated_at"
)
SELECT
  w."id",
  COALESCE(SUM(f."file_size"), 0),
  COALESCE(SUM(f."derived_file_size"), 0),
  now(),
  now(),
  now()
FROM "workspaces" w
LEFT JOIN "files" f ON f."workspace_id" = w."id"
GROUP BY w."id";
--> statement-breakpoint
-- Gallery は署名付きアップロードURLだけを受け付ける。認証済みユーザー全員が任意の
-- パスへ直接書き込める旧ポリシーを残すと、支援者本人のみというアップロード権を迂回できる。
DROP POLICY IF EXISTS "gallery_insert" ON storage.objects;
--> statement-breakpoint
-- オリジナルは非公開バケットへ分離し、表示用の gallery バケットから推測・直接取得できなくする。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery-originals',
  'gallery-originals',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;
