-- user topic でも messages 変更を受け取り、現在開いていないチャンネルの
-- 未読数・最終メッセージを全件購読なしで更新できるようにする。
create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  v_user_id uuid;
begin
  v_channel_id := coalesce(new.channel_id, old.channel_id);

  if v_channel_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );

  for v_user_id in
    select distinct user_id
    from public.channel_members
    where channel_id = v_channel_id
  loop
    perform realtime.broadcast_changes(
      'user:' || v_user_id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end loop;

  return null;
end;
$$;
