-- /ai の資料検索で新しいプロジェクト・ファイルを優先する重み。値の集合は @cairn/shared の AI_SEARCH_RECENCY_WEIGHTS と同じ。
-- 既定の 'none' は従来どおり意味の近さだけで並べるため、既存ワークスペースの挙動は変わらない。旧コードはこの列を読まないため後方互換。
-- 1 文で列と CHECK 制約を追加し、トランザクションなしで実行しても中途半端な状態を残さない。
ALTER TABLE "workspaces"
  ADD COLUMN "ai_search_recency_weight" text NOT NULL DEFAULT 'none',
  ADD CONSTRAINT "workspaces_ai_search_recency_weight_check" CHECK ("ai_search_recency_weight" IN ('none', 'weak', 'medium', 'strong'));
