CREATE TABLE "public"."project_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text NOT NULL DEFAULT '#6B7280',
  "sort_order" integer NOT NULL,
  "legacy_role" "public"."project_member_role",
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "project_roles_workspace_id_name_unique" UNIQUE("workspace_id", "name"),
  CONSTRAINT "project_roles_workspace_id_legacy_role_unique" UNIQUE("workspace_id", "legacy_role")
);

ALTER TABLE "public"."project_roles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."project_roles" FROM anon, authenticated;

ALTER TABLE "public"."project_members"
  ADD COLUMN "role_id" uuid REFERENCES "public"."project_roles"("id");

CREATE INDEX "idx_project_members_role" ON "public"."project_members" ("role_id");

-- 既存ワークスペースには、新規ワークスペースと同じ3役割を用意する。
INSERT INTO "public"."project_roles" ("workspace_id", "name", "color", "sort_order", "legacy_role")
SELECT w."id", defaults."name", defaults."color", defaults."sort_order", defaults."legacy_role"::"public"."project_member_role"
FROM "public"."workspaces" w
CROSS JOIN (
  VALUES
    ('リーダー', '#3B82F6', 1, 'leader'),
    ('サブリーダー', '#8B5CF6', 2, 'subleader'),
    ('メンバー', '#6B7280', 3, 'member')
) AS defaults("name", "color", "sort_order", "legacy_role")
ON CONFLICT ("workspace_id", "legacy_role") DO NOTHING;

-- 旧ロールを実際に使っているワークスペースだけは、表示を失わないよう定義も引き継ぐ。
INSERT INTO "public"."project_roles" ("workspace_id", "name", "color", "sort_order", "legacy_role")
SELECT DISTINCT p."workspace_id", legacy."name", legacy."color", legacy."sort_order", legacy."legacy_role"::"public"."project_member_role"
FROM "public"."project_members" pm
INNER JOIN "public"."projects" p ON p."id" = pm."project_id"
INNER JOIN (
  VALUES
    ('reviewer', 'レビュワー', '#10B981', 4),
    ('observer', 'オブザーバー', '#F59E0B', 5)
) AS legacy("legacy_role", "name", "color", "sort_order") ON legacy."legacy_role" = pm."role"::text
ON CONFLICT ("workspace_id", "legacy_role") DO NOTHING;

UPDATE "public"."project_members" pm
SET "role_id" = pr."id"
FROM "public"."projects" p, "public"."project_roles" pr
WHERE p."id" = pm."project_id"
  AND pr."workspace_id" = p."workspace_id"
  AND pr."legacy_role" = pm."role";
