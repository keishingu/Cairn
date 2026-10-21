-- アプリのモーダル（Slack の views）。設計は docs/app-platform-design.md §5.5。
-- どちらもサーバー（service role / 直接接続）からのみ読み書きする。

-- views.open に使う trigger_id。押した本人・インストールに結びつけ、発行から6秒・1回だけ使える
CREATE TABLE "app_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_triggers" ADD CONSTRAINT "app_triggers_installation_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_triggers" ADD CONSTRAINT "app_triggers_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_triggers" ADD CONSTRAINT "app_triggers_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_triggers_token_hash_idx" ON "app_triggers" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_triggers_expires_idx" ON "app_triggers" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "app_triggers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "app_triggers" FROM anon, authenticated;--> statement-breakpoint

-- モーダルを開いた・差し替えた・閉じたことを本人のユーザートピックへ知らせる。
-- 購読側は table 名だけで REST 再取得するため、view の中身を含む行全体は broadcast しない
CREATE OR REPLACE FUNCTION public.broadcast_app_views_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || COALESCE(NEW.user_id, OLD.user_id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NULL::public.app_views,
    NULL::public.app_views
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_app_views_changes() FROM PUBLIC;--> statement-breakpoint

-- app_views を作った時点で Broadcast のトリガーも付いているようにする（Supabase CLI は文ごとにトランザクションなしで流すため、
-- 別の文にすると、デプロイが重なった間に views.open で作られた行が通知されず、クライアントが空の一覧のまま気づかない）
DO $$
BEGIN
  CREATE TABLE "app_views" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"installation_id" uuid NOT NULL,
  	"user_id" uuid NOT NULL,
  	"channel_id" uuid,
  	"view" jsonb NOT NULL,
  	"hash" text NOT NULL,
  	"status" text DEFAULT 'open' NOT NULL,
  	"submitting_until" timestamp with time zone,
  	"schema_version" integer NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "app_views_status_known" CHECK ("app_views"."status" in ('open', 'submitted', 'closed')),
  	CONSTRAINT "app_views_view_object" CHECK (jsonb_typeof("app_views"."view") = 'object')
  );
  ALTER TABLE "app_views" ADD CONSTRAINT "app_views_installation_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_views" ADD CONSTRAINT "app_views_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_views" ADD CONSTRAINT "app_views_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "app_views_user_status_idx" ON "app_views" USING btree ("user_id","status");
  ALTER TABLE "app_views" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE "app_views" FROM anon, authenticated;
  CREATE TRIGGER broadcast_app_views_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.app_views
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_app_views_changes();
END
$$;
