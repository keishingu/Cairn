-- 以前の finalize は再試行時に同じ storage_path の files 行を重複作成していた。
-- 参照先を最も古い行へ寄せてから重複行を削除し、unique index 作成が既存データで失敗しないようにする。
CREATE TEMP TABLE duplicate_file_map ON COMMIT DROP AS
WITH ranked_files AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY workspace_id, storage_path
      ORDER BY created_at ASC, id ASC
    ) AS canonical_file_id,
    row_number() OVER (
      PARTITION BY workspace_id, storage_path
      ORDER BY created_at ASC, id ASC
    ) AS row_number
  FROM files
  WHERE storage_path IS NOT NULL
)
SELECT id AS duplicate_file_id, canonical_file_id
FROM ranked_files
WHERE row_number > 1;

UPDATE message_attachments AS attachment
SET file_id = duplicates.canonical_file_id
FROM duplicate_file_map AS duplicates
WHERE attachment.file_id = duplicates.duplicate_file_id;

UPDATE gallery_items AS item
SET file_id = duplicates.canonical_file_id
FROM duplicate_file_map AS duplicates
WHERE item.file_id = duplicates.duplicate_file_id;

UPDATE upload_requests AS request
SET file_id = duplicates.canonical_file_id
FROM duplicate_file_map AS duplicates
WHERE request.file_id = duplicates.duplicate_file_id;

-- 正規行にチャンクが無い場合だけ、重複行のうち1セットを引き継ぐ。
-- 全セットを統合すると同じ文書の embedding が検索結果を埋め尽くす。
CREATE TEMP TABLE duplicate_chunk_source_map ON COMMIT DROP AS
SELECT DISTINCT ON (duplicates.canonical_file_id)
  duplicates.duplicate_file_id,
  duplicates.canonical_file_id
FROM duplicate_file_map AS duplicates
WHERE NOT EXISTS (
  SELECT 1
  FROM document_chunks AS canonical_chunk
  WHERE canonical_chunk.source_type = 'file'
    AND canonical_chunk.source_id = duplicates.canonical_file_id
)
  AND EXISTS (
    SELECT 1
    FROM document_chunks AS duplicate_chunk
    WHERE duplicate_chunk.source_type = 'file'
      AND duplicate_chunk.source_id = duplicates.duplicate_file_id
  )
ORDER BY duplicates.canonical_file_id, duplicates.duplicate_file_id;

UPDATE document_chunks AS chunk
SET source_id = selected.canonical_file_id
FROM duplicate_chunk_source_map AS selected
WHERE chunk.source_type = 'file'
  AND chunk.source_id = selected.duplicate_file_id;

DELETE FROM document_chunks AS chunk
USING duplicate_file_map AS duplicates
WHERE chunk.source_type = 'file'
  AND chunk.source_id = duplicates.duplicate_file_id;

DELETE FROM files AS file
USING duplicate_file_map AS duplicates
WHERE file.id = duplicates.duplicate_file_id;

-- 削除した重複 bytes をそのまま家賃カウンタに残さない。履歴が無い移行時点で
-- カーソルと端数をリセットし、存在しないストレージを遡って請求しない。
UPDATE workspace_storage_usage AS usage
SET
  original_bytes = COALESCE((
    SELECT SUM(file_size)
    FROM files
    WHERE workspace_id = usage.workspace_id
  ), 0),
  derived_bytes = COALESCE((
    SELECT SUM(derived_file_size)
    FROM files
    WHERE workspace_id = usage.workspace_id
  ), 0),
  unbilled_rent_credits = 0,
  last_rent_at = now(),
  last_reconciled_at = now(),
  updated_at = now();

CREATE UNIQUE INDEX "files_workspace_storage_path_unique"
ON "files" USING btree ("workspace_id", "storage_path");
