-- 非活性メンバーは Realtime の channel topic を購読できないようにする。
-- 既存 0033 を書き換えると適用済み DB に反映されないため、現行関数をここで差し替える。
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from channels c
    where c.id = p_channel_id
      and exists (
        select 1
        from workspace_members wm
        where wm.user_id = auth.uid()
          and wm.workspace_id = coalesce(
            c.workspace_id,
            (select p.workspace_id from projects p where p.id = c.project_id)
          )
          and wm.membership_status = 'active'
      )
      and (
        (
          (c.is_private = true or c.type = 'dm')
          and exists (
            select 1 from channel_members cm
            where cm.channel_id = c.id and cm.user_id = auth.uid()
          )
        )
        or
        (
          c.is_private = false
          and (
            c.type = 'workspace'
            or (
              c.type = 'project'
              and (
                wm.role <> 'guest'
                or exists (
                  select 1 from project_members pm
                  where pm.project_id = c.project_id
                    and pm.user_id = auth.uid()
                )
              )
            )
          )
        )
      )
  );
$$;
