-- /ai チャット1依頼ごとのトークン使用量。クレジット単価を実測の原価で決め直すための記録（本文は保存しない）。
-- 会話・スキル run を削除しても原価は残すため FK は set null。assistant_message_id は失敗・返金した応答が ai_messages に残らないので FK を張らない。
CREATE TABLE "ai_chat_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"conversation_id" uuid,
	"assistant_message_id" uuid NOT NULL,
	"skill_run_id" uuid,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"request_credits" integer,
	"steps" integer NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_input_tokens" integer,
	"cache_creation_input_tokens" integer,
	"tool_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"step_usage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chat_usage_assistant_message_unique" UNIQUE("assistant_message_id"),
	CONSTRAINT "ai_chat_usage_status_known" CHECK ("ai_chat_usage"."status" in ('success', 'failed'))
);

ALTER TABLE "ai_chat_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_chat_usage" ADD CONSTRAINT "ai_chat_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_chat_usage" ADD CONSTRAINT "ai_chat_usage_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ai_chat_usage" ADD CONSTRAINT "ai_chat_usage_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ai_chat_usage" ADD CONSTRAINT "ai_chat_usage_skill_run_id_ai_automation_runs_id_fk" FOREIGN KEY ("skill_run_id") REFERENCES "public"."ai_automation_runs"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_ai_chat_usage_workspace_created" ON "ai_chat_usage" USING btree ("workspace_id","created_at");
CREATE INDEX "idx_ai_chat_usage_model_created" ON "ai_chat_usage" USING btree ("model","created_at");
