# Cairn

山岳部の山行計画を起点とした、プロジェクト管理・チャット・カレンダー・ファイル管理・ギャラリー・AIアシスタントを統合したコラボレーションアプリケーション。

設計資料と作業別の参照先は [`docs/README.md`](docs/README.md)、AI エージェント向けの規約は [`AGENTS.md`](AGENTS.md) を参照。

## ローカル開発環境

必要なツール: Node.js 20+ / pnpm 9+ / [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) / Docker（Supabase CLI が使用）

リポジトリルートで実行する。

```bash
pnpm install
supabase start                                          # PostgreSQL / Auth / Storage / Realtime / Studio
cp apps/web/.env.local.example apps/web/.env.local      # supabase start の既定キーが設定済み
supabase migration up --local --include-all             # 未適用のマイグレーションだけ適用
pnpm dev                                                # http://localhost:3128
```

- 初回は `/auth/signup` でアカウントを作る（ローカルはメール確認不要）
- pull・ブランチ切り替え後も `supabase migration up --local --include-all` で差分を適用する。`.env.local` の再コピーや DB の reset は不要
- メンション・DM・ファイルの通知は Inngest 経由のため、確認するときは Inngest dev server も起動する
- キーが変わったときは `supabase status` で確認する。停止は `supabase stop`

## コマンド

```bash
pnpm dev        # 開発サーバー（apps/web）
pnpm build      # 全パッケージビルド
pnpm typecheck  # 型チェック
pnpm lint       # Lint
pnpm test       # テスト
pnpm format     # フォーマット
```

### DB マイグレーション

スキーマは `packages/db/src/schema/` が正。変更したときだけ SQL を生成する。

```bash
pnpm --filter @cairn/db db:generate           # supabase/migrations/ に出力。内容を確認してから適用
supabase migration up --local --include-all
pnpm --filter @cairn/db db:studio             # Drizzle Studio
```

- 生成ファイル名の付け方と後方互換のルールは [`packages/db/AGENTS.md`](packages/db/AGENTS.md)
- `--include-all` は、並行開発でマージ順とタイムスタンプ順が前後しても履歴にないマイグレーションを適用するため（CI の [`migrate.yml`](.github/workflows/migrate.yml) と同じ）
- `supabase db reset --local` は DB を作り直し、既存データを失う。破棄してよい環境でのみ使う

## リポジトリ構成

```
apps/
  web/        Next.js 15（Web + API Route Handlers + リモート MCP /api/mcp）
  mobile/     Expo（WebView ラッパー + ネイティブチャット + Push）
  desktop/    Electron（デプロイ済みの Web 版を表示）
packages/
  core/       DB・フレームワーク非依存のドメインロジック（@cairn/core/billing）
  db/         Drizzle ORM スキーマ・クライアント
  shared/     共有型・Zod スキーマ・FEATURE_FLAGS
  config/     tsconfig・ESLint 共有設定
supabase/     Supabase CLI 設定とマイグレーション SQL
docs/         設計資料
```

## その他のアプリ・機能

| 対象 | 参照先 |
|---|---|
| モバイル（Expo）のローカル開発・実機のトラブル対処 | [`docs/mobile-app.md`](docs/mobile-app.md) |
| PR の Mobile Preview・Internal Distribution・EAS の初期設定 | [`docs/mobile-internal-distribution.md`](docs/mobile-internal-distribution.md) |
| App Store / TestFlight | [`docs/app-store-submission.md`](docs/app-store-submission.md) |
| Electron デスクトップアプリ | [`docs/desktop-app.md`](docs/desktop-app.md) |
| Web Push 通知（VAPID） | [`docs/web-push.md`](docs/web-push.md) |
| PWA アイコン・アクセントカラーの追加 | [`docs/frontend-guidelines.md`](docs/frontend-guidelines.md#pwa-アイコンとアクセントカラー) |
| 本番デプロイ・リリース | [`docs/production-deployment.md`](docs/production-deployment.md) |

## ライセンス

Apache License 2.0
