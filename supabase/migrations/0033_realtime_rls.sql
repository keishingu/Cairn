-- Supabase Realtime 化の前提として、Realtime で配信するテーブルに RLS を有効化する。
--
-- postgres_changes は購読者ごとに RLS の SELECT ポリシーで行をフィルタするため、
-- RLS なしで publication に追加すると、認証済みユーザー全員にプライベート/DM を含む
-- 全チャンネルのメッセージ本文が配信されてしまう。
--
-- 書き込み（INSERT/UPDATE/DELETE）は全て API（Drizzle = テーブルオーナー接続）経由のため、
-- 書き込みポリシーは定義しない。オーナーロールは RLS をバイパスする。

-- ─── チャンネルアクセス判定関数 ──────────────────────────────────
-- messages / message_reactions の SELECT ポリシーで共有する。
-- SECURITY DEFINER でオーナー権限実行とし、参照先テーブル（channels 等）の
-- RLS 状態に依存せず安定して判定できるようにする。
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
      and (
        -- プライベートチャンネル・DM: チャンネルメンバーのみ
        (
          (c.is_private = true or c.type = 'dm')
          and exists (
            select 1 from channel_members cm
            where cm.channel_id = c.id and cm.user_id = auth.uid()
          )
        )
        or
        -- 公開チャンネル（workspace / project）: 同一ワークスペースのメンバー全員
        (
          c.is_private = false
          and c.type in ('workspace', 'project')
          and exists (
            select 1 from workspace_members wm
            where wm.user_id = auth.uid()
              and wm.workspace_id = coalesce(
                c.workspace_id,
                (select p.workspace_id from projects p where p.id = c.project_id)
              )
          )
        )
      )
  );
$$;

grant execute on function public.can_access_channel(uuid) to authenticated;

-- ─── messages ────────────────────────────────────────────────────
alter table "messages" enable row level security;

create policy "messages_select" on "messages"
  for select to authenticated
  using (public.can_access_channel(channel_id));

-- ─── message_reactions ───────────────────────────────────────────
alter table "message_reactions" enable row level security;

create policy "message_reactions_select" on "message_reactions"
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_reactions.message_id
        and public.can_access_channel(m.channel_id)
    )
  );

-- ─── notifications ───────────────────────────────────────────────
alter table "notifications" enable row level security;

create policy "notifications_select" on "notifications"
  for select to authenticated
  using (user_id = auth.uid());

-- ─── channel_read_states ─────────────────────────────────────────
alter table "channel_read_states" enable row level security;

create policy "channel_read_states_select" on "channel_read_states"
  for select to authenticated
  using (user_id = auth.uid());

-- ─── Realtime publication への追加 ───────────────────────────────
-- Supabase は supabase_realtime publication を既定で作成するが、
-- 素の PostgreSQL での db reset 等に備えて存在しなければ作成する
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table "messages";
alter publication supabase_realtime add table "message_reactions";
alter publication supabase_realtime add table "notifications";
alter publication supabase_realtime add table "channel_read_states";
