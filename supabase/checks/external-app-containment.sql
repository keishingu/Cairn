-- 「Cairn でログイン」（OIDC）で外部アプリに発行されるトークンは、通常ログインと同じ authenticated の JWT。
-- PostgREST・Storage・Realtime から Cairn のデータに触れられない状態が保たれているかを、DB のカタログで確かめる
-- （docs/oidc-design.md §5）。migration-check.yml が全マイグレーションを適用した DB に対して実行し、
-- 1件でも外れていれば例外で失敗させる。
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

  -- authenticated が実行できる SECURITY DEFINER の関数は、外部アプリのトークン（client_id 付き）を拒否すること
  -- （所有者の権限で動き、テーブルの権限や RLS を素通りするため）。拡張機能の関数は対象外
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.prosrc not like '%client_id%'
  loop
    problems := problems || format('client_id を拒否しない SECURITY DEFINER 関数: %s', r.sig);
  end loop;

  -- Storage と Realtime に、外部アプリのトークンを拒否する RESTRICTIVE ポリシーがあること
  for r in
    select t.relid::text as rel
    from (values ('storage.objects'::regclass), ('realtime.messages'::regclass)) as t(relid)
    where not exists (
      select 1
      from pg_policy p
      where p.polrelid = t.relid
        and not p.polpermissive
        and p.polname = 'deny_external_app_tokens'
    )
  loop
    problems := problems || format('外部アプリのトークンを拒否する RESTRICTIVE ポリシーがない: %s', r.rel);
  end loop;

  -- 外部アプリ向けのトークンを書き換えるフック（restrict_external_app_tokens）があり、Supabase Auth 以外からは呼べないこと
  if to_regprocedure('public.restrict_external_app_tokens(jsonb)') is null then
    problems := problems || 'Custom Access Token Hook の関数がない: public.restrict_external_app_tokens(jsonb)'::text;
  elsif has_function_privilege('authenticated', 'public.restrict_external_app_tokens(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.restrict_external_app_tokens(jsonb)', 'EXECUTE')
     or not has_function_privilege('supabase_auth_admin', 'public.restrict_external_app_tokens(jsonb)', 'EXECUTE') then
    problems := problems || 'Custom Access Token Hook の関数の実行権限が supabase_auth_admin だけになっていない'::text;
  end if;

  if array_length(problems, 1) > 0 then
    raise exception E'外部アプリのトークンの封じ込みが崩れています（docs/oidc-design.md §5）:\n%',
      array_to_string(problems, E'\n');
  end if;
end $$;
