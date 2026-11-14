-- Cairn はデータの読み書きをすべて Route Handlers（Drizzle / service role）で行い、PostgREST を使っていない。
-- 本番は anon / authenticated に public のテーブル・ビューの権限がすでにないが、マイグレーションには残っておらず、
-- ローカル・Preview では Supabase の既定の権限で、ログインなしの公開キーでもテーブルを読めていた。
-- 本番の状態をマイグレーションに残して揃え、今後作るテーブル・ビュー・関数にも権限が付かないようにする。
-- 確認は supabase/checks/public-schema-lockdown.sql（migration-check.yml）。

-- 1. public のテーブル・ビュー・シーケンスの権限を anon / authenticated から外し、今後作るものにも付けない
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 2. 関数の実行権限を外す。SECURITY DEFINER の関数は所有者の権限で動き、テーブルの権限や RLS を素通りするため、
--    /rest/v1/rpc から呼べないようにする。拡張機能（pgvector・pg_trgm）の関数は対象外。
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
-- PostgreSQL は関数の作成時に PUBLIC へ EXECUTE を与える。これはスキーマ指定のない既定の権限なので、
-- IN SCHEMA 付きの revoke では外れない。PUBLIC はスキーマ指定なしで、Supabase が public スキーマに
-- 付けている anon / authenticated への既定の権限は IN SCHEMA public で外す
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- 3. Realtime の認可ポリシー（realtime.messages）から呼ぶチャンネルの権限判定だけ、authenticated に戻す
grant execute on function public.can_access_channel_topic(text) to authenticated;
