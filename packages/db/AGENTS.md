# packages/db

- スキーマは `src/schema/` が正。`pnpm --filter @cairn/db db:generate` で `supabase/migrations/` に SQL を生成し、`supabase migration up --local --include-all` で適用する（リポジトリルートで実行）
- **生成ファイル名は timestamp を残し、ランダムな形容詞名を変更内容が分かる英語 snake_case に直す**（例: `20260804115423_add_api_tokens.sql`）
- **マイグレーションは後方互換を基本とする**。merge 時の自動適用と Vercel デプロイの順序は保証されず、旧コードが新スキーマで動く時間がある。カラム削除・リネーム等の破壊的変更は2段階リリースにする（[`docs/production-deployment.md`](../../docs/production-deployment.md)）
- `supabase db reset --local` はデータを破棄する。破棄してよい環境（CI・初回検証）以外で使わない
- このパッケージのテストは DB 接続が必要なため原則書かない
- **設定の保存先は値の形で決める**。人がワークスペースをまたいで持ち、値が閉じた真偽値か列挙で、全行に既定が要り、不正値を DB で拒否し、Web とアプリが `GET /api/me` のフィールドとして読むものは `profiles` のカラム（`NOT NULL` + `CHECK`）にする。該当は `theme`、`accent_id`、`ai_nudges_enabled`、`calendar_week_start`。無くてもよい、`null` で未設定、リストや入れ子でマイグレーションせず増やしたい、1件を読んで一部だけマージして書き戻すものは JSON にする。今の JSON は `workspaces.settings`（`projectLabel`、`coverPhotos`）だけ。ワークスペースの AI 巡回のオンオフは真偽値で既定があるため、同じテーブルに JSON があっても専用カラムのままにする。同じ形の個人設定が増えてカラム追加の負担が大きくなった時点で、`profiles` の表示設定用 JSON を検討する
