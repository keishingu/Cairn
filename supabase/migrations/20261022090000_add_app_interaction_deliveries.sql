-- アプリへのインタラクション（ボタン押下・選択・モーダル送信）の配送ログ。設定画面でアプリ管理者が直近の失敗を見るため。
-- ペイロードは残さない。サーバー（service role / 直接接続）からのみ読み書きする。設計は docs/app-platform-design.md §5.4
CREATE TABLE "app_interaction_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"action_id" text,
	"status" text NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_interaction_deliveries_status_known" CHECK ("app_interaction_deliveries"."status" in ('delivered', 'failed', 'timeout', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "app_interaction_deliveries" ADD CONSTRAINT "app_interaction_deliveries_installation_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_interaction_deliveries" ADD CONSTRAINT "app_interaction_deliveries_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_interaction_deliveries_installation_created_idx" ON "app_interaction_deliveries" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "app_interaction_deliveries_created_idx" ON "app_interaction_deliveries" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "app_interaction_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "app_interaction_deliveries" FROM anon, authenticated;
