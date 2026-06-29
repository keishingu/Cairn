-- workspace_members の変更を同一ワークスペース参加者へ配信する。
-- DM 一覧やメンバー一覧は participant status / avatar をこのテーブルから描画しているため、
-- statusMessage などの更新を open 中の画面へ即時反映する。

create or replace function public.broadcast_workspace_members_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_member record;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return null;
  end if;

  for v_member in
    select user_id
    from workspace_members
    where workspace_id = v_workspace_id
  loop
    perform realtime.broadcast_changes(
      'user:' || v_member.user_id::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end loop;

  return null;
end;
$$;

create trigger broadcast_workspace_members_changes
after update on public.workspace_members
for each row execute function public.broadcast_workspace_members_changes();
