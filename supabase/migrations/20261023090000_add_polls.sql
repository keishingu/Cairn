-- ファーストパーティの投票アプリが持つテーブル。設計は docs/app-platform-design.md §7.2〜§7.4。
-- サーバー（service role / 直接接続）からのみ読み書きする。
-- 表を作ってから RLS・REVOKE までの間に authenticated から投票などを書き込まれないよう、1つの DO ブロックで同時に作る
-- （Supabase CLI は文ごとにトランザクションなしで流す。新しい表は既定で anon・authenticated に権限が付く）
DO $$
BEGIN
  CREATE TABLE "polls" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"installation_id" uuid NOT NULL,
  	"channel_id" uuid NOT NULL,
  	"message_id" uuid,
  	"created_by" uuid,
  	"question" text NOT NULL,
  	"allow_multiple" boolean DEFAULT false NOT NULL,
  	"anonymous" boolean DEFAULT false NOT NULL,
  	"status" text DEFAULT 'pending_post' NOT NULL,
  	"post_error" text,
  	"idempotency_key" text NOT NULL,
  	"client_msg_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  	"version" integer DEFAULT 0 NOT NULL,
  	"rendered_version" integer DEFAULT -1 NOT NULL,
  	"closes_at" timestamp with time zone,
  	"closed_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "polls_status_known" CHECK ("polls"."status" in ('pending_post', 'posted', 'closed', 'post_failed')),
  	CONSTRAINT "polls_question_not_empty" CHECK (length(trim("polls"."question")) > 0)
  );

  CREATE TABLE "poll_options" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"poll_id" uuid NOT NULL,
  	"label" text NOT NULL,
  	"position" integer NOT NULL,
  	CONSTRAINT "poll_options_poll_position_unique" UNIQUE("poll_id","position")
  );

  CREATE TABLE "poll_votes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"poll_id" uuid NOT NULL,
  	"option_id" uuid NOT NULL,
  	"user_id" uuid NOT NULL,
  	"allow_multiple" boolean NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "poll_votes_poll_option_user_unique" UNIQUE("poll_id","option_id","user_id")
  );

  CREATE TABLE "poll_processed_interactions" (
  	"interaction_id" uuid PRIMARY KEY NOT NULL,
  	"poll_id" uuid NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "polls" ADD CONSTRAINT "polls_installation_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "polls" ADD CONSTRAINT "polls_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "polls" ADD CONSTRAINT "polls_message_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poll_processed_interactions" ADD CONSTRAINT "poll_processed_interactions_poll_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "polls_installation_idempotency_idx" ON "polls" USING btree ("installation_id","idempotency_key");
  CREATE UNIQUE INDEX "polls_message_idx" ON "polls" USING btree ("message_id");
  CREATE UNIQUE INDEX "polls_client_msg_idx" ON "polls" USING btree ("client_msg_id");
  -- 描画待ち・投稿待ちを拾い直す cron 用
  CREATE INDEX "polls_needs_render_idx" ON "polls" USING btree ("updated_at") WHERE ("polls"."version" > "polls"."rendered_version" or "polls"."status" = 'pending_post') and "polls"."status" <> 'post_failed';
  -- 単一選択の1人1票を DB で強制する（並行の二重投票も防ぐ）
  CREATE UNIQUE INDEX "poll_votes_single_choice_idx" ON "poll_votes" USING btree ("poll_id","user_id") WHERE "poll_votes"."allow_multiple" = false;
  CREATE INDEX "poll_votes_poll_idx" ON "poll_votes" USING btree ("poll_id");
  CREATE INDEX "poll_processed_interactions_created_idx" ON "poll_processed_interactions" USING btree ("created_at");
  ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "poll_options" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "poll_processed_interactions" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE "polls", "poll_options", "poll_votes", "poll_processed_interactions" FROM anon, authenticated;
END
$$;
