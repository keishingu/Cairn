-- プロジェクト一覧の人数・参加・主催は project_members だけが変わる。
-- チャンネル削除は AFTER だと行が消えた後に宛先を引いて、公開チャンネルの閲覧者へ届かない。

-- ─── project_members → プロジェクト一覧 ───────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_project_members_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR ws IN
      SELECT DISTINCT p.workspace_id
      FROM old_rows o
      JOIN public.projects p ON p.id = o.project_id
      WHERE p.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR ws IN
      SELECT DISTINCT p.workspace_id
      FROM (
        SELECT n.project_id FROM new_rows n
        UNION ALL
        SELECT o.project_id FROM old_rows o
      ) s
      JOIN public.projects p ON p.id = s.project_id
      WHERE p.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  ELSE
    FOR ws IN
      SELECT DISTINCT p.workspace_id
      FROM new_rows n
      JOIN public.projects p ON p.id = n.project_id
      WHERE p.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_project_members_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_project_members_insert_activity_to_users ON public.project_members;
CREATE TRIGGER broadcast_project_members_insert_activity_to_users
AFTER INSERT ON public.project_members
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_project_members_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_project_members_update_activity_to_users ON public.project_members;
CREATE TRIGGER broadcast_project_members_update_activity_to_users
AFTER UPDATE ON public.project_members
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_project_members_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_project_members_delete_activity_to_users ON public.project_members;
CREATE TRIGGER broadcast_project_members_delete_activity_to_users
AFTER DELETE ON public.project_members
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_project_members_activity_to_users();

-- ─── channels DELETE は行が残っているうちに宛先を決める ────────
-- channel_realtime_recipients は channels を引く。AFTER DELETE では公開チャンネルの
-- 未参加メンバーがゼロになり、メンバーのいない公開チャンネルは誰にも届かない。
DROP TRIGGER IF EXISTS broadcast_workspace_channel_changes ON public.channels;
CREATE TRIGGER broadcast_workspace_channel_changes
AFTER INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();

DROP TRIGGER IF EXISTS broadcast_workspace_channel_changes_before_delete ON public.channels;
CREATE TRIGGER broadcast_workspace_channel_changes_before_delete
BEFORE DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();
