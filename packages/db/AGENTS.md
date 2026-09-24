# packages/db

- スキーマは `src/schema/` が正。`pnpm --filter @cairn/db db:generate` で `supabase/migrations/` に SQL を生成し、`supabase migration up --local --include-all` で適用する（リポジトリルートで実行）
- **生成ファイル名は timestamp を残し、ランダムな形容詞名を変更内容が分かる英語 snake_case に直す**（例: `20260804115423_add_api_tokens.sql`）
- **マイグレーションは後方互換を基本とする**。merge 時の自動適用と Vercel デプロイの順序は保証されず、旧コードが新スキーマで動く時間がある。カラム削除・リネーム等の破壊的変更は2段階リリースにする（[`docs/production-deployment.md`](../../docs/production-deployment.md)）
- `supabase db reset --local` はデータを破棄する。破棄してよい環境（CI・初回検証）以外で使わない
- このパッケージのテストは DB 接続が必要なため原則書かない
