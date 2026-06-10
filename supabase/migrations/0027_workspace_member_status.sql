-- ワークスペースメンバーごとのステータス（オンライン/退席中/取り込み中/オフライン）
CREATE TYPE user_status AS ENUM ('online', 'away', 'busy', 'offline');

ALTER TABLE workspace_members
  ADD COLUMN status user_status NOT NULL DEFAULT 'online';
