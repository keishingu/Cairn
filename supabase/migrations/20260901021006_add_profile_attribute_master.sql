CREATE TABLE "public"."workspace_profile_attributes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text DEFAULT 'slate' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_profile_attributes_workspace_id_name_unique" UNIQUE("workspace_id", "name"),
  CONSTRAINT "workspace_profile_attributes_color_check"
    CHECK ("color" IN ('slate', 'blue', 'emerald', 'amber', 'violet', 'rose'))
);

CREATE TABLE "public"."workspace_member_profile_attributes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_member_id" uuid NOT NULL REFERENCES "public"."workspace_members"("id") ON DELETE CASCADE,
  "profile_attribute_id" uuid NOT NULL REFERENCES "public"."workspace_profile_attributes"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_member_profile_attributes_member_attribute_unique"
    UNIQUE("workspace_member_id", "profile_attribute_id")
);

CREATE INDEX "workspace_member_profile_attributes_attribute_idx"
  ON "public"."workspace_member_profile_attributes" ("profile_attribute_id");

ALTER TABLE "public"."workspace_profile_attributes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_member_profile_attributes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."workspace_profile_attributes" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."workspace_member_profile_attributes" FROM anon, authenticated;

-- 先行実装の文字列属性を、ワークスペース単位のマスターと割当に移す。
INSERT INTO "public"."workspace_profile_attributes" ("workspace_id", "name")
SELECT DISTINCT member."workspace_id", attribute."name"
FROM "public"."workspace_members" AS member
CROSS JOIN LATERAL jsonb_array_elements_text(member."profile_attributes") AS attribute("name")
WHERE btrim(attribute."name") <> ''
ON CONFLICT ("workspace_id", "name") DO NOTHING;

INSERT INTO "public"."workspace_member_profile_attributes" ("workspace_member_id", "profile_attribute_id")
SELECT member."id", attribute_master."id"
FROM "public"."workspace_members" AS member
CROSS JOIN LATERAL jsonb_array_elements_text(member."profile_attributes") AS attribute("name")
INNER JOIN "public"."workspace_profile_attributes" AS attribute_master
  ON attribute_master."workspace_id" = member."workspace_id"
  AND attribute_master."name" = attribute."name"
ON CONFLICT ("workspace_member_id", "profile_attribute_id") DO NOTHING;
