# Cairn

山岳部の山行計画を起点とした、プロジェクト管理・チャット・カレンダー・ファイル管理・ギャラリー・AIアシスタントを統合したコラボレーションアプリケーション。

プロダクト仕様は [`docs/`](./docs) を参照。

---

## セットアップ

### 必要な環境

- Node.js 20+
- pnpm 9+

### インストール

```bash
pnpm install
```

### 環境変数

```bash
cp .env.example apps/web/.env.local
```

`.env.local` を開いて各値を設定する。

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
pnpm db:generate  # スキーマからマイグレーションファイル生成
pnpm db:push      # DBに直接反映 (開発用)
pnpm db:studio    # Drizzle Studio 起動
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
  docs/           # 設計資料
```

---

## ライセンス

Apache License 2.0
