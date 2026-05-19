## 全般

- ユーザーの指示は曖昧なことがあるので、疑問点があれば質問すること
- 開発手順・アーキテクチャ・技術判断に変更があった場合は、README.md と CLAUDE.md を適宜更新すること


## リポジトリ構成

pnpm Workspace + Turborepo のモノレポ。

```
apps/web/          Next.js 15 (メインWebアプリ)
packages/core/     ドメイン型・ユースケース・ポートインターフェース
packages/db/       Drizzle ORM スキーマ・クライアント (Supabase PostgreSQL)
packages/shared/   共有型 (TypeScript) + Zod バリデーションスキーマ
packages/config/   tsconfig / ESLint の共有設定
```

主なコマンド: `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test`


## 技術スタック

- **フロントエンド**: Next.js 15, React 19, TypeScript, Tailwind CSS v3, shadcn/ui
- **状態管理**: TanStack Query (サーバー状態), Zustand (グローバルUI), nuqs (URL状態)
- **DB**: Supabase PostgreSQL + Drizzle ORM + pgvector
- **認証・リアルタイム・ストレージ**: Supabase Auth / Realtime / Storage
- **AI**: Vercel AI SDK + OpenAI API (gpt-4o / gpt-4o-mini)
- **非同期ジョブ**: Inngest


## アーキテクチャ方針

- `packages/core` に業務ロジックを集約し、DB・フレームワークから分離する
- ポートはインターフェース定義のみ。実装は `apps/web` 側に置く
- CQRS をコード構造として軽量に採用（Command / Query を分けて命名する）
- MVP では Write DB / Read DB を分離しない


## 決定済みの技術判断

- **tsconfig の extends は相対パス**で書く（`../../packages/config/tsconfig/base.json`）
  - Vite/Vitest の `tsconfck` が workspace パッケージ参照を解決できないため
- **AIモデルは OpenAI**（gpt-4o / gpt-4o-mini）。Claude は使用しない
- Mobile (Expo) は Phase 2 以降のため、現時点では実装しない


## テスト

- `test(...)` や `describe(...)` の説明文は日本語で書く
- テストファイルは対象ファイルの近くに配置する（例: `src/lib/foo.ts` に対して `src/lib/foo.test.ts`）
- テストランナーは vitest
- `packages/db` のテストはDB接続が必要なため原則書かない


## コミットメッセージ

- `feat:`, `fix:`, `chore:`, `docs:` などの Conventional Commits のプレフィックスを使う
- プレフィックスのあとの件名は日本語で書く
- 件名は体言止めにする
- 何を変更したかより、なぜ変更したかを優先して書く
- どのファイルを変更したか、どのように実装したかは繰り返さない（Git の履歴に残るため）
- 推奨スタイル: `fix: XXXXのため、ZZZZを修正`


## GitHubレビュー指摘への返信
- レビュー指摘へ返信する際は、「妥当な指摘のため、対応しました」のような汎用文だけで済ませない。
- 指摘が問題になる理由・影響と、どのように修正したかを1文で具体的に書く。
- 対応 commit がある場合は、commit hash だけでなく「コミットメッセージ + GitHubのcommitリンク」をMarkdownリンクで含める。
