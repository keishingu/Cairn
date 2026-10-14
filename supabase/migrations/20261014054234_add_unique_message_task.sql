-- メッセージの「タスク化する」は1メッセージ1タスクにする。連打・再送の同時リクエストでも重複させない。
-- 旧チェックボックス由来のタスク（source_checkbox_index あり）は1メッセージに複数あるため対象外。
-- 新コードがこのマイグレーションより先に動いた間に重複ができていても作成が失敗しないよう、最古の1件を残して片付ける。
DELETE FROM "tasks" AS dup
USING "tasks" AS keep
WHERE dup."source_message_id" = keep."source_message_id"
  AND dup."source_checkbox_index" IS NULL
  AND keep."source_checkbox_index" IS NULL
  AND (keep."created_at", keep."id") < (dup."created_at", dup."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tasks_message_task" ON "tasks" USING btree ("source_message_id")
  WHERE "tasks"."source_message_id" is not null and "tasks"."source_checkbox_index" is null;
