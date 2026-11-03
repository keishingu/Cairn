-- 「Cairn でログイン」で外部アプリに発行されるアクセストークンは、通常ログインと同じユーザー JWT なので、
-- そのままでは Supabase Auth の /auth/v1/user で利用者のパスワードを変えてアカウントを乗っ取れる（docs/oidc-design.md §5・§9）。
-- Custom Access Token Hook で外部アプリ向けのトークン（claims に client_id が付く。リフレッシュ後も同じ）だけ書き換える。
-- - session_id: 存在しないセッションにする。Auth は有効なセッションのないトークンに対して、パスワード変更で再認証
--   （本人のメールに届く nonce）を求め、MFA の登録を拒否する（secure_password_change = true が前提）
-- - aud: authenticated 以外にする。Cairn の API（isCairnSessionClaims）は client_id に加えて aud でも拒否する
-- ローカルで確かめた結果（2026-11-03、Auth v2.189.0）: パスワード変更は reauthentication_needed、MFA の登録は
-- セッションがないため失敗。ユーザー情報の読み取りと user_metadata の変更は防げない（ID トークンでも同じ）。
-- メールアドレスの変更は double_confirm_changes で旧・新両方の確認が要るため、外部アプリだけでは完了しない。
-- フックの有効化は supabase/config.toml の [auth.hook.custom_access_token]（本番はダッシュボードの Auth Hooks）。
-- すべてのトークン発行で呼ばれ、失敗すると通常のログインもできなくなるため、外部アプリ向け以外は何も変えずに返す
create or replace function public.restrict_external_app_tokens(event jsonb)
returns jsonb
language plpgsql
stable
as $function$
declare
  claims jsonb := event -> 'claims';
begin
  if claims ? 'client_id' and claims ->> 'client_id' is not null then
    claims := jsonb_set(claims, '{aud}', to_jsonb('cairn-external-app'::text));
    claims := jsonb_set(claims, '{session_id}', to_jsonb('00000000-0000-0000-0000-000000000000'::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$function$;

-- フックは Supabase Auth（supabase_auth_admin）だけが呼ぶ。利用者や外部アプリからは呼べないようにする
grant execute on function public.restrict_external_app_tokens(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_external_app_tokens(jsonb) from public, anon, authenticated;
