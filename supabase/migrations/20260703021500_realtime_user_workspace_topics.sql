-- 通知 / 既読の Realtime を user x workspace topic に分離し、
-- active な workspace membership があるときだけ join / Data API 読み取りを許可する。
create or replace function public.can_access_user_workspace_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  if p_topic !~ '^user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:workspace:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;

  v_user_id := split_part(p_topic, ':', 2)::uuid;
  v_workspace_id := split_part(p_topic, ':', 4)::uuid;

  if v_user_id <> auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id = v_workspace_id
      and wm.membership_status = 'active'
  );
exception when others then
  return false;
end;
$$;

grant execute on function public.can_access_user_workspace_topic(text) to authenticated;

drop policy if exists "users_can_receive_their_topics" on realtime.messages;
create policy "users_can_receive_their_topics"
on realtime.messages for select
to authenticated
using (
  public.can_access_user_workspace_topic(realtime.topic())
  or public.can_access_channel_topic(realtime.topic())
);

create or replace function public.broadcast_notifications_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || new.user_id::text || ':workspace:' || new.workspace_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create or replace function public.broadcast_channel_read_states_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select coalesce(c.workspace_id, p.workspace_id) into v_workspace_id
  from channels c
  left join projects p on p.id = c.project_id
  where c.id = new.channel_id;

  if v_workspace_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'user:' || new.user_id::text || ':workspace:' || v_workspace_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;
