ALTER TABLE "workspaces"
  ADD COLUMN "ai_nudges_phase_one_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_input_tokens" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_output_tokens" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_total_tokens" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_request_count" bigint DEFAULT 0 NOT NULL;

-- 既存ワークスペースは Phase 2 を既定OFFにするため、すでに表示中の LLM ナッジも
-- 同時に隠す。再度ONにした後は、heartbeat が条件継続を確認したものだけ再表示する。
UPDATE "ai_nudges"
SET "status" = 'suppressed', "remind_after" = NULL
WHERE "detector" IN ('unanswered_ask', 'llm_risk')
  AND "status" = 'active';
