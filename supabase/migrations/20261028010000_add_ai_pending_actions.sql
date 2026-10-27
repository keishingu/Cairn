-- AI が作った書き込みの実行案（承認カード）。設計は docs/ai-automation-design.md §2.4。
-- サーバー（直接接続）からのみ読み書きする。表を作ってから RLS・REVOKE までの間に authenticated から書き込まれないよう、
-- 1つの DO ブロックで同時に作る（Supabase CLI は文ごとにトランザクションなしで流す。新しい表は既定で anon・authenticated に権限が付く）
DO $$
BEGIN
  CREATE TABLE "ai_pending_actions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"workspace_id" uuid NOT NULL,
  	"conversation_id" uuid,
  	"approver_id" uuid NOT NULL,
  	"action_type" text NOT NULL,
  	"payload" jsonb NOT NULL,
  	"reason" text,
  	"status" text DEFAULT 'pending' NOT NULL,
  	"result" jsonb,
  	"error" text,
  	"decided_at" timestamp with time zone,
  	"executed_at" timestamp with time zone,
  	"expires_at" timestamp with time zone NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "ai_pending_actions_type_known" CHECK ("ai_pending_actions"."action_type" in ('post_message', 'invite_project_member', 'set_project_member_role', 'create_task')),
  	CONSTRAINT "ai_pending_actions_status_known" CHECK ("ai_pending_actions"."status" in ('pending', 'executing', 'executed', 'failed', 'rejected', 'expired'))
  );
  ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "idx_ai_pending_actions_approver_status" ON "ai_pending_actions" USING btree ("approver_id","status","created_at");
  CREATE INDEX "idx_ai_pending_actions_conversation" ON "ai_pending_actions" USING btree ("conversation_id");
  ALTER TABLE "ai_pending_actions" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE "ai_pending_actions" FROM anon, authenticated;
END
$$;
