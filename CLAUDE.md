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
- ただし MVP のチャット同期は、まず TanStack Query のポーリングで実装し、必要に応じて Supabase Realtime へ段階移行する
- **AI**: Vercel AI SDK + OpenAI API (gpt-4o / gpt-4o-mini)
- **非同期ジョブ**: Inngest


## アーキテクチャ方針

- `packages/core` に業務ロジックを集約し、DB・フレームワークから分離する
- ポートはインターフェース定義のみ。実装は `apps/web` 側に置く
- CQRS をコード構造として軽量に採用（Command / Query を分けて命名する）
- MVP では Write DB / Read DB を分離しない


## ローカル開発環境

- **Supabase CLI + Docker** を使う。`supabase start` で PostgreSQL / Auth / Storage / Realtime / Studio が一括起動する
- 環境変数は `apps/web/.env.local.example` をコピーして使う。`supabase start` のデフォルトキーが事前入力済み
- DBスキーマは `packages/db/src/schema/` で管理（Drizzle が正）→ `pnpm db:generate` で `supabase/migrations/` にSQLを生成 → `supabase db reset` でローカルに適用

起動順序:
```bash
supabase start
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```


## 決定済みの技術判断

- **tsconfig の extends は相対パス**で書く（`../../packages/config/tsconfig/base.json`）
  - Vite/Vitest の `tsconfck` が workspace パッケージ参照を解決できないため
- **AIモデルは OpenAI**（gpt-4o / gpt-4o-mini）。Claude は使用しない
- Mobile (Expo) は Phase 2 以降のため、現時点では実装しない
- **UA ベースのデバイス出し分け**: middleware で `x-device` ヘッダーをセットし、`app/(app)/layout.tsx` で PC シェル / モバイルシェルを切り替える。レスポンシブ CSS は使わない


## Detail Panel コンポーネントの方針

`src/components/app/detail-panel/` 配下のコンポーネントは、**PC 版の右側 Detail Panel（Inspector）向けに設計し、モバイルでも同じコンポーネントを再利用する**前提で開発する。

- Detail Panel コンポーネントは PC シェルへの依存（`AppShellContext` の `openPanel` 等）を持たないよう設計する
- PC 固有の機能が必要な場合は props や Context 経由で注入する
- `MobileShell` / `MobileNav` はモバイルブラウザ専用のラッパーのため `_shells/` 配下に残す


## UI ディレクトリ構成と PC / モバイルの使い分け

```
components/app/
  pages/             PC・モバイル共通のメインビュー
                     isMobile prop で1ペイン／多ペインを切り替える
                     （例: pages/chat.tsx は PC で3カラム、モバイルで1カラム遷移）

  detail-panel/      PC 右側 Detail Panel（Inspector）の中身
                     モバイルのプロジェクト詳細画面でも同じコンポーネントを再利用する
                     panel.tsx        … PC Detail Panel のシェル（420px 固定パネル）
                     tabs/            … プロジェクト詳細のタブ内容（chat / tasks / files など）
                     pages/           … モバイルナビバーの行き先ページ（暫定置き場）

  mobile/            モバイルブラウザ専用 UI（PC とナビゲーション構造が根本的に違う場合のみ）
                     project-screen.tsx … モバイル用プロジェクト詳細シェル
                                          （中身は detail-panel/tabs/* を使用）
```

### コンポーネントを「共用」「個別」のどちらにするかの判断基準

- **`pages/` で共用（isMobile prop）**: PC とモバイルでレイアウト・ペイン数が違うが、ロジックは同じケース（チャット、タスク一覧等）
- **`mobile/` で個別実装**: ナビゲーション構造そのものが根本的に異なり、共用コンポーネントに isMobile を足しても複雑になりすぎるケース

「シェル全体は UA で切り分け、コンポーネント内は isMobile prop またはメディアクエリで密度・レイアウトを調整する」のが基本方針。

### チャットとタスクの「プロジェクト紐付け」「野良」の扱い

- プロジェクト紐付けのチャット / タスクは `detail-panel/tabs/chat-tab.tsx` / `detail-panel/tabs/tasks-tab.tsx` で扱う（単一プロジェクトスコープ）
- 野良も含めた全体一覧は `pages/chat.tsx` / `pages/tasks.tsx`（PC・モバイル共通、isMobile prop で切り替え）


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
