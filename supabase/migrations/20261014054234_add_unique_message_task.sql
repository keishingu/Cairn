-- メッセージの「タスク化する」は、1メッセージから複数のタスクを作れる（行ごと）。
-- 作成済みの判定は編集可能な title ではなく、元の行の識別子（ハッシュ）を持つ source_line で行う。
-- 同じメッセージの同じ行は1件にして、連打・再送・同時リクエストでも重複させない。
-- 旧チェックボックス由来のタスク（source_checkbox_index あり）は対象外。
--
-- Supabase CLI は文ごとにトランザクションなしで実行するため（LOCK TABLE が使えない）、列追加と一意インデックス作成を
-- 1つの DO ブロック（= 1トランザクション）にまとめる。ADD COLUMN が取る ACCESS EXCLUSIVE ロックは
-- ブロック終了まで保持されるので、列ができてからインデックスができるまでの間に重複行が挿入されることはない。
-- 新コードは source_line 列が無い間はタスク化を 503 で保留するため、この時点で source_line を持つ行は存在しない。
DO $$
BEGIN
  ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_line" text;
  CREATE UNIQUE INDEX IF NOT EXISTS "uniq_tasks_message_task_line" ON "tasks" USING btree ("source_message_id", "source_line")
    WHERE "source_message_id" IS NOT NULL AND "source_checkbox_index" IS NULL AND "source_line" IS NOT NULL;
END
$$;
