-- Storage の削除ジョブに「この時刻より前には実行しない」を持たせる。
-- 署名付きアップロード URL は発行から2時間使えるため、退会時に本体を消した後でも、その URL で同じ場所へ
-- アップロードし直せる。URL の期限が切れた後にもう一度消すジョブを、時刻を指定して積めるようにする
ALTER TABLE storage_deletion_jobs ADD COLUMN IF NOT EXISTS not_before timestamp with time zone;
