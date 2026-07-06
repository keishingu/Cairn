-- tasks テーブルへのインデックス追加
-- project_id / assignee_id でのフィルタが多いが、従来はインデックスがなかった
CREATE INDEX IF NOT EXISTS "idx_tasks_project" ON "tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_assignee" ON "tasks" ("assignee_id");
