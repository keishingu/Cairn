-- ワークスペースごとに「プロジェクト」の呼称を変更できるようにするためのカラム追加
ALTER TABLE "workspaces" ADD COLUMN "project_label" text;
