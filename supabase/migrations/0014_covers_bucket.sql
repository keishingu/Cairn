-- coversバケットを作成（ワークスペースのカバー写真用）
INSERT INTO storage.buckets (id, name, public)
VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;
