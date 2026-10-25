-- PDF 原本は API の署名URL経由だけで配信し、Storage の直接ダウンロードを防ぐ。
-- 署名付きアップロード時に必要な Storage metadata 読み取りだけは許可する。
DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
CREATE POLICY "chat_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM active_workspace_members
    WHERE user_id = auth.uid()
  )
  AND (
    (storage.foldername(name))[4] IS DISTINCT FROM 'pdf-originals'
    OR storage.allow_only_operation('object.get_authenticated_info')
  )
);
