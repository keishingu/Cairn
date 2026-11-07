-- 外部チャットの取り込みを「一時保管してから発言者を確定して公開する」形に作り直す（docs/import-design.md）。
-- 旧設計（共通の取り込みプロフィール＋表示の上書き）は develop にだけ入り、実データは無いため、旧テーブルは破壊的に消す。
-- 複数の文を1つのトランザクションで適用するため DO ブロックにまとめる。

DO $$
BEGIN
  -- 旧設計で作ったメッセージ（共通の取り込みプロフィールが送信者）と、その表・プロフィールを消す
  DELETE FROM "messages" WHERE "sender_id" = '00000000-0000-4000-8000-00000000c0de';
  DROP TABLE IF EXISTS "imported_message_reactions";
  DROP TABLE IF EXISTS "imported_messages";
  DELETE FROM "profiles" WHERE "id" = '00000000-0000-4000-8000-00000000c0de';

  -- 取り込んだ過去ログの印。未読・AI の巡回の対象にせず、編集・削除もさせない。
  -- 既定値があるので、マイグレーションより先に動いた旧コードの INSERT は失敗しない
  ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "imported" boolean DEFAULT false NOT NULL;

  -- 投稿者ごとの取り込み用プロフィール（公開するときに作る）
  ALTER TABLE "import_identities" ADD COLUMN IF NOT EXISTS "profile_id" uuid;
  ALTER TABLE "import_identities"
    ADD CONSTRAINT "import_identities_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;

  -- 会話ごとの投稿者不明の扱いと、公開した件数
  ALTER TABLE "import_job_conversations" ADD COLUMN IF NOT EXISTS "unknown_policy" text DEFAULT 'include_unknown' NOT NULL;
  ALTER TABLE "import_job_conversations" ADD COLUMN IF NOT EXISTS "published_messages" integer DEFAULT 0 NOT NULL;
  ALTER TABLE "import_job_conversations"
    ADD CONSTRAINT "import_job_conversations_unknown_policy_check"
    CHECK ("import_job_conversations"."unknown_policy" in ('include_unknown', 'hold'));

  -- 一時保管のメッセージ
  CREATE TABLE "import_staged_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "source" text NOT NULL,
    "external_conversation_id" text NOT NULL,
    "external_message_id" text NOT NULL,
    "identity_id" uuid NOT NULL,
    "job_id" uuid,
    "sent_at" timestamp with time zone NOT NULL,
    "edited_at" timestamp with time zone,
    "text" text NOT NULL,
    "quoted_external_message_id" text,
    "reactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "media_object_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "published_message_id" uuid,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "import_staged_messages_external_key" UNIQUE("workspace_id","source","external_conversation_id","external_message_id")
  );
  ALTER TABLE "import_staged_messages" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "import_staged_messages"
    ADD CONSTRAINT "import_staged_messages_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "import_staged_messages"
    ADD CONSTRAINT "import_staged_messages_identity_id_import_identities_id_fk"
    FOREIGN KEY ("identity_id") REFERENCES "public"."import_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "import_staged_messages"
    ADD CONSTRAINT "import_staged_messages_job_id_import_jobs_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_staged_messages"
    ADD CONSTRAINT "import_staged_messages_published_message_id_messages_id_fk"
    FOREIGN KEY ("published_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "idx_import_staged_messages_identity" ON "import_staged_messages" USING btree ("identity_id");
  CREATE INDEX "idx_import_staged_messages_published" ON "import_staged_messages" USING btree ("published_message_id");

  -- 取り込みで作ったリアクション（紐づけの付け替え・解除で、本人が Cairn で付けたリアクションを動かさないため）
  CREATE TABLE "imported_reactions" (
    "reaction_id" uuid PRIMARY KEY NOT NULL,
    "workspace_id" uuid NOT NULL,
    "identity_id" uuid NOT NULL
  );
  ALTER TABLE "imported_reactions" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "imported_reactions"
    ADD CONSTRAINT "imported_reactions_reaction_id_message_reactions_id_fk"
    FOREIGN KEY ("reaction_id") REFERENCES "public"."message_reactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imported_reactions"
    ADD CONSTRAINT "imported_reactions_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imported_reactions"
    ADD CONSTRAINT "imported_reactions_identity_id_import_identities_id_fk"
    FOREIGN KEY ("identity_id") REFERENCES "public"."import_identities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "idx_imported_reactions_identity" ON "imported_reactions" USING btree ("identity_id");
END $$;
