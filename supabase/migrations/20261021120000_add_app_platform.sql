-- アプリ（プラグイン）基盤の第1段階。Bot 送信者・Block Kit 互換カード・インタラクションの土台になる。
-- 設計は docs/app-platform-design.md。テーブルはすべてサーバー（service role / 直接接続）からのみ読み書きする。

-- Bot はアプリのインストールごとの送信者。auth.users を持たず、workspace_members にも入らない。
-- 既存行は人間なので既定値 'human' で埋める。
ALTER TABLE "profiles" ADD COLUMN "kind" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_kind_check" CHECK ("profiles"."kind" in ('human', 'bot'));--> statement-breakpoint

-- アプリが投稿するカード。本体は message_blocks に置き、messages.content は代替テキストにする。
ALTER TYPE "public"."message_type" ADD VALUE IF NOT EXISTS 'blocks';--> statement-breakpoint

CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_url" text,
	"owner_workspace_id" uuid,
	"request_url" text,
	"signing_secret_encrypted" text,
	"requested_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"entry_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_slug_format" CHECK ("apps"."slug" ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
	CONSTRAINT "apps_name_not_empty" CHECK (length(trim("apps"."name")) > 0),
	CONSTRAINT "apps_requested_scopes_known" CHECK ("apps"."requested_scopes" <@ array['chat:write', 'users:read', 'channels:read']::text[]),
	CONSTRAINT "apps_entry_points_array" CHECK (jsonb_typeof("apps"."entry_points") = 'array'),
	CONSTRAINT "apps_request_url_has_secret" CHECK ("apps"."request_url" is null or "apps"."signing_secret_encrypted" is not null)
);
--> statement-breakpoint
CREATE TABLE "app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"bot_profile_id" uuid NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"installed_by" uuid,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "app_installations_granted_scopes_known" CHECK ("app_installations"."granted_scopes" <@ array['chat:write', 'users:read', 'channels:read']::text[])
);
--> statement-breakpoint
CREATE TABLE "app_bot_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_encrypted" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rate_limit_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_limit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_bot_tokens_rate_limit_count_nonnegative" CHECK ("app_bot_tokens"."rate_limit_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app_channel_memberships" (
	"installation_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_channel_memberships_installation_id_channel_id_pk" PRIMARY KEY("installation_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "message_blocks" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"installation_id" uuid NOT NULL,
	"blocks" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_blocks_blocks_array" CHECK (jsonb_typeof("message_blocks"."blocks") = 'array'),
	CONSTRAINT "message_blocks_schema_version_positive" CHECK ("message_blocks"."schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_owner_workspace_id_workspaces_id_fk" FOREIGN KEY ("owner_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_bot_profile_id_profiles_id_fk" FOREIGN KEY ("bot_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_installed_by_profiles_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_bot_tokens" ADD CONSTRAINT "app_bot_tokens_installation_id_app_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 旧プロジェクトチャンネルとその子スレッドは channels.workspace_id が null のまま残り得る（既存コードは projects.workspace_id で補っている）。
-- 下の複合 FK は channels.workspace_id との直接一致を要求するため、先に projects → 親チャンネルの順で埋める。
-- 値は既存コードの coalesce と同じなので、旧コードの挙動は変わらない
UPDATE "channels" AS c SET "workspace_id" = p."workspace_id"
FROM "projects" AS p
WHERE c."workspace_id" IS NULL AND c."project_id" = p."id";--> statement-breakpoint
UPDATE "channels" AS c SET "workspace_id" = parent."workspace_id"
FROM "channels" AS parent
WHERE c."workspace_id" IS NULL AND c."parent_channel_id" = parent."id" AND parent."workspace_id" IS NOT NULL;--> statement-breakpoint
-- 両方のワークスペースに所属するメンバーが、A のインストールを B のチャンネルへ紐づけると A の Bot トークンで B へ投稿できてしまう。
-- workspace_id を installation とチャンネルの両方へ複合 FK で一致させ、DB で拒否する
CREATE UNIQUE INDEX "app_installations_id_workspace_idx" ON "app_installations" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_id_workspace_idx" ON "channels" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "app_channel_memberships" ADD CONSTRAINT "app_channel_memberships_installation_workspace_fk" FOREIGN KEY ("installation_id","workspace_id") REFERENCES "public"."app_installations"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_channel_memberships" ADD CONSTRAINT "app_channel_memberships_channel_workspace_fk" FOREIGN KEY ("channel_id","workspace_id") REFERENCES "public"."channels"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_channel_memberships" ADD CONSTRAINT "app_channel_memberships_added_by_profiles_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_blocks" ADD CONSTRAINT "message_blocks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- インストールは取り消し（revoked_at）で止め、行は消さない。行が消えるのはワークスペースかアプリ自体の削除だけ。
-- NO ACTION だとワークスペース削除の cascade で messages より先に app_installations の検査が走り失敗するため cascade にする
ALTER TABLE "message_blocks" ADD CONSTRAINT "message_blocks_installation_id_app_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_first_party_slug_idx" ON "apps" USING btree ("slug") WHERE "apps"."owner_workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_workspace_slug_idx" ON "apps" USING btree ("owner_workspace_id","slug") WHERE "apps"."owner_workspace_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "app_installations_app_workspace_idx" ON "app_installations" USING btree ("app_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_installations_bot_profile_idx" ON "app_installations" USING btree ("bot_profile_id");--> statement-breakpoint
CREATE INDEX "app_installations_workspace_idx" ON "app_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_bot_tokens_token_hash_idx" ON "app_bot_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_bot_tokens_installation_idx" ON "app_bot_tokens" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "app_channel_memberships_channel_idx" ON "app_channel_memberships" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "message_blocks_installation_idx" ON "message_blocks" USING btree ("installation_id");--> statement-breakpoint

ALTER TABLE "apps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_bot_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_channel_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "apps", "app_installations", "app_bot_tokens", "app_channel_memberships", "message_blocks" FROM anon, authenticated;--> statement-breakpoint

-- カードの更新（chat.update）をチャンネルの購読者へ知らせる。購読者は table 名だけで REST 再取得するため、
-- 最大で数百 KB になり得る blocks を含む行全体は broadcast しない。message_blocks に channel_id がないため親メッセージから引く。
CREATE OR REPLACE FUNCTION public.broadcast_message_blocks_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
BEGIN
  SELECT channel_id INTO v_channel_id
  FROM public.messages
  WHERE id = COALESCE(NEW.message_id, OLD.message_id);

  IF v_channel_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NULL::public.message_blocks,
    NULL::public.message_blocks
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_message_blocks_changes() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER broadcast_message_blocks_changes
AFTER INSERT OR UPDATE OR DELETE ON public.message_blocks
FOR EACH ROW EXECUTE FUNCTION public.broadcast_message_blocks_changes();
