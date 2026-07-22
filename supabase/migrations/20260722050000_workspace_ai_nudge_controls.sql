ALTER TABLE "workspaces"
  ADD COLUMN "ai_nudges_phase_one_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_input_tokens" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_output_tokens" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_total_tokens" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "ai_nudges_phase_two_request_count" integer DEFAULT 0 NOT NULL;
