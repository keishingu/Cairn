-- 既存環境のチャット添付バケットも50MiBに拡張する。
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'chat-attachments';
