-- chat-attachments の SELECT / INSERT ポリシーをワークスペース所属で絞る
-- 旧ポリシーは bucket_id のみの条件で認証済みユーザー全員がアクセス可能だったため、
-- パスの第1セグメント（workspaceId）を workspace_members と照合して制限する

DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;

-- ストレージパス: {workspaceId}/{channelId}/{uuid}.{ext}
-- 第1セグメントが自分の所属ワークスペースと一致する場合のみ許可
CREATE POLICY "chat_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM workspace_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "chat_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM workspace_members
    WHERE user_id = auth.uid()
  )
);

-- DELETE は自分がアップロードしたファイルのみ（ワークスペース条件も追加）
DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;

CREATE POLICY "chat_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND owner_id = auth.uid()
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM workspace_members
    WHERE user_id = auth.uid()
  )
);
