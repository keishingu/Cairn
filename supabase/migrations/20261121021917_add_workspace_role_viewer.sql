-- 閲覧だけで参加したい人向けに、ワークスペースロール viewer（閲覧のみ）を追加する。
-- 閲覧範囲は member と同じなので、`role <> 'guest'` で判定している SQL 関数（can_access_channel など）は変更しない。
-- 書き込みの拒否は API（getAuthContext）が一律に行う。
ALTER TYPE "public"."workspace_role" ADD VALUE IF NOT EXISTS 'viewer';
