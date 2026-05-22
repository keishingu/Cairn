-- chat-attachments バケットに PDF・Office 文書の MIME タイプを追加する
-- 0005 適用時点では画像のみだったため、UPDATE で差分を適用する

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id = 'chat-attachments';
