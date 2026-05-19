# Cairn

山岳部の山行計画を起点とした、プロジェクト管理・チャット・カレンダー・ファイル管理・ギャラリー・AIアシスタントを統合したコラボレーションアプリケーション。

プロダクト仕様は [`docs/`](./docs) を参照。

---

## ローカル開発環境

### 必要なツール

- Node.js 20+
- pnpm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`brew install supabase/tap/supabase`)
- Docker（Supabase CLI が内部で使用）

### セットアップ手順

```bash
# 1. 依存関係インストール
pnpm install

# 2. Supabase ローカル環境を起動（PostgreSQL / Auth / Storage / Realtime）
supabase start

# 3. 環境変数をコピー（値はそのまま使える）
cp apps/web/.env.local.example apps/web/.env.local

# 4. DB マイグレーションを適用
cd packages/db && pnpm db:generate && cd ../..
supabase db reset

# 5. 開発サーバー起動
pnpm dev
```

ブラウザで http://localhost:3000 を開く。

### Supabase ローカル環境の確認

`supabase start` 後に表示されるキーは `.env.local.example` にあらかじめ設定済み。
変更になった場合は `supabase status` で確認できる。

```
API URL:      http://127.0.0.1:54321
Studio URL:   http://127.0.0.1:54323
DB URL:       postgresql://postgres:postgres@127.0.0.1:54322/postgres
anon key:     eyJhbGci...
service_role: eyJhbGci...
```

### 停止

```bash
supabase stop
```

---

## コマンド

```bash
pnpm dev        # 開発サーバー起動 (apps/web)
pnpm build      # 全パッケージビルド
pnpm typecheck  # 型チェック
pnpm lint       # Lint
pnpm test       # テスト
pnpm format     # コードフォーマット
```

### DBマイグレーション

```bash
cd packages/db
pnpm db:generate  # Drizzle スキーマからマイグレーションSQL生成 (supabase/migrations/ に出力)
pnpm db:studio    # Drizzle Studio 起動
```

マイグレーションをローカル DB に適用する場合：

```bash
supabase db reset  # マイグレーションを最初から適用（データはリセットされる）
```

---

## リポジトリ構成

```
cairn/
  apps/
    web/          # Next.js 15 (メインWebアプリ)
  packages/
    core/         # ドメイン / ユースケース / ポート定義
    db/           # Drizzle ORM スキーマ・クライアント
    shared/       # 共有型・Zodスキーマ
    config/       # tsconfig・ESLint共有設定
  supabase/
    config.toml   # Supabase CLI 設定
    migrations/   # DBマイグレーションSQL (drizzle-kit generate で生成)
  docs/           # 設計資料
```

---

## ライセンス

Apache License 2.0
