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
  v_workspace_id uuid;
  v_project_id uuid;
  v_channel_type text;
  v_is_private boolean;
begin
  v_channel_id := coalesce(new.channel_id, old.channel_id);

  if v_channel_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );

  select
    coalesce(c.workspace_id, p.workspace_id),
    c.project_id,
    c.type::text,
    c.is_private
  into
    v_workspace_id,
    v_project_id,
    v_channel_type,
    v_is_private
  from public.channels c
  left join public.projects p on p.id = c.project_id
  where c.id = v_channel_id;

  if v_workspace_id is null then
    return null;
  end if;

  for v_user_id in
    select distinct recipient.user_id
    from (
      select cm.user_id
      from public.channel_members cm
      inner join public.workspace_members wm
        on wm.user_id = cm.user_id
       and wm.workspace_id = v_workspace_id
       and wm.membership_status = 'active'
      where cm.channel_id = v_channel_id

      union

      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.membership_status = 'active'
        and v_is_private = false
        and v_channel_type = 'workspace'
        and wm.role <> 'guest'

      union

      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.membership_status = 'active'
        and wm.role <> 'guest'
        and v_is_private = false
        and v_channel_type = 'project'

      union

      select pm.user_id
      from public.project_members pm
      inner join public.workspace_members wm
        on wm.user_id = pm.user_id
       and wm.workspace_id = v_workspace_id
       and wm.membership_status = 'active'
      where pm.project_id = v_project_id
        and v_is_private = false
        and v_channel_type = 'project'
    ) as recipient
  loop
    perform realtime.broadcast_changes(
      'user:' || v_user_id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end loop;

  return null;
end;
$$;
