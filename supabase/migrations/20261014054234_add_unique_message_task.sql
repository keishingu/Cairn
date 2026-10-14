-- メッセージの「タスク化する」は1メッセージ1タスクにする。連打・再送の同時リクエストでも重複させない。
-- 旧チェックボックス由来のタスク（source_checkbox_index あり）は1メッセージに複数あるため対象外。
CREATE UNIQUE INDEX "uniq_tasks_message_task" ON "tasks" USING btree ("source_message_id")
  WHERE "tasks"."source_message_id" is not null and "tasks"."source_checkbox_index" is null;
