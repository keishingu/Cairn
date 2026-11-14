-- プロジェクト更新を知らせる system メッセージが「どの項目の通知か」を持つ。
-- 通知の本文から項目を読み戻すと、名前や表示名の中身次第で別の項目と取り違えるため、構造化して持つ。
-- messages にカラムを足さず別テーブルにしているのは、このマイグレーションより先に新コードが動いた時間に
-- チャットの投稿（messages への INSERT）まで失敗させないため。
CREATE TABLE "message_project_updates" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"milestone_id" uuid
);
--> statement-breakpoint
-- サーバー（service role / 直接接続）からのみ読み書きする。クライアントには公開しない。
ALTER TABLE "message_project_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_project_updates" ADD CONSTRAINT "message_project_updates_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_project_updates" ADD CONSTRAINT "message_project_updates_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;
