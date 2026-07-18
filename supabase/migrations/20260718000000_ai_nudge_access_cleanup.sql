-- auth.uid() に依存しない共通アクセス判定。ハートビートと権限失効 trigger からも利用する。
CREATE OR REPLACE FUNCTION public.user_can_access_ai_nudge(
  p_user_id uuid,
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
      AND awm.user_id = p_user_id
      AND (
        (
          p_channel_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM channels c
            LEFT JOIN projects cp ON cp.id = c.project_id
            WHERE c.id = p_channel_id
              AND coalesce(c.workspace_id, cp.workspace_id) = p_workspace_id
              AND (
                (NOT c.is_private AND c.type <> 'dm')
                OR EXISTS (
                  SELECT 1
                  FROM channel_members cm
                  WHERE cm.channel_id = c.id
                    AND cm.user_id = p_user_id
                )
              )
              AND (
                c.type <> 'project'
                OR c.project_id IS NULL
                OR awm.role <> 'guest'
                OR EXISTS (
                  SELECT 1
                  FROM project_members pm
                  WHERE pm.project_id = c.project_id
                    AND pm.user_id = p_user_id
                )
              )
          )
        )
        OR (
          p_channel_id IS NULL
          AND (
            p_project_id IS NULL
            OR awm.role <> 'guest'
            OR EXISTS (
              SELECT 1
              FROM project_members pm
              WHERE pm.project_id = p_project_id
                AND pm.user_id = p_user_id
            )
          )
        )
      )
  );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.user_can_access_ai_nudge(uuid, uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint

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
  SELECT public.user_can_access_ai_nudge(
    (SELECT auth.uid()),
    p_workspace_id,
    p_channel_id,
    p_project_id
  );
$$;--> statement-breakpoint

-- 権限失効時は、ベル通知を直接消さず nudge の suppressed 遷移へ集約する。
-- 既存の delete_suppressed_ai_nudge_notification trigger が通知削除を担当する。
CREATE OR REPLACE FUNCTION public.suppress_inaccessible_ai_nudges(
  p_user_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_channel_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ai_nudges n
  SET status = 'suppressed', remind_after = NULL
  WHERE n.user_id = p_user_id
    AND n.status IN ('active', 'dismissed')
    AND (p_workspace_id IS NULL OR n.workspace_id = p_workspace_id)
    AND (p_project_id IS NULL OR n.project_id = p_project_id)
    AND (p_channel_id IS NULL OR n.channel_id = p_channel_id)
    AND NOT public.user_can_access_ai_nudge(
      n.user_id,
      n.workspace_id,
      n.channel_id,
      n.project_id
    );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.suppress_inaccessible_ai_nudges(uuid, uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.suppress_ai_nudges_after_workspace_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.suppress_inaccessible_ai_nudges(NEW.user_id, NEW.workspace_id);
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.suppress_ai_nudges_after_workspace_access_change() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER suppress_ai_nudges_after_workspace_access_change
AFTER UPDATE OF membership_status, role ON public.workspace_members
FOR EACH ROW
WHEN (
  OLD.membership_status IS DISTINCT FROM NEW.membership_status
  OR OLD.role IS DISTINCT FROM NEW.role
)
EXECUTE FUNCTION public.suppress_ai_nudges_after_workspace_access_change();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.suppress_ai_nudges_after_project_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.suppress_inaccessible_ai_nudges(OLD.user_id, NULL, OLD.project_id, NULL);
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.suppress_ai_nudges_after_project_member_delete() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER suppress_ai_nudges_after_project_member_delete
AFTER DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.suppress_ai_nudges_after_project_member_delete();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.suppress_ai_nudges_after_channel_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.suppress_inaccessible_ai_nudges(OLD.user_id, NULL, NULL, OLD.channel_id);
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.suppress_ai_nudges_after_channel_member_delete() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER suppress_ai_nudges_after_channel_member_delete
AFTER DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.suppress_ai_nudges_after_channel_member_delete();
