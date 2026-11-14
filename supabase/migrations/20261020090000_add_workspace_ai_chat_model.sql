-- 1 文で列と CHECK 制約を追加し、Supabase CLI がトランザクションなしで実行しても中途半端な状態を残さない。
-- 既定は従来の GPT-5 なので、既存ワークスペースの挙動は変わらず、旧コードが新スキーマで動いても問題ない。
ALTER TABLE "workspaces"
  ADD COLUMN "ai_chat_model" text DEFAULT 'gpt-5' NOT NULL,
  ADD CONSTRAINT "workspaces_ai_chat_model_check" CHECK ("ai_chat_model" in ('gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5'));
