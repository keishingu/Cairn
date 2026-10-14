-- メッセージの「タスク化する」は、1メッセージから複数のタスクを作れる（行ごと）。
-- 作成済みの判定は編集可能な title ではなく、元の行を持つ source_line で行う。
-- 同じメッセージの同じ行は1件にして、連打・再送・同時リクエストでも重複させない。
-- 旧チェックボックス由来のタスク（source_checkbox_index あり）は対象外。
-- NULL 可の列追加なので、旧コードが先に動いても壊れない。
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_line" text;
--> statement-breakpoint
-- 以降のバックフィル・DELETE の走査後、CREATE UNIQUE INDEX がロックを取る前に本番の API が同じ行を挿入すると、
-- インデックス作成が重複キーで失敗する。先に書き込みを止める（ロックは COMMIT まで保持され、自身の更新とは競合しない）。
LOCK TABLE "tasks" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- マージ前に作られたタスクの title を source_line に写す。アプリが使う source_line は元の行のハッシュなので一致せず、
-- マージ前に作られたタスクは作成済みと判定されないことがある（未マージ機能のため本番データなし）。
UPDATE "tasks"
SET "source_line" = "title"
WHERE "source_message_id" IS NOT NULL
  AND "source_checkbox_index" IS NULL
  AND "source_line" IS NULL;
--> statement-breakpoint
-- 新コードがこのマイグレーションより先に動いた間に重複ができていても作成が失敗しないよう、最古の1件を残して片付ける。
DELETE FROM "tasks" AS dup
USING "tasks" AS keep
WHERE dup."source_message_id" = keep."source_message_id"
  AND dup."source_line" = keep."source_line"
  AND dup."source_checkbox_index" IS NULL
  AND keep."source_checkbox_index" IS NULL
  AND (keep."created_at", keep."id") < (dup."created_at", dup."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tasks_message_task_line" ON "tasks" USING btree ("source_message_id","source_line")
  WHERE "tasks"."source_message_id" is not null and "tasks"."source_checkbox_index" is null and "tasks"."source_line" is not null;
