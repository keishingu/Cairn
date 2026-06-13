-- ゲスト招待時にプロジェクトを紐付けるためのカラム
ALTER TABLE workspace_invites
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
