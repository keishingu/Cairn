-- チャット添付ファイルをメッセージと切り離して管理するため、
-- message_attachments テーブルと chat-attachments ストレージバケットを追加する

CREATE TABLE "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_message_attachments_message" ON "message_attachments" ("message_id");

-- chat-attachments バケット（プライベート）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760, -- 10 MiB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- パス構造: {workspaceId}/{channelId}/{filename}
-- 署名付きURLはサーバーサイドで生成するため、SELECT は認証済みユーザー全員に許可する
CREATE POLICY "chat_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND owner_id = auth.uid()
);
