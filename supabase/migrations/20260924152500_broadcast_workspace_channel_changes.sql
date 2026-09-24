-- ワークスペースチャンネルの名称変更・削除は、開いている本人以外の一覧へ届ける。
-- channel トピックは can_access_channel が行の存在を見るため、削除後の配信が届かない。
-- ユーザートピックはチャンネル行が消えた後も届く。本文は載せず、受信側は一覧を再取得する。
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

  IF channel_row.type IS DISTINCT FROM 'workspace' OR channel_row.workspace_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NULL;
  END IF;

  FOR recipient IN
    SELECT awm.user_id
    FROM public.active_workspace_members awm
    WHERE awm.workspace_id = channel_row.workspace_id
  LOOP
    PERFORM realtime.broadcast_changes(
      'user:' || recipient::text,
      TG_OP,
      TG_OP,
      TG_TABLE_NAME,
      TG_TABLE_SCHEMA,
      NULL::public.channels,
      NULL::public.channels
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_workspace_channel_changes() FROM PUBLIC;

CREATE TRIGGER broadcast_workspace_channel_changes
AFTER UPDATE OR DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.broadcast_workspace_channel_changes();
