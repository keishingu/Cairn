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


## サイドキックコンポーネントの方針

`src/components/app/sidekick/` 配下のコンポーネントは、**PC 版の「サイドキック」ペイン（副画面・ウィジェット等）向けに設計し、モバイルブラウザの詳細画面でも同じコンポーネントを再利用する**前提で開発する。

- サイドキックコンポーネントは PC シェルへの依存（`AppShellContext` の `openPanel` 等）を持たないよう設計する
- PC 固有の機能が必要な場合はサイドキックコンポーネントに直接実装せず、props や Context 経由で注入する
- `MobileShell` / `MobileNav` はモバイルブラウザ専用のラッパーのため `_shells/` 配下に残す


## UI ディレクトリ構成と PC / モバイルの使い分け

```
components/app/
  pages/             PC メインビュー（ワイドレイアウト）
                     PC とモバイルで「同じ情報を密度だけ変えて見せる」場合は
                     ここに置いてレスポンシブ CSS で対応し、モバイルからも直接 import する

  sidekick/          PC サイドキック（狭幅）の中身
                     モバイルのプロジェクト詳細画面でも同じコンポーネントを再利用する
                     panel.tsx        … PC サイドキックのシェル（420px 固定パネル）
                     tabs/            … プロジェクト詳細のタブ内容（chat / tasks / files など）

  mobile/            モバイルブラウザ専用 UI
                     mobile-nav.tsx / mobile-header.tsx … モバイル共通パーツ
                     project-screen.tsx                 … モバイル用プロジェクト詳細シェル
                                                          （中身は sidekick/tabs/* を使用）
                     pages/                             … モバイルナビバーの行き先で
                                                          PC とは見た目が違う画面のみ置く
```

### コンポーネントを「共用」「個別」のどちらにするかの判断基準

- **同じコンポーネント（レスポンシブ対応あり）** で済むもの: タスク一覧、プロジェクト一覧、メンバー、ギャラリーなど「同じ情報を密度だけ変えて見せる」ケース
- **別コンポーネントが必要** なもの: チャット一覧のように PC（2 ペイン）とモバイル（1 ペイン）でナビゲーション構造そのものが違うケース

「シェル全体は UA で切り分け、個々のコンポーネント内ではメディアクエリで密度を調整する」のが基本方針。

### チャットとタスクの「プロジェクト紐付け」「野良」の扱い

- プロジェクト紐付けのチャット / タスクは `sidekick/tabs/chat-tab.tsx` / `sidekick/tabs/tasks-tab.tsx` で扱う（単一プロジェクトスコープ）
- 野良も含めた全体一覧は `pages/chat.tsx` / `pages/tasks.tsx`（PC メイン用）と、必要なら `mobile/pages/chat.tsx` 等（モバイル個別実装）に分離する


## 認証・API ルート実装規約

### 二つの動作モード

| 条件 | 動作 |
|------|------|
| `DATABASE_URL` 未設定 | Supabase なし開発モード。認証スキップ、モックデータを使用 |
| `DATABASE_URL` あり | 認証必須。未認証は `/auth/login` へリダイレクト |

ミドルウェア（`apps/web/src/middleware.ts`）が `DATABASE_URL` の有無を見てガードを切り替えるため、`supabase start` なしでも `pnpm dev` 単体で動く。

### API ルートでのユーザー取得

新しい API ルートを作るときは、必ず `getAuthContext()` を使ってユーザー ID とワークスペース ID を取得する。`DEV_*` のハードコード ID は書かない。

```ts
import { getAuthContext } from '@/lib/get-auth-context'

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error  // 未認証なら 401 を返す

  // ctx.userId, ctx.workspaceId が使える
}
```

`DATABASE_URL` 未設定時はモック ID が自動的に返るため、両モードで動作する。

### サインアップフロー

1. `/auth/signup` でメール・パスワード・表示名を入力
2. Supabase Auth でユーザー作成（`auth.users`）
3. `/api/auth/setup` を呼び出し、`profiles` テーブルへのプロフィール作成とデフォルトワークスペースの作成を行う
4. `/dashboard` へリダイレクト


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
