-- 「Cairn でログイン」（OIDC）で外部アプリに発行されるトークンは、通常ログインと同じ authenticated の JWT に
-- client_id クレームが付いただけのもの。PostgREST・Storage・Realtime から Cairn のデータに触れられないよう閉じる
-- （docs/oidc-design.md §5）。確認は supabase/checks/external-app-containment.sql（migration-check.yml）。
--
-- Cairn はデータの読み書きをすべて Route Handlers（Drizzle / service role）で行い、PostgREST を使っていない。
-- 本番はすでに anon / authenticated にテーブル権限がないため、1〜2 はローカル・Preview を本番に揃える変更になる。

-- 1. public のテーブル・ビュー・シーケンスの権限を anon / authenticated から外し、今後作るものにも付けない
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 2. 関数の実行権限を外す。SECURITY DEFINER の関数は所有者の権限で動き、テーブルの権限や RLS を素通りするため、
--    /rest/v1/rpc から外部アプリのトークンで呼べないようにする。拡張機能（pgvector・pg_trgm）の関数は対象外。
--    トリガー関数は発火時に実行権限を確かめないため、外しても動作は変わらない
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Realtime の認可ポリシー（realtime.messages）から呼ぶ権限判定だけ、authenticated に実行権限を戻す。
--    権限判定の関数は、外部アプリのトークンなら常に false を返すようにする。
--    本体は直前の定義（20260824015656_add_task_channel.sql。ゲストは参加しているチャンネル・プロジェクトだけ）
--    をそのまま残し、client_id の判定だけを足す
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT (SELECT auth.jwt() ->> 'client_id') IS NULL
    AND EXISTS (
    SELECT 1
    FROM channels c
    WHERE c.id = p_channel_id
      AND EXISTS (
        SELECT 1 FROM active_workspace_members wm
        WHERE wm.user_id = auth.uid()
          AND wm.workspace_id = coalesce(
            c.workspace_id,
            (SELECT p.workspace_id FROM projects p WHERE p.id = c.project_id)
          )
          AND (
            wm.role <> 'guest'
            OR c.type = 'dm'
            OR (c.type = 'workspace' AND EXISTS (
              SELECT 1 FROM channel_members cm
              WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
            ))
            OR (c.type = 'project' AND EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = c.project_id AND pm.user_id = auth.uid()
            ))
          )
      )
      AND (
        ((c.is_private = true OR c.type = 'dm') AND EXISTS (
          SELECT 1 FROM channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        ))
        OR (c.is_private = false AND c.type IN ('workspace', 'project'))
      )
  );
$function$;

create or replace function public.can_access_channel_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_channel_id uuid;
begin
  -- 外部アプリのトークン（client_id 付き）には Realtime のチャンネルを購読させない
  if (select auth.jwt() ->> 'client_id') is not null then
    return false;
  end if;
  if p_topic !~ '^channel:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  v_channel_id := split_part(p_topic, ':', 2)::uuid;
  return public.can_access_channel(v_channel_id);
exception when others then
  return false;
end;
$function$;

create or replace function public.can_access_ai_nudge(p_workspace_id uuid, p_channel_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select (select auth.jwt() ->> 'client_id') is null
    and public.user_can_access_ai_nudge(
      (select auth.uid()),
      p_workspace_id,
      p_channel_id,
      p_project_id
    );
$function$;

-- create or replace は既存の権限を引き継ぐので、2 の剥奪のあとで Realtime に必要な1つだけを戻す
revoke execute on function public.can_access_channel(uuid) from public, anon, authenticated;
revoke execute on function public.can_access_ai_nudge(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_access_channel_topic(text) from public, anon;
grant execute on function public.can_access_channel_topic(text) to authenticated;

-- 4. Storage と Realtime の既存ポリシーは authenticated に許可を出しているので、外部アプリのトークンも通る。
--    RESTRICTIVE ポリシーで client_id 付きのトークンを一律に拒否する
drop policy if exists deny_external_app_tokens on storage.objects;
create policy deny_external_app_tokens on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

drop policy if exists deny_external_app_tokens on realtime.messages;
create policy deny_external_app_tokens on realtime.messages
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
