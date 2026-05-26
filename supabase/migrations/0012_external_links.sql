-- Google Docs などの外部リンクをファイルタブで管理するための変更

-- file_type enum に 'link' を追加
ALTER TYPE file_type ADD VALUE IF NOT EXISTS 'link';

-- 外部リンクはストレージパスを持たないため nullable に変更
ALTER TABLE files ALTER COLUMN storage_path DROP NOT NULL;
