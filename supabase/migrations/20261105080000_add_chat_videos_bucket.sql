-- Solo の支援者本人が送る動画（MP4 / MOV / WebM、1ファイル 500MiB まで）専用の非公開バケット。
-- chat-attachments の上限（50MiB）を上げると、動画以外の署名付きアップロードでも finalize を
-- 呼ばずに 500MiB のオブジェクトを期限切れの清掃まで置けてしまうため、バケットを分けて
-- 大きい上限を動画の MIME だけに閉じ込める。
-- 誰が送れるかは upload-url / finalize が判定し、取得は API が発行する署名 URL だけで行う
-- （authenticated へのポリシーは付けない）。
-- ホスト版 Supabase では、プロジェクト全体のアップロード上限（Storage 設定）も 500MiB 以上にしておく必要がある。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-videos',
  'chat-videos',
  false,
  524288000,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
