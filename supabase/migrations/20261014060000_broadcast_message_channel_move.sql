-- メッセージをスレッドへ切り出すと messages.channel_id が変わる。
-- 移動先だけに配信すると元のチャンネルを開いている人の画面にメッセージが残り続けるため、
-- channel_id が変わった UPDATE は移動元のトピックにも配信する。それ以外の挙動は 0034 のまま。
create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'channel:' || coalesce(new.channel_id, old.channel_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );

  if tg_op = 'UPDATE' and old.channel_id is distinct from new.channel_id then
    perform realtime.broadcast_changes(
      'channel:' || old.channel_id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end if;

  return null;
end;
$$;

-- チェックボックス由来のタスクもメッセージと一緒にスレッドへ移る。
-- 移動先だけに配信すると、元のチャンネルのタスク一覧に移動済みのタスクが残り続けるため、
-- channel_id が変わった UPDATE は移動元のトピックにも配信する。それ以外の挙動は 20260824015656 のまま。
CREATE OR REPLACE FUNCTION public.broadcast_tasks_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid := coalesce(NEW.channel_id, OLD.channel_id);
BEGIN
  IF v_channel_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );

  IF TG_OP = 'UPDATE' AND OLD.channel_id IS NOT NULL AND OLD.channel_id IS DISTINCT FROM NEW.channel_id THEN
    PERFORM realtime.broadcast_changes(
      'channel:' || OLD.channel_id::text,
      TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
    );
  END IF;

  RETURN NULL;
END;
$$;
