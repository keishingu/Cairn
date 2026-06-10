-- チャットメッセージのチェックボックスとタスクの紐付け
ALTER TABLE tasks
  ADD COLUMN source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN source_checkbox_index integer;

CREATE INDEX idx_tasks_source_message ON tasks(source_message_id)
  WHERE source_message_id IS NOT NULL;
