# モバイルアプリ（Expo）の設計判断

- 状態: **現行リファレンス**（`AGENTS.md` から移した確定済みの判断）
- 関連: 配布・オフライン基盤は [`mobile-internal-distribution.md`](./mobile-internal-distribution.md)、WebView 認証は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md)、ストア提出は [`app-store-submission.md`](./app-store-submission.md)、経緯は [`archive/08_expo_roadmap.md`](./archive/08_expo_roadmap.md)

## 構成

- `apps/mobile/` はチャット以外を WebView で Web 版を表示する。チャットは `apps/mobile/app/(app)/chats/` のネイティブ実装
- **共通ヘッダーと通知スライドインは React Native が所有する**。WebView モードでは Web の `MobileHeader` を描画せず、`native-header` bridge でタイトル・サブタイトル・戻る可否を Expo へ通知する。Web 固有の右側アクションだけは WebView 内のツールバーとして残す
- **ワークスペース選択はユーザー別 AsyncStorage が共有元**。API は `X-Cairn-Workspace-Id` を Cookie より優先して active membership を再検証する。WebView ハンドオフ時は検証済み workspace ID を Cookie へ同期する
- **テーマとハイライトカラーは `profiles.theme` / `profiles.accent_id` が共有元**。Web の `next-themes` / localStorage は即時描画用キャッシュ。設定変更時は `PATCH /api/me` へ保存し、設定 WebView は `appearance-changed` を bridge へ通知、Expo は `/api/me` と前面復帰時の再取得で追従する
- ネイティブチャットも Web と同じ private Realtime Broadcast（`user:{userId}` / `channel:{channelId}`）で更新し、ポーリングは使わない

## 開発

- expo-dev-client を使う。`pnpm ios` / `pnpm android` でローカルビルド、2回目以降は `pnpm dev` で Metro 起動のみ
- ネイティブ側の接続先 URL は `EXPO_PUBLIC_*` 未設定時に Metro の接続先ホストから自動導出する（`apps/mobile/lib/env.ts`）。IP の手動設定は不要
- 実機で WebView 画面を使う場合のみ `pnpm setup:mobile-lan` で `apps/web/.env.local` の `NEXT_PUBLIC_SUPABASE_URL` を LAN IP に書き換える

## ビルド・配布

- EAS Build profile は `apps/mobile/eas.json` で `development` / `preview` / `production` の同名 EAS Environment へ明示的に対応づける。ローカル `.env.local` をクラウドビルドや EAS Update の接続先に使わない
- **Internal Distribution は `preview` profile**（Android は APK、iOS は登録済み端末向け Ad Hoc）。ローカルコマンドまたは手動の `.github/workflows/mobile-internal-build.yml` から起動し、`ios` / `all` build は `--refresh-ad-hoc-provisioning-profile` で登録済み端末を反映する。`app.config.ts` で `Cairn Dev` / `Cairn Preview` / `Cairn` の URL scheme と bundle/package ID を分離し、同一端末に共存させる
- **PR の Mobile Preview**（`.github/workflows/mobile-preview.yml`）は Vercel Deployment Protection を避けるため `https://develop.oss-cairn.com` を Web / API 接続先にする。この URL と共有 Supabase Preview 設定を EAS の `preview` 環境へ同期し、PR 固有 branch へ Development Build 用 QR を発行すると同時に `preview` channel へ OTA を配信する
  - 自動配信はモバイル関連 PR の作成時だけ。以降は権限のあるメンバーによる完全一致の `@eas update` コメントで最新 SHA を再配信する
  - 同一 PR の古い実行はキャンセルし、異なる PR は EAS 同期直前の FIFO ゲートで直列化する。Internal Distribution では最後に成功した Mobile Preview が最新版
- App Store / TestFlight は `pnpm build:production:ios` / `pnpm submit:ios:latest` / `pnpm release:testflight:ios`。手順は [`app-store-submission.md`](./app-store-submission.md)

## オフライン・送信

- **端末キャッシュ基盤は `expo-sqlite`、回線復帰検知は `expo-network`**。SQLite は WAL / foreign keys を初期化し、メッセージキャッシュ・全チャンネル検索は schema migration で追加する
- **本文・返信の送信は必ずオフラインキューを経由する**。初回 POST より前にユーザー別 AsyncStorage へ保存し、保存完了後に即時送信、失敗時は8秒間隔・前面復帰時に自動再送する。`expo-network` が明示的に圏外なら POST を抑止し、復帰イベントで即時再送する
- クライアント生成 UUID を `messages.id` として API へ渡して再送を冪等化し、通信障害時は後続送信を止めて順序を維持する。完全オフラインで選択したローカル添付ファイルの後送は未対応

## 認証

- WebView はワンタイムトークンハンドオフ方式（refresh_token 共有は禁止）。詳細は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md)
- **Google ログインはネイティブ実装**: `expo-web-browser` で認可コードを受け取り、Supabase の PKCE フロー（`exchangeCodeForSession`）で交換する（`apps/mobile/lib/oauth.ts`）。redirect 先 `cairn://auth/callback` は Supabase の許可リストに登録が必要（ローカルは `supabase/config.toml` の `additional_redirect_urls`、本番はダッシュボードの Redirect URLs）。初回ログイン時も `/api/auth/setup` で profiles を作成する
- **Apple / Google の追加ログイン手段は設定から手動連携**: 同一メールの自動紐付けに加え、設定 → アカウント → ログイン方法で `linkIdentity` により明示連携できる（Apple relay email 対応）。ローカルは `enable_manual_linking = true`、Preview / Production は Dashboard で Manual Linking を有効化する。Expo の設定 WebView は bridge（`link-apple-identity` / `link-google-identity`）経由で連携する
