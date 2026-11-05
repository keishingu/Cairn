-- Solo の支援者本人が動画（MP4 / MOV / WebM、1ファイル 500MiB まで）を添付できるよう、
-- chat-attachments バケットの上限と許可 MIME を広げる。
-- 誰がどのサイズを送れるかは upload-url / finalize が判定し、バケットは上限の最後の砦として使う。
-- ホスト版 Supabase では、プロジェクト全体のアップロード上限（Storage 設定）も 500MiB 以上にしておく必要がある。
UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
WHERE id = 'chat-attachments';
