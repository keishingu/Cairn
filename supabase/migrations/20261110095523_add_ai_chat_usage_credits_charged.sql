-- /ai の消費クレジットを、送信前の見積もり（request_credits）から原価に応じた精算へ切り替える。
-- 既存の行は精算前なので null のまま残す（後方互換: 旧コードはこの2列を書かない）。
ALTER TABLE "ai_chat_usage" ADD COLUMN IF NOT EXISTS "cost_usd" numeric(12, 6);
ALTER TABLE "ai_chat_usage" ADD COLUMN IF NOT EXISTS "credits_charged" integer;
CREATE INDEX IF NOT EXISTS "idx_ai_chat_usage_workspace_user_created" ON "ai_chat_usage" USING btree ("workspace_id","user_id","created_at");
