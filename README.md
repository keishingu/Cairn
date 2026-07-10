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

# 3.5 レート制限で使う Upstash Redis を設定
# apps/web/.env.local の UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN に投入する
# 未設定のままだと webview handoff / 招待作成 / upload-url / Google Calendar 連携は 503 になる

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
変更になった場合は `supabase status` で確認できる。なお、レート制限対象 API をローカルで使う場合は別途 Upstash Redis の REST URL / token も必要。

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

WebView で Web 版（`apps/web`）を表示するラッパー + ネイティブチャット。Web 側の開発サーバーが必要なため、まず上記の Web 環境を起動しておく。

開発は **expo-dev-client（単体アプリとしてインストールされる開発ビルド）** を基本とする。Expo Go は不要。

```bash
# 1〜5（Supabase起動・環境変数コピー・マイグレーション・pnpm dev）はWebと共通

# 6. モバイル用環境変数をコピー（ANON_KEY のみ設定。IP の書き換えは不要）
cp apps/mobile/.env.local.example apps/mobile/.env.local

# 7. 開発クライアントをビルドして起動
cd apps/mobile
pnpm ios       # iOS シミュレータ（初回はネイティブビルドが走る）
pnpm android   # Android エミュレータ

# 2回目以降（ネイティブ依存に変更がなければ）は Metro 起動だけで接続できる
pnpm dev
```

ネイティブビルドのやり直しが必要なのは、ネイティブモジュールの追加や `app.json` のネイティブ設定変更時のみ。JS の変更は Metro のホットリロードで反映される。

`expo run:ios` / `run:android` が生成する `ios/` `android/` ディレクトリは `app.json` から再生成できる成果物のため、コミットしない（`apps/mobile/.gitignore` で除外済み）。また、ネイティブプロジェクトが存在すると runtime version のポリシー（`appVersion` 等）が使えないため、`app.json` の `runtimeVersion` は固定文字列で管理する。**ネイティブモジュールを追加・更新したら `runtimeVersion` を手動で上げる**こと（古いネイティブビルドに非互換な EAS Update が配信されるのを防ぐため）。

実機で使う場合は `pnpm dev` で表示される QR コードを読み込む（開発クライアントがインストール済みであること）。Xcode / Android Studio がないメンバーには、EAS の development プロファイル（`eas build --profile development`）でビルド済み開発クライアントを配布できる（iOS シミュレータ向けビルドにも対応済み）。

> **接続先 URL は自動導出される（IP の手動設定は不要）**
>
> ネイティブ側の Supabase / API の接続先は、`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_API_BASE_URL` が未設定なら **Metro の接続先ホストから自動導出される**（`apps/mobile/lib/env.ts`）。シミュレータでは `localhost`、実機では開発マシンの LAN IP、Android エミュレータでは `10.0.2.2` に自動的になるため、Wi-Fi 切替で IP が変わっても追従する。検証環境など固定 URL に向けたい場合のみ `.env.local` で明示的に設定する。

> **実機で WebView 画面を使う場合のみ `pnpm setup:mobile-lan` が必要**
>
> `mobile-handoff` ページは WebView（端末側）でブラウザとして動く Next.js の JS バンドルなので、そこに埋め込まれた `NEXT_PUBLIC_SUPABASE_URL`（`apps/web/.env.local`）が `127.0.0.1` のままだと端末から見て「自分自身」にアクセスしようとして繋がらない。
> ログイン後に画面が真っ白になり、しばらくしてネイティブのログイン画面に戻されてしまう場合は、これが原因の可能性が高い（ミドルウェアの `getUser()` がタイムアウトして `/auth/login` にリダイレクトされ、それを WebView 側が検知してネイティブもサインアウトしてしまう）。`pnpm setup:mobile-lan` を実行すると LAN IP を自動検出して `apps/web/.env.local` を書き換える（Wi-Fi 切替時も再実行で追従）。

> **画面が真っ白になる場合は `allowedDevOrigins` も疑う**
>
> Next.js 15 の開発サーバーは、デフォルトで `localhost` 以外のオリジンから `/_next/*` への CORS リクエストをブロックする。LAN IP 経由で WebView からアクセスすると JS バンドルの読み込みがブロックされ、React がハイドレーションされず画面が真っ白になる。
> `apps/web/next.config.ts` で開発機の LAN IP を自動検出して `allowedDevOrigins` に設定済みのため、通常は対応不要。ターミナルに `Cross origin request detected from <IP> to /_next/* resource` という警告が出ている場合はこの設定が効いていないので確認すること。

---

## モバイルプレビュー（EAS Update）

`apps/mobile` に変更がある PR では、CI（`.github/workflows/mobile-preview.yml`）が EAS Update を発行し、PR に QR コード付きのプレビューリンクをコメントする。Expo Go でスキャンするだけで、ローカル環境を起動せずに実機確認ができる。

- 対象パスを `apps/mobile/**` に限定し、無関係な変更では発行しない（EAS の無料枠を消費しないため）
- プレビューが見にいく Web / Supabase は固定の検証用環境（Vercel の固定プレビューデプロイ + 共有の Supabase プレビュー DB）を指す。ローカル開発用の LAN IP 設定とは無関係

### 初回セットアップ（リポジトリ管理者）

1. Expo アカウントを作成し、`apps/mobile` で `eas init` を実行してプロジェクトを作成（`EXPO_PUBLIC_EAS_PROJECT_ID` が発行される）
2. `eas update:configure` を実行し、`app.json` に `updates` / `runtimeVersion` の設定を追加する
3. Expo のアクセストークンを発行し、GitHub リポジトリの Secrets に `EXPO_TOKEN` として登録する
4. Vercel で `apps/web` の固定プレビュー環境を用意し、共有 Supabase プレビュー DB を指す環境変数を設定する（URL は取得済みの `oss-cairn.com` のサブドメインを割り当てる想定）
5. GitHub リポジトリの Variables / Secrets に以下を登録する

| 種別 | 名前 | 値 |
|---|---|---|
| Variable | `MOBILE_PREVIEW_EAS_PROJECT_ID` | `eas init` で発行されたプロジェクト ID |
| Variable | `MOBILE_PREVIEW_API_BASE_URL` | Vercel 固定プレビューの URL |
| Variable | `MOBILE_PREVIEW_SUPABASE_URL` | 共有 Supabase プレビュー DB の URL |
| Secret | `MOBILE_PREVIEW_SUPABASE_ANON_KEY` | 共有 Supabase プレビュー DB の anon key |
| Secret | `EXPO_TOKEN` | Expo のアクセストークン |

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
    desktop/
      electron/   # Electron デスクトップアプリ (リモートシェル)
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

## Electron デスクトップアプリ

`apps/desktop/electron/` に、リモートの Next.js デプロイ先 URL を読み込むだけの薄い Electron シェルがある。
ローカルに静的ファイルはバンドルせず、常にネット経由で `apps/web` のデプロイ先に接続する（オフライン非対応）。

Chromium ベースのため `PushManager` / Web Push API をフルサポートしており、既存の Web Push 通知機能（VAPID + Service Worker）をそのまま利用できる。

### 接続先 URL とアイコン（環境別）

| 環境 | URL | アイコン |
|---|---|---|
| prod | `https://oss-cairn.com` | `icon-emerald-dark-512.png`（濃紺 + 緑） |
| dev | `https://develop.oss-cairn.com` | `icon-blue-light-512.png`（白 + 青） |

### コマンド

```bash
# 開発起動（dev URL を読み込み、DevTools を自動オープン）
pnpm desktop:electron:dev

# ビルド
pnpm desktop:electron:build:prod   # prod URL + emerald-dark アイコン
pnpm desktop:electron:build:dev    # dev URL + blue-light アイコン
```

### アイコンの再生成

`apps/web/public/` のソース PNG から `.icns` / `.ico` / `.png` 一式を `apps/desktop/electron/resources/icons/{prod,dev}/` に生成する。

```bash
cd apps/desktop/electron
pnpm generate-icons
```

### Web Push の動作確認

1. `pnpm desktop:electron:dev` でアプリを起動
2. DevTools のコンソールで `'serviceWorker' in navigator && 'PushManager' in window` が `true` になることを確認
3. 通知パネル（ベルアイコン）の ON/OFF トグルを操作し、ブラウザの通知許可ダイアログが表示されることを確認

---

## Expo モバイルアプリ

expoビルド用ブランチ: develop

## ライセンス

Apache License 2.0
