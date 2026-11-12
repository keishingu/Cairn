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
-- BEFORE トリガーで NULL を返すと DELETE 自体が取り消されるため、BEFORE では OLD を返す。
CREATE OR REPLACE FUNCTION public.broadcast_workspace_channel_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_row public.channels%ROWTYPE;
  recipient uuid;
  result_row public.channels%ROWTYPE;
BEGIN
  channel_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  result_row := CASE WHEN TG_WHEN = 'BEFORE' THEN channel_row ELSE NULL END;

  IF channel_row.type NOT IN ('workspace', 'project', 'dm') THEN
    RETURN result_row;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.is_private IS NOT DISTINCT FROM OLD.is_private
     AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.parent_channel_id IS NOT DISTINCT FROM OLD.parent_channel_id
     AND NEW.type IS NOT DISTINCT FROM OLD.type
     AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id
  THEN
    RETURN result_row;
  END IF;

  -- 非公開と DM は作成直後にメンバーがまだ無い。その人には channel_members の INSERT が届く。
  FOR recipient IN
    SELECT DISTINCT user_id FROM (
      SELECT r AS user_id FROM public.channel_realtime_recipients(channel_row.id) r
      UNION
      SELECT cm.user_id FROM public.channel_members cm WHERE cm.channel_id = channel_row.id
    ) s
    WHERE user_id IS NOT NULL
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('table', 'channels', 'operation', TG_OP),
      TG_OP,
      'user:' || recipient::text,
      true
    );
  END LOOP;

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_workspace_channel_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_workspace_channel_changes ON public.channels;
CREATE TRIGGER broadcast_workspace_channel_changes
AFTER INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();

DROP TRIGGER IF EXISTS broadcast_workspace_channel_changes_before_delete ON public.channels;
CREATE TRIGGER broadcast_workspace_channel_changes_before_delete
BEFORE DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();
