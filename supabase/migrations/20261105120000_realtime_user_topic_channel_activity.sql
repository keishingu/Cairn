-- Realtime の常時購読を「user:{userId} + 表示中のチャット」に絞るため（#173）、
-- 画面外のチャンネルで起きた変化を、閲覧権限のある各ユーザーの user トピックへも知らせる。
--
-- - channel:{id} トピックへの既存配信（broadcast_messages_changes / broadcast_tasks_changes。
--   移動元・移動先の両方へ送る 20261014060000 の挙動を含む）は置き換えずに残す。
--   表示中のチャットの即時反映と、全チャンネルを購読している旧クライアントはそのまま動く
-- - 送るのは table・operation・channel_ids だけ。本文・タスク名などの行データは載せず、
--   受信側は認可付きの REST API で再取得する
-- - 宛先は送信時点の権限で決める（can_access_channel と同じ判定）。退会・権限取消・
--   非公開チャンネルからの除外の直後から届かない。channel_ids も宛先ごとに見られるものだけに絞る
-- - 行ごとではなく文ごとに1回だけ配信する。スレッドへの一括移動やタスクの並べ替えで
--   「行数 × 人数」件の配信にならず、1文あたり宛先1人につき1件になる

-- ─── 宛先の判定 ───────────────────────────────────────────────
-- can_access_channel(p_channel_id) は auth.uid() 本人を判定する。こちらは同じ条件を
-- 全ユーザーについて展開したもの。どちらかを変えたら両方を揃える
-- （確かめ方: docs/notification-design.md「宛先判定の同等性の確かめ方」）。
CREATE OR REPLACE FUNCTION public.channel_realtime_recipients(p_channel_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wm.user_id
  FROM channels c
  JOIN active_workspace_members wm
    ON wm.workspace_id = coalesce(
      c.workspace_id,
      (SELECT p.workspace_id FROM projects p WHERE p.id = c.project_id)
    )
  WHERE c.id = p_channel_id
    AND (
      wm.role <> 'guest'
      OR c.type = 'dm'
      OR (c.type = 'workspace' AND EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = c.id AND cm.user_id = wm.user_id
      ))
      OR (c.type = 'project' AND EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = c.project_id AND pm.user_id = wm.user_id
      ))
    )
    AND (
      ((c.is_private = true OR c.type = 'dm') AND EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = c.id AND cm.user_id = wm.user_id
      ))
      OR (c.is_private = false AND c.type IN ('workspace', 'project'))
    );
$$;

REVOKE ALL ON FUNCTION public.channel_realtime_recipients(uuid) FROM PUBLIC;

-- ─── user トピックへの配信 ─────────────────────────────────────
-- 宛先ごとに、見られるチャンネルの ID だけを channel_ids に入れて1件送る
CREATE OR REPLACE FUNCTION public.broadcast_channel_activity_to_users(
  p_table text,
  p_operation text,
  p_channel_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient record;
BEGIN
  IF p_channel_ids IS NULL OR cardinality(p_channel_ids) = 0 THEN
    RETURN;
  END IF;

  FOR recipient IN
    SELECT r.user_id, array_agg(DISTINCT ch.id ORDER BY ch.id) AS channel_ids
    FROM (SELECT DISTINCT id FROM unnest(p_channel_ids) AS u(id) WHERE id IS NOT NULL) ch
    CROSS JOIN LATERAL public.channel_realtime_recipients(ch.id) AS r(user_id)
    GROUP BY r.user_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object(
        'table', p_table,
        'operation', p_operation,
        'channel_ids', to_jsonb(recipient.channel_ids)
      ),
      p_operation,
      'user:' || recipient.user_id::text,
      true
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_channel_activity_to_users(text, text, uuid[]) FROM PUBLIC;

-- ─── messages ─────────────────────────────────────────────────
-- 一覧（未読数・並び）が変わる新着・削除・チャンネル移動だけを送る。編集・リアクションなど
-- 表示中のチャットにしか影響しない変化は channel トピックだけで足りる
-- （購読をやめたチャンネルのキャッシュは、クライアントが購読解除時に古い扱いにする）。
CREATE OR REPLACE FUNCTION public.broadcast_messages_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.channel_id) INTO v_channel_ids FROM new_rows n;
  ELSE
    SELECT array_agg(DISTINCT x.channel_id) INTO v_channel_ids
    FROM (
      SELECT n.channel_id, o.channel_id AS old_channel_id
      FROM new_rows n
      JOIN old_rows o ON o.id = n.id
      WHERE n.channel_id IS DISTINCT FROM o.channel_id
         OR n.deleted_at IS DISTINCT FROM o.deleted_at
    ) changed
    CROSS JOIN LATERAL (VALUES (changed.channel_id), (changed.old_channel_id)) AS x(channel_id);
  END IF;

  PERFORM public.broadcast_channel_activity_to_users(TG_TABLE_NAME, TG_OP, v_channel_ids);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_messages_activity_to_users() FROM PUBLIC;

-- 遷移テーブルは1つのトリガーに1イベントしか付けられないため、INSERT と UPDATE で分ける
DROP TRIGGER IF EXISTS broadcast_messages_insert_activity_to_users ON public.messages;
CREATE TRIGGER broadcast_messages_insert_activity_to_users
AFTER INSERT ON public.messages
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_messages_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_messages_update_activity_to_users ON public.messages;
CREATE TRIGGER broadcast_messages_update_activity_to_users
AFTER UPDATE ON public.messages
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_messages_activity_to_users();

-- ─── tasks ────────────────────────────────────────────────────
-- マイタスク・カンバン・チャット情報のタスク一覧は、表示中のチャットと無関係に更新が要る。
-- チャンネルに紐づくタスクは移動元・移動先の両方の閲覧者へ送る。チャンネルのないタスクは
-- これまでどおり配信しない（既存の broadcast_tasks_changes と同じ範囲）。
CREATE OR REPLACE FUNCTION public.broadcast_tasks_activity_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.channel_id) INTO v_channel_ids FROM new_rows n;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.channel_id) INTO v_channel_ids FROM old_rows o;
  ELSE
    SELECT array_agg(DISTINCT x.channel_id) INTO v_channel_ids
    FROM (
      SELECT n.channel_id FROM new_rows n
      UNION
      SELECT o.channel_id FROM old_rows o
    ) x;
  END IF;

  PERFORM public.broadcast_channel_activity_to_users(TG_TABLE_NAME, TG_OP, v_channel_ids);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_tasks_activity_to_users() FROM PUBLIC;

DROP TRIGGER IF EXISTS broadcast_tasks_insert_activity_to_users ON public.tasks;
CREATE TRIGGER broadcast_tasks_insert_activity_to_users
AFTER INSERT ON public.tasks
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_tasks_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_tasks_update_activity_to_users ON public.tasks;
CREATE TRIGGER broadcast_tasks_update_activity_to_users
AFTER UPDATE ON public.tasks
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_tasks_activity_to_users();

DROP TRIGGER IF EXISTS broadcast_tasks_delete_activity_to_users ON public.tasks;
CREATE TRIGGER broadcast_tasks_delete_activity_to_users
AFTER DELETE ON public.tasks
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_tasks_activity_to_users();
