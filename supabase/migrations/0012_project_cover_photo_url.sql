-- プロジェクトにカバー写真URLカラムを追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_photo_url text;
