-- Realtime の常時購読を全チャンネルではなく user topic + アクティブチャンネルへ寄せるため、
-- messages の変更も受信者ごとの user topic へ配信する。
create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid := coalesce(new.channel_id, old.channel_id);
  v_workspace_id uuid;
  v_project_id uuid;
  v_channel_type text;
  v_is_private boolean;
  v_user_id uuid;
begin
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
  from channels c
  left join projects p on p.id = c.project_id
  where c.id = v_channel_id;

  if v_workspace_id is null then
    return null;
  end if;

  for v_user_id in
    select distinct wm.user_id
    from workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.membership_status = 'active'
      and (
        case
          when v_channel_type = 'dm' or coalesce(v_is_private, false) = true then exists (
            select 1
            from channel_members cm
            where cm.channel_id = v_channel_id
              and cm.user_id = wm.user_id
          )
          when v_channel_type = 'project' then (
            wm.role <> 'guest'
            or exists (
              select 1
              from project_members pm
              where pm.project_id = v_project_id
                and pm.user_id = wm.user_id
            )
          )
          when v_channel_type = 'workspace' then (
            wm.role <> 'guest'
            or exists (
              select 1
              from channel_members cm
              where cm.channel_id = v_channel_id
                and cm.user_id = wm.user_id
            )
          )
          else false
        end
      )
  loop
    perform realtime.broadcast_changes(
      'user:' || v_user_id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end loop;

  return null;
end;
$$;
