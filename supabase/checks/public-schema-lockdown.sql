-- Cairn は PostgREST を使わないため、public のテーブル・ビュー・関数を anon / authenticated から閉じている
-- （supabase/migrations/20261103042717_lock_down_public_schema.sql）。新しいテーブル・ビュー・関数でも
-- この状態が保たれているかを、DB のカタログで確かめる。migration-check.yml が全マイグレーションを適用した DB に
-- 対して実行し、1件でも外れていれば例外で失敗させる。
do $$
declare
  problems text[] := '{}';
  r record;
begin
  -- public の全テーブルで RLS が有効であること（権限が誤って戻っても0行しか見えない二重の守り）
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    problems := problems || format('RLS が無効なテーブル: public.%I', r.relname);
  end loop;

  -- anon / authenticated が public のテーブル・ビューに権限を持たないこと
  for r in
    select c.relname, g.rolname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as g(rolname)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        has_table_privilege(g.rolname, c.oid, 'SELECT')
        or has_table_privilege(g.rolname, c.oid, 'INSERT')
        or has_table_privilege(g.rolname, c.oid, 'UPDATE')
        or has_table_privilege(g.rolname, c.oid, 'DELETE')
      )
  loop
    problems := problems || format('%s が権限を持つリレーション: public.%I', r.rolname, r.relname);
  end loop;

  -- anon / authenticated が実行できる関数は、Realtime の認可で使う権限判定だけであること。
  -- SECURITY DEFINER の関数は所有者の権限で動き、テーブルの権限や RLS を素通りするため。拡張機能の関数は対象外
  for r in
    select p.oid::regprocedure::text as sig, g.rolname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as g(rolname)
    where n.nspname = 'public'
      and has_function_privilege(g.rolname, p.oid, 'EXECUTE')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not (g.rolname = 'authenticated' and p.oid = 'public.can_access_channel_topic(text)'::regprocedure)
  loop
    problems := problems || format('%s が実行できる関数: %s', r.rolname, r.sig);
  end loop;

  if array_length(problems, 1) > 0 then
    raise exception E'public スキーマが anon / authenticated に開いています:\n%',
      array_to_string(problems, E'\n');
  end if;
end $$;
