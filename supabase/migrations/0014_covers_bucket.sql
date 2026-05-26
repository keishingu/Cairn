-- プロジェクトにカバー写真URLカラムを追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_photo_url text;

-- coversバケットを作成（ワークスペースのカバー写真用）
INSERT INTO storage.buckets (id, name, public)
VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;
