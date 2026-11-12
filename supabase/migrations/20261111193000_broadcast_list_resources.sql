-- ファイル・タスク・プロジェクト・チャンネル一覧を、接続中のフォーカス再取得なしで更新する。
-- 送るのは table と operation だけ。受信側は REST で取り直す。
-- 宛先はワークスペースの active 所属者、またはチャンネルを見られる人（channel_realtime_recipients）。

CREATE OR REPLACE FUNCTION public.broadcast_workspace_resource_to_members(
  p_workspace_id uuid,
  p_table text,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF p_workspace_id IS NULL THEN
    RETURN;
  END IF;

  FOR recipient IN
    SELECT awm.user_id
    FROM public.active_workspace_members awm
    WHERE awm.workspace_id = p_workspace_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('table', p_table, 'operation', p_operation),
      p_operation,
      'user:' || recipient::text,
      true
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_workspace_resource_to_members(uuid, text, text) FROM PUBLIC;

-- ─── files ────────────────────────────────────────────────────
-- アップロード・削除・索引状態（metadata）・派生ファイル。文ごとにワークスペース単位で1回。
CREATE OR REPLACE FUNCTION public.broadcast_files_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR ws IN SELECT DISTINCT o.workspace_id FROM old_rows o WHERE o.workspace_id IS NOT NULL LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    FOR ws IN SELECT DISTINCT n.workspace_id FROM new_rows n WHERE n.workspace_id IS NOT NULL LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  ELSE
    FOR ws IN
      SELECT DISTINCT s.workspace_id FROM (
        SELECT n.workspace_id FROM new_rows n
        UNION ALL
        SELECT o.workspace_id FROM old_rows o
      ) s
      WHERE s.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_files_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_files_insert_activity_to_users ON public.files;
CREATE TRIGGER broadcast_files_insert_activity_to_users
AFTER INSERT ON public.files
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_files_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_files_update_activity_to_users ON public.files;
CREATE TRIGGER broadcast_files_update_activity_to_users
AFTER UPDATE ON public.files
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_files_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_files_delete_activity_to_users ON public.files;
CREATE TRIGGER broadcast_files_delete_activity_to_users
AFTER DELETE ON public.files
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_files_activity_to_users();

-- 添付の付け外しは files 行を変えないことがある。チャンネルのファイル一覧はこれで取り直す。
CREATE OR REPLACE FUNCTION public.broadcast_message_attachments_activity_to_users()
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
      SELECT DISTINCT f.workspace_id
      FROM old_rows o
      JOIN public.files f ON f.id = o.file_id
      WHERE f.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR ws IN
      SELECT DISTINCT f.workspace_id
      FROM (
        SELECT n.file_id FROM new_rows n
        UNION ALL
        SELECT o.file_id FROM old_rows o
      ) s
      JOIN public.files f ON f.id = s.file_id
      WHERE f.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  ELSE
    FOR ws IN
      SELECT DISTINCT f.workspace_id
      FROM new_rows n
      JOIN public.files f ON f.id = n.file_id
      WHERE f.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'files', TG_OP);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_message_attachments_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_message_attachments_insert_activity_to_users ON public.message_attachments;
CREATE TRIGGER broadcast_message_attachments_insert_activity_to_users
AFTER INSERT ON public.message_attachments
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_message_attachments_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_message_attachments_update_activity_to_users ON public.message_attachments;
CREATE TRIGGER broadcast_message_attachments_update_activity_to_users
AFTER UPDATE ON public.message_attachments
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_message_attachments_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_message_attachments_delete_activity_to_users ON public.message_attachments;
CREATE TRIGGER broadcast_message_attachments_delete_activity_to_users
AFTER DELETE ON public.message_attachments
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_message_attachments_activity_to_users();

-- ─── projects / milestones ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_projects_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR ws IN SELECT DISTINCT o.workspace_id FROM old_rows o WHERE o.workspace_id IS NOT NULL LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    FOR ws IN SELECT DISTINCT n.workspace_id FROM new_rows n WHERE n.workspace_id IS NOT NULL LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  ELSE
    FOR ws IN
      SELECT DISTINCT s.workspace_id FROM (
        SELECT n.workspace_id FROM new_rows n
        UNION ALL
        SELECT o.workspace_id FROM old_rows o
      ) s
      WHERE s.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'projects', TG_OP);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_projects_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_projects_insert_activity_to_users ON public.projects;
CREATE TRIGGER broadcast_projects_insert_activity_to_users
AFTER INSERT ON public.projects
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_projects_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_projects_update_activity_to_users ON public.projects;
CREATE TRIGGER broadcast_projects_update_activity_to_users
AFTER UPDATE ON public.projects
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_projects_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_projects_delete_activity_to_users ON public.projects;
CREATE TRIGGER broadcast_projects_delete_activity_to_users
AFTER DELETE ON public.projects
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_projects_activity_to_users();

-- プロジェクトチャンネル一覧はマイルストーンの題名・期間・完了も表示する。
CREATE OR REPLACE FUNCTION public.broadcast_milestones_activity_to_users()
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
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'milestones', TG_OP);
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
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'milestones', TG_OP);
    END LOOP;
  ELSE
    FOR ws IN
      SELECT DISTINCT p.workspace_id
      FROM new_rows n
      JOIN public.projects p ON p.id = n.project_id
      WHERE p.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'milestones', TG_OP);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_milestones_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_milestones_insert_activity_to_users ON public.milestones;
CREATE TRIGGER broadcast_milestones_insert_activity_to_users
AFTER INSERT ON public.milestones
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_milestones_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_milestones_update_activity_to_users ON public.milestones;
CREATE TRIGGER broadcast_milestones_update_activity_to_users
AFTER UPDATE ON public.milestones
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_milestones_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_milestones_delete_activity_to_users ON public.milestones;
CREATE TRIGGER broadcast_milestones_delete_activity_to_users
AFTER DELETE ON public.milestones
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_milestones_activity_to_users();

-- ─── tasks: チャンネルのない行もワークスペースへ ──────────────
CREATE OR REPLACE FUNCTION public.broadcast_tasks_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_ids uuid[];
  ws uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.channel_id) INTO v_channel_ids FROM new_rows n;
    FOR ws IN
      SELECT DISTINCT n.workspace_id FROM new_rows n
      WHERE n.channel_id IS NULL AND n.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'tasks', TG_OP);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.channel_id) INTO v_channel_ids FROM old_rows o;
    FOR ws IN
      SELECT DISTINCT o.workspace_id FROM old_rows o
      WHERE o.channel_id IS NULL AND o.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'tasks', TG_OP);
    END LOOP;
  ELSE
    SELECT array_agg(DISTINCT x.channel_id) INTO v_channel_ids
    FROM (
      SELECT n.channel_id FROM new_rows n
      UNION
      SELECT o.channel_id FROM old_rows o
    ) x;
    FOR ws IN
      SELECT DISTINCT s.workspace_id FROM (
        SELECT n.workspace_id, n.channel_id FROM new_rows n
        UNION ALL
        SELECT o.workspace_id, o.channel_id FROM old_rows o
      ) s
      WHERE s.channel_id IS NULL AND s.workspace_id IS NOT NULL
    LOOP
      PERFORM public.broadcast_workspace_resource_to_members(ws, 'tasks', TG_OP);
    END LOOP;
  END IF;

  PERFORM public.broadcast_channel_activity_to_users(TG_TABLE_NAME, TG_OP, v_channel_ids);
  RETURN NULL;
END;
$$;

-- ─── channels: 作成・アーカイブ・プロジェクト／DM も配る ──────
CREATE OR REPLACE FUNCTION public.broadcast_workspace_channel_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_row public.channels%ROWTYPE;
  recipient uuid;
BEGIN
  channel_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF channel_row.type NOT IN ('workspace', 'project', 'dm') THEN
    RETURN NULL;
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
    RETURN NULL;
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

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_workspace_channel_changes ON public.channels;
CREATE TRIGGER broadcast_workspace_channel_changes
AFTER INSERT OR UPDATE OR DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();

-- 参加の追加・削除は、本人だけでなくチャンネルを見ている人の人数表示も変える。
-- 外された本人はもう宛先に入らないので、別に送る。
CREATE OR REPLACE FUNCTION public.broadcast_channel_members_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid := COALESCE(NEW.channel_id, OLD.channel_id);
  v_user_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  recipient uuid;
BEGIN
  FOR recipient IN
    SELECT DISTINCT user_id FROM (
      SELECT r AS user_id FROM public.channel_realtime_recipients(v_channel_id) r
      UNION
      SELECT v_user_id
    ) s
    WHERE user_id IS NOT NULL
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('table', 'channel_members', 'operation', TG_OP),
      TG_OP,
      'user:' || recipient::text,
      true
    );
  END LOOP;
  RETURN NULL;
END;
$$;

-- ─── 表示名: チャンネル一覧と DM の名前 ───────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_profile_name_to_workspaces()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  IF NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN
    RETURN NULL;
  END IF;

  FOR ws IN
    SELECT awm.workspace_id
    FROM public.active_workspace_members awm
    WHERE awm.user_id = NEW.id
  LOOP
    PERFORM public.broadcast_workspace_resource_to_members(ws, 'channels', 'UPDATE');
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_profile_name_to_workspaces() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_profile_name_to_workspaces ON public.profiles;
CREATE TRIGGER broadcast_profile_name_to_workspaces
AFTER UPDATE OF display_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.broadcast_profile_name_to_workspaces();

CREATE OR REPLACE FUNCTION public.broadcast_member_name_to_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NOT DISTINCT FROM OLD.display_name
     AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url
  THEN
    RETURN NULL;
  END IF;

  PERFORM public.broadcast_workspace_resource_to_members(NEW.workspace_id, 'channels', 'UPDATE');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_member_name_to_workspace() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_member_name_to_workspace ON public.workspace_members;
CREATE TRIGGER broadcast_member_name_to_workspace
AFTER UPDATE OF display_name, avatar_url ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.broadcast_member_name_to_workspace();
