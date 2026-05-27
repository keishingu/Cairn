-- ワークスペース別アバターのサポート
-- workspace_members にアバターURLを追加し、profiles.avatarUrl をグローバルデフォルトとして使うフォールバック構造にする
ALTER TABLE workspace_members ADD COLUMN avatar_url text;
