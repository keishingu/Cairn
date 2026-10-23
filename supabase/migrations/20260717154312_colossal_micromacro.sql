CREATE TABLE "ai_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid,
	"project_id" uuid,
	"task_id" uuid,
	"message_id" uuid,
	"detector" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"reason" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"feedback" text,
	"remind_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "ai_nudges_user_dedupe_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "ai_nudges_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_nudges_user_status_created" ON "ai_nudges" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_nudges_channel_user" ON "ai_nudges" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_nudges_cooldown" ON "ai_nudges" USING btree ("user_id","detector","task_id","status","remind_after");--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_detector_check" CHECK ("detector" IN ('task_due_soon', 'task_overdue', 'task_stalled', 'unanswered_ask', 'llm_risk'));--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_status_check" CHECK ("status" IN ('active', 'dismissed', 'resolved', 'suppressed'));--> statement-breakpoint
ALTER TABLE "ai_nudges" ADD CONSTRAINT "ai_nudges_feedback_check" CHECK ("feedback" IS NULL OR "feedback" IN ('later', 'not_helpful'));--> statement-breakpoint

-- ai_nudges は Data API に露出し得る public schema のテーブルなので RLS を必須にする。
-- 本人確認だけでなく、現在の active membership と channel/project アクセスも毎回再評価する。
CREATE OR REPLACE FUNCTION public.can_access_ai_nudge(
  p_workspace_id uuid,
  p_channel_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM active_workspace_members awm
    WHERE awm.workspace_id = p_workspace_id
      AND awm.user_id = auth.uid()
      AND (
        (p_channel_id IS NOT NULL AND public.can_access_channel(p_channel_id))
        OR
        (p_channel_id IS NULL AND (
          p_project_id IS NULL
          OR awm.role <> 'guest'
          OR EXISTS (
            SELECT 1
            FROM project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id = auth.uid()
          )
        ))
      )
  );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.can_access_ai_nudge(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.can_access_ai_nudge(uuid, uuid, uuid) TO authenticated;--> statement-breakpoint
ALTER TABLE public.ai_nudges ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_nudges_select_own_accessible"
ON public.ai_nudges FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.can_access_ai_nudge(workspace_id, channel_id, project_id)
);--> statement-breakpoint

-- INSERT / UPDATE のどちらも本人の private user topic へ配信する。
CREATE OR REPLACE FUNCTION public.broadcast_ai_nudges_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || NEW.user_id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_ai_nudges_changes() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER broadcast_ai_nudges_changes
AFTER INSERT OR UPDATE ON public.ai_nudges
FOR EACH ROW EXECUTE FUNCTION public.broadcast_ai_nudges_changes();--> statement-breakpoint

-- suppressed 遷移は理由を問わず、ベルに複製した通知も同じ経路で消す。
CREATE OR REPLACE FUNCTION public.delete_suppressed_ai_nudge_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'suppressed' AND OLD.status IS DISTINCT FROM 'suppressed' THEN
    DELETE FROM public.notifications
    WHERE type = 'ai'
      AND data ->> 'nudgeId' = NEW.id::text;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_suppressed_ai_nudge_notification() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER delete_suppressed_ai_nudge_notification
AFTER UPDATE OF status ON public.ai_nudges
FOR EACH ROW EXECUTE FUNCTION public.delete_suppressed_ai_nudge_notification();--> statement-breakpoint

-- 既存 notifications trigger を DELETE にも対応させ、ベルのキャッシュを即時 invalidate する。
CREATE OR REPLACE FUNCTION public.broadcast_notifications_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || COALESCE(NEW.user_id, OLD.user_id)::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS broadcast_notifications_changes ON public.notifications;--> statement-breakpoint
CREATE TRIGGER broadcast_notifications_changes
AFTER INSERT OR UPDATE OR DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.broadcast_notifications_changes();
