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
- チャット同期は TanStack Query のポーリングで実装し、必要に応じて Supabase Realtime へ移行する
- **AI**: Vercel AI SDK + OpenAI API (gpt-4o / gpt-4o-mini)
- **非同期ジョブ**: Inngest


## アーキテクチャ方針

- `packages/core` に業務ロジックを集約し、DB・フレームワークから分離する
- ポートはインターフェース定義のみ。実装は `apps/web` 側に置く
- CQRS をコード構造として軽量に採用（Command / Query を分けて命名する）
- Write DB / Read DB は分離しない


## ローカル開発環境

- **Supabase CLI + Docker** を使う。`supabase start` で PostgreSQL / Auth / Storage / Realtime / Studio が一括起動する
- 環境変数は `apps/web/.env.local.example` をコピーして使う。`supabase start` のデフォルトキーが事前入力済み
- DBスキーマは `packages/db/src/schema/` で管理（Drizzle が正）→ `pnpm db:generate` で `supabase/migrations/` にSQLを生成 → `supabase migration up` でローカルに差分適用（データを保持したまま未適用マイグレーションだけ実行）
- `supabase db reset` はデータを全削除して再構築するため、CI や初回セットアップ専用

起動順序:
```bash
supabase start
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```

- **通知・AIインデックスは Inngest ジョブ経由**。ローカルで Inngest dev server を起動していないと、メンション・DM・ファイルの通知が**サイレントに生成されない**（API は `inngest.send()` 失敗を warn ログに残すのみ）。通知周りを動作確認する際は Inngest dev server を併せて起動すること


## 決定済みの技術判断

- **tsconfig の extends は相対パス**で書く（`../../packages/config/tsconfig/base.json`）
  - Vite/Vitest の `tsconfck` が workspace パッケージ参照を解決できないため
- **AIモデルは OpenAI**（gpt-4o / gpt-4o-mini）。Claude は使用しない
- Mobile (Expo) は Phase 2 以降のため、現時点では実装しない
- **UA ベースのデバイス出し分け**: middleware で `x-device` ヘッダーをセットし、`app/(app)/layout.tsx` で PC シェル / モバイルシェルを切り替える。レスポンシブ CSS は使わない
- **プロジェクトビューは localStorage で管理**: 旧 `/calendar` `/kanban` は Server Component で `/projects` にリダイレクト済み。ビュー切替（一覧 / カレンダー / カンバン）はURLパラメータを使わず localStorage のみで永続化（`STORAGE_KEYS.projects_view_pc` / `STORAGE_KEYS.projects_view_mob`）。`/projects/[id]` はプロジェクト詳細（現在は `/projects?open={id}` にリダイレクト）
- **API 認証は Bearer トークン（Supabase JWT）**: Web クライアントも Expo も同じ Next.js Route Handlers を呼び出し、`Authorization: Bearer <token>` で認証する。`getAuthContext()` は `Authorization` ヘッダを優先し、なければ Cookie にフォールバックする。Hono API 分離は「Next.js からの独立スケール・デプロイ分離が必要」になった時点で改めて検討する


## エラー表示

- **明示的なフォールバック指示がない限り、エラーを表示する**
- データが取得できない・見つからない場合は、サイレントに代替データへ fallback せず、ユーザーにエラーメッセージを見せる
- `?? someDefaultValue` で誤ったデータが表示されるより、エラーが見える方が問題の発見・デバッグが早い


## テスト

- `test(...)` や `describe(...)` の説明文は日本語で書く
- テストファイルは対象ファイルの近くに配置する（例: `src/lib/foo.ts` に対して `src/lib/foo.test.ts`）
- テストランナーは vitest
- `packages/db` のテストはDB接続が必要なため原則書かない


## ブランチ運用

- 実装を始める前に必ずフィーチャーブランチを切る（`main` に直接コミットしない）
- ブランチ名は `feat/`, `fix/`, `refactor/` などのプレフィックスを付ける


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


## 詳細ドキュメント

特定の作業時に参照:

- [`docs/frontend-guidelines.md`](docs/frontend-guidelines.md) — コンポーネント設計・Domain Hook パターン・UIディレクトリ構成
- [`docs/api-conventions.md`](docs/api-conventions.md) — API ルート実装規約・認証・サインアップフロー
- [`docs/notification-design.md`](docs/notification-design.md) — 通知設計（メンション・Push・アプリ内通知）
