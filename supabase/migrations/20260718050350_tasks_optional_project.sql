-- タスクをプロジェクト未所属でも作成できるようにする。
-- ワークスペースへの所属は project 経由ではなく workspace_id で直接担保する。

-- 1. workspace_id を追加（まずは NULL 許可で追加し、既存行を project 経由でバックフィル）
ALTER TABLE tasks ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE tasks
SET workspace_id = projects.workspace_id
FROM projects
WHERE tasks.project_id = projects.id;

ALTER TABLE tasks ALTER COLUMN workspace_id SET NOT NULL;

-- 2. project_id を任意（NULL 可）にする
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
