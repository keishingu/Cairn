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

UPDATE document_chunks AS chunk
SET source_id = duplicates.canonical_file_id
FROM duplicate_file_map AS duplicates
WHERE chunk.source_type = 'file'
  AND chunk.source_id = duplicates.duplicate_file_id;

DELETE FROM files AS file
USING duplicate_file_map AS duplicates
WHERE file.id = duplicates.duplicate_file_id;

CREATE UNIQUE INDEX "files_workspace_storage_path_unique"
ON "files" USING btree ("workspace_id", "storage_path");
