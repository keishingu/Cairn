-- Realtime の can_access_channel が、公開プロジェクトチャンネルについて
-- REST 側（apps/web/src/lib/permissions.ts の requireChannelAccess）と異なり
-- guest のプロジェクト所属（project_members）を検証していなかった。
-- そのため参加していないプロジェクトのチャンネル ID さえ分かれば、guest が
-- Realtime 経由でメッセージ・リアクション等を直接購読できてしまっていた。
-- REST と同じスコープ感（guest は参加プロジェクトのみ）に揃える。
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
      -- 全チャンネル共通: 当該ワークスペースの active メンバーであること
      and exists (
        select 1 from active_workspace_members wm
        where wm.user_id = auth.uid()
          and wm.workspace_id = coalesce(
            c.workspace_id,
            (select p.workspace_id from projects p where p.id = c.project_id)
          )
      )
      and (
        -- プライベートチャンネル・DM: チャンネルメンバーのみ
        (
          (c.is_private = true or c.type = 'dm')
          and exists (
            select 1 from channel_members cm
            where cm.channel_id = c.id and cm.user_id = auth.uid()
          )
          and (
            c.type <> 'project'
            or c.project_id is null
            or not exists (
              select 1 from active_workspace_members wm
              where wm.user_id = auth.uid()
                and wm.workspace_id = coalesce(c.workspace_id, (select p.workspace_id from projects p where p.id = c.project_id))
                and wm.role = 'guest'
            )
            or exists (
              select 1 from project_members pm
              where pm.project_id = c.project_id and pm.user_id = auth.uid()
            )
          )
        )
        or
        -- 公開ワークスペースチャンネル: 同一ワークスペースの active メンバー全員
        (
          c.is_private = false
          and c.type = 'workspace'
        )
        or
        -- 公開プロジェクトチャンネル: guest は参加プロジェクトのみ、member 以上は全件可
        -- （requireChannelAccess / GET /api/projects/channels と同じスコープ感）
        (
          c.is_private = false
          and c.type = 'project'
          and c.project_id is not null
          and (
            not exists (
              select 1 from active_workspace_members wm
              where wm.user_id = auth.uid()
                and wm.workspace_id = coalesce(c.workspace_id, (select p.workspace_id from projects p where p.id = c.project_id))
                and wm.role = 'guest'
            )
            or exists (
              select 1 from project_members pm
              where pm.project_id = c.project_id and pm.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;
