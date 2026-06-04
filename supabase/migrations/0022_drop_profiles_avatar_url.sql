-- profiles.avatar_url を削除する。
-- ワークスペース固有のアバター（workspace_members.avatar_url）のみを使用する設計に統一。
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
