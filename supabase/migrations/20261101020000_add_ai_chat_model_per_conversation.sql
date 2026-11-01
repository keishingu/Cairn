-- /ai のモデルを会話ごとに利用者が選べるようにする。
-- workspaces.ai_chat_model は「新しい会話の既定モデル」、ai_chat_allowed_models は「メンバーが選べるモデル」になる。
-- 既定は3つすべてを許可する。既定モデルは必ず許可したモデルに含め、空にはしない（CHECK で保証する）。
-- ai_conversations.model は会話で選んだモデル。null は旧データで、ワークスペースの既定モデルを使う。
-- 値の集合は @cairn/shared の AI_CHAT_MODELS と同じ。旧コードは新しい列を読まないため後方互換。
-- 各テーブルとも 1 文で列と CHECK 制約を追加し、トランザクションなしで実行しても中途半端な状態を残さない。
ALTER TABLE "workspaces"
  ADD COLUMN "ai_chat_allowed_models" text[] NOT NULL DEFAULT ARRAY['gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5']::text[],
  ADD CONSTRAINT "workspaces_ai_chat_allowed_models_check" CHECK (
    cardinality("ai_chat_allowed_models") > 0
    AND "ai_chat_allowed_models" <@ ARRAY['gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5']::text[]
    AND "ai_chat_model" = ANY ("ai_chat_allowed_models")
  );

ALTER TABLE "ai_conversations"
  ADD COLUMN "model" text,
  ADD CONSTRAINT "ai_conversations_model_check" CHECK ("model" IN ('gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5'));
