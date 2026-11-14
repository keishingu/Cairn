-- 1 文で列と CHECK 制約を追加し、Supabase CLI がトランザクションなしで実行しても中途半端な状態を残さない。
-- null は「未設定」で、既存ワークスペースのチャットは従来どおり動く。旧コードはこの列を読まないため後方互換。
-- 上限は @cairn/shared の AI_CHAT_SYSTEM_PROMPT_MAX_LENGTH と同じ。
ALTER TABLE "workspaces"
  ADD COLUMN "ai_chat_system_prompt" text,
  ADD CONSTRAINT "workspaces_ai_chat_system_prompt_length_check" CHECK (char_length("ai_chat_system_prompt") <= 10000);
