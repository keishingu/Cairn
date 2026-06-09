-- プロジェクトに場所情報カラムを追加
ALTER TABLE "projects" ADD COLUMN "location" text;
ALTER TABLE "projects" ADD COLUMN "place_id" text;
