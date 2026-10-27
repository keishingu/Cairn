-- AI オートメーションの定義と実行記録。設計は docs/ai-automation-design.md §6。
-- サーバー（直接接続）からのみ読み書きする。表を作ってから RLS・REVOKE までの間に authenticated から書き込まれないよう、
-- 1つの DO ブロックで同時に作る（Supabase CLI は文ごとにトランザクションなしで流す。新しい表は既定で anon・authenticated に権限が付く）
DO $$
BEGIN
  CREATE TABLE "ai_automations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"workspace_id" uuid NOT NULL,
  	"kind" text NOT NULL,
  	"builtin" text,
  	"name" text NOT NULL,
  	"raw_instruction" text,
  	"compiled" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"scope_project_id" uuid,
  	"approver_id" uuid,
  	"created_by" uuid,
  	"enabled" boolean DEFAULT true NOT NULL,
  	"paused_reason" text,
  	"next_run_at" timestamp with time zone,
  	"last_run_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "ai_automations_kind_known" CHECK ("ai_automations"."kind" in ('skill', 'cron', 'heartbeat')),
  	CONSTRAINT "ai_automations_builtin_known" CHECK ("ai_automations"."builtin" is null or "ai_automations"."builtin" in ('pmo_tasks', 'pmo_messages')),
  	CONSTRAINT "ai_automations_name_format" CHECK ("ai_automations"."name" ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  	CONSTRAINT "ai_automations_instruction_required" CHECK ("ai_automations"."builtin" is not null or length(trim(coalesce("ai_automations"."raw_instruction", ''))) > 0),
  	CONSTRAINT "ai_automations_instruction_length" CHECK (char_length("ai_automations"."raw_instruction") <= 10000),
  	CONSTRAINT "ai_automations_compiled_object" CHECK (jsonb_typeof("ai_automations"."compiled") = 'object')
  );

  CREATE TABLE "ai_automation_runs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"workspace_id" uuid NOT NULL,
  	"automation_id" uuid,
  	"trigger_key" text NOT NULL,
  	"triggered_by" uuid,
  	"dry_run" boolean DEFAULT false NOT NULL,
  	"status" text DEFAULT 'running' NOT NULL,
  	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"output" jsonb,
  	"credits_used" integer,
  	"error" text,
  	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"finished_at" timestamp with time zone,
  	CONSTRAINT "ai_automation_runs_trigger_unique" UNIQUE("automation_id","trigger_key"),
  	CONSTRAINT "ai_automation_runs_status_known" CHECK ("ai_automation_runs"."status" in ('running', 'success', 'silent', 'failed', 'skipped'))
  );

  ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_scope_project_id_projects_id_fk" FOREIGN KEY ("scope_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  -- 定義を削除しても実行記録は残す（監査と、1日の実行回数の上限を削除・作り直しで戻させないため）
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_automation_id_ai_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."ai_automations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_triggered_by_profiles_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "ai_automations_workspace_name_idx" ON "ai_automations" USING btree ("workspace_id","name");
  CREATE INDEX "idx_ai_automations_next_run" ON "ai_automations" USING btree ("next_run_at") WHERE "ai_automations"."enabled" and "ai_automations"."next_run_at" is not null;
  CREATE INDEX "idx_ai_automation_runs_automation_started" ON "ai_automation_runs" USING btree ("automation_id","started_at");
  CREATE INDEX "idx_ai_automation_runs_workspace_started" ON "ai_automation_runs" USING btree ("workspace_id","started_at");
  ALTER TABLE "ai_automations" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_automation_runs" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE "ai_automations", "ai_automation_runs" FROM anon, authenticated;
END
$$;
