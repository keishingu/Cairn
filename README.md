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

ブラウザで http://localhost:3128 を開く。

> **初回のみ**: `/auth/signup` でアカウントを作成する。ローカル Supabase ではメール確認が不要なため、登録直後にダッシュボードへ遷移する。

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

## モバイル（Expo）

Expo Go アプリ内の WebView で Web 版（`apps/web`）を表示するラッパー。Web 側の開発サーバーが必要なため、まず上記の Web 環境を起動しておく。

```bash
# 1〜5（Supabase起動・環境変数コピー・マイグレーション・pnpm dev）はWebと共通

# 6. モバイル用環境変数をコピーして編集
cp apps/mobile/.env.local.example apps/mobile/.env.local
```

実機・シミュレータ問わず Expo Go で動作確認する場合は、`apps/mobile/.env.local` と `apps/web/.env.local` の両方で `localhost` / `127.0.0.1` を PC の LAN IP に書き換える必要がある。WebView 内 JS は端末上で実行されるため、`127.0.0.1` は端末自身を指してしまう。

```bash
# .env.local.example からコピー後、LAN IP を自動検出して両方の .env.local を書き換える
pnpm setup:mobile-lan
```

> **`apps/web/.env.local` の `NEXT_PUBLIC_SUPABASE_URL` の変更を忘れやすいので注意**
>
> `mobile-handoff` ページは WebView（端末側）でブラウザとして動く Next.js の JS バンドルなので、そこに埋め込まれた `NEXT_PUBLIC_SUPABASE_URL` が `127.0.0.1` のままだと端末から見て「自分自身」にアクセスしようとして繋がらない。
> ログイン後に画面が真っ白になり、しばらくしてネイティブのログイン画面に戻されてしまう場合は、これが原因の可能性が高い（ミドルウェアの `getUser()` がタイムアウトして `/auth/login` にリダイレクトされ、それを WebView 側が検知してネイティブもサインアウトしてしまう）。`pnpm setup:mobile-lan` を使えば両方まとめて書き換わるので忘れにくい。

> **画面が真っ白になる場合は `allowedDevOrigins` も疑う**
>
> Next.js 15 の開発サーバーは、デフォルトで `localhost` 以外のオリジンから `/_next/*` への CORS リクエストをブロックする。LAN IP 経由で WebView からアクセスすると JS バンドルの読み込みがブロックされ、React がハイドレーションされず画面が真っ白になる。
> `apps/web/next.config.ts` で開発機の LAN IP を自動検出して `allowedDevOrigins` に設定済みのため、通常は対応不要。ターミナルに `Cross origin request detected from <IP> to /_next/* resource` という警告が出ている場合はこの設定が効いていないので確認すること。

```bash
# 7. Expo 開発サーバー起動
cd apps/mobile
pnpm start
```

表示された QR コードを Expo Go アプリで読み込む。

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

## Web Push 通知（VAPID）

メンション・タスク割り当て時にブラウザへプッシュ通知を送る機能。VAPID キーが未設定の場合は通知なしで動作する。

### キーの生成

```bash
npx web-push generate-vapid-keys
```

出力例：
```
Public Key: BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxA
Private Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 環境変数

| 変数名 | 説明 |
|---|---|
| `VAPID_PUBLIC_KEY` | 生成した公開鍵 |
| `VAPID_PRIVATE_KEY` | 生成した秘密鍵（機密情報） |
| `VAPID_SUBJECT` | 管理者連絡先。`mailto:admin@example.com` 形式推奨 |

**ローカル**: `apps/web/.env.local` に追記  
**Vercel**: Dashboard → Project → Settings → Environment Variables で追加（`VAPID_PRIVATE_KEY` は Sensitive にチェック）

> **注意**: VAPID キーを変更すると既存の全購読が無効になる。生成は一度だけ行い、本番・Preview で同じキーを使い回す。

### ローカルでのテスト

1. `.env.local` にキーを設定して dev サーバーを再起動
2. 通知パネル（ベルアイコン）右上の「ON」ボタンを押してブラウザ許可を与える
3. Supabase Studio（`http://localhost:54323`）の `push_subscriptions` テーブルに行が追加されることを確認
4. Inngest Dev UI（`http://localhost:8288`）から `message/created` イベントを送信してプッシュ通知を確認

```json
{
  "name": "message/created",
  "data": {
    "messageId": "00000000-0000-0000-0000-000000000001",
    "channelId": "<チャンネルUUID>",
    "workspaceId": "<ワークスペースUUID>",
    "senderId": "<別ユーザーのUUID>",
    "senderName": "テストユーザー",
    "content": "@<自分の表示名> テスト",
    "attachmentFileIds": []
  }
}
```

> **補足**: ブラウザのタブがフォアグラウンドにある間は OS 通知が出ない（仕様）。別タブで試すこと。

---



アクセントカラー（7色）× テーマ（ライト/ダーク）の組み合わせで PWA アイコンを事前生成している。
設定画面でカラーやテーマを変えると、ホーム画面アイコンに自動反映される。

### アイコン生成

```bash
node scripts/generate-icons.mjs
```

`apps/web/public/` に以下のファイルを生成する:

| ファイル名パターン | 用途 |
|---|---|
| `icon-{color}-{theme}-192.png` | Android manifest (192×192) |
| `icon-{color}-{theme}-512.png` | Android manifest (512×512) |
| `apple-touch-icon-{color}-{theme}.png` | iOS ホーム画面アイコン (180×180) |
| `icon-192.png` / `icon-512.png` / `apple-touch-icon.png` | cookie 未設定時のフォールバック |

`{color}`: `emerald` / `blue` / `violet` / `rose` / `pink` / `amber` / `cyan`  
`{theme}`: `light` / `dark`

### アクセントカラーを追加する手順

1. `apps/web/src/lib/accent-presets.ts` の `ACCENT_PRESETS` 配列に新しいプリセットを追加する
2. `scripts/generate-icons.mjs` の `ACCENT_PRESETS` 配列にも同じ `id` と `swatch` 色を追加する
3. `node scripts/generate-icons.mjs` を実行して PNG を生成する
4. 生成されたファイルをコミットする

---

## ライセンス

Apache License 2.0
