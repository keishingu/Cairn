-- メッセージの「タスク化する」は、1メッセージから複数のタスクを作れる（行ごと）。
-- 同じメッセージの同じタイトルは1件にして、連打・再送・同時リクエストでも重複させない。
-- 旧チェックボックス由来のタスク（source_checkbox_index あり）は対象外。
-- 新コードがこのマイグレーションより先に動いた間に重複ができていても作成が失敗しないよう、最古の1件を残して片付ける。
-- DELETE の走査後、CREATE UNIQUE INDEX がロックを取る前に本番の API が同じ (source_message_id, title) を挿入すると、
-- インデックス作成が重複キーで失敗する。先に書き込みを止める（ロックは COMMIT まで保持され、自身の DELETE とは競合しない）。
LOCK TABLE "tasks" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DELETE FROM "tasks" AS dup
USING "tasks" AS keep
WHERE dup."source_message_id" = keep."source_message_id"
  AND dup."title" = keep."title"
  AND dup."source_checkbox_index" IS NULL
  AND keep."source_checkbox_index" IS NULL
  AND (keep."created_at", keep."id") < (dup."created_at", dup."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tasks_message_task_title" ON "tasks" USING btree ("source_message_id","title")
  WHERE "tasks"."source_message_id" is not null and "tasks"."source_checkbox_index" is null;
