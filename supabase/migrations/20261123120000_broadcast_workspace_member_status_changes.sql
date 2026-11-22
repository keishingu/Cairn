-- 本人が設定したステータス（オンライン・離席中など）の変更を、同じワークスペースの全メンバーへ届ける。
-- チャット詳細のメンバー欄はメンバー一覧 API のステータスを出すため、受信側は一覧を再取得する。
-- ワークスペース単位のトピックは無いので、既存の通知と同じくユーザートピックへ配る。本文は載せない。
CREATE OR REPLACE FUNCTION public.broadcast_workspace_member_status_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  FOR recipient IN
    SELECT awm.user_id
    FROM public.active_workspace_members awm
    WHERE awm.workspace_id = NEW.workspace_id
  LOOP
    PERFORM realtime.broadcast_changes(
      'user:' || recipient::text,
      TG_OP,
      TG_OP,
      TG_TABLE_NAME,
      TG_TABLE_SCHEMA,
      NULL::public.workspace_members,
      NULL::public.workspace_members
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_workspace_member_status_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER broadcast_workspace_member_status_changes
AFTER UPDATE OF status ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_member_status_changes();
