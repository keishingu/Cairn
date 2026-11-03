-- 「Cairn でログイン」で外部アプリに発行されるアクセストークンは、通常ログインと同じユーザー JWT なので、
-- そのままでは Supabase Auth の /auth/v1/user で利用者のパスワードを変えてアカウントを乗っ取れる（docs/oidc-design.md §5・§9）。
-- Custom Access Token Hook で外部アプリ向けのトークン（claims に client_id が付く。リフレッシュ後も同じ）だけ書き換える。
-- - session_id: 発行のたびに、実在しないランダムな UUID にする。Auth はトークンのセッションを引けないため、
--   /auth/v1/user・/factors・/logout・/oauth/userinfo を session_not_found（403）で拒否する。
--   ゼロの UUID は「セッションなし」と扱われ、/logout で利用者の全端末のセッションが失効するので使わない
-- - aud: authenticated 以外にする。Cairn の API（isCairnSessionClaims）は client_id に加えて aud でも拒否する
-- ローカルで確かめた結果（2026-11-03、Auth v2.189.0）: 上の API はすべて 403、元のパスワードのまま、
-- リフレッシュと ID トークンの発行、通常ログインのセッションは影響なし。
-- ID トークンはこのフックの対象外で、ユーザー情報の読み取り・user_metadata の変更・メールアドレス変更の開始
-- （double_confirm_changes で旧・新両方の確認待ち）・全端末のログアウトができる。パスワード変更は再認証が必要。
-- フックの有効化は supabase/config.toml の [auth.hook.custom_access_token]（本番はダッシュボードの Auth Hooks）。
-- すべてのトークン発行で呼ばれ、失敗すると通常のログインもできなくなるため、外部アプリ向け以外は何も変えずに返す
create or replace function public.restrict_external_app_tokens(event jsonb)
returns jsonb
language plpgsql
volatile
as $function$
declare
  claims jsonb := event -> 'claims';
begin
  if claims ? 'client_id' and claims ->> 'client_id' is not null then
    claims := jsonb_set(claims, '{aud}', to_jsonb('cairn-external-app'::text));
    claims := jsonb_set(claims, '{session_id}', to_jsonb(gen_random_uuid()::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$function$;

-- フックは Supabase Auth（supabase_auth_admin）だけが呼ぶ。利用者や外部アプリからは呼べないようにする
grant execute on function public.restrict_external_app_tokens(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_external_app_tokens(jsonb) from public, anon, authenticated;
