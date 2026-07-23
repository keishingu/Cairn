## 全般

- ユーザーの指示は曖昧なことがあるので、疑問点があれば質問すること
- 開発手順・アーキテクチャ・技術判断に変更があった場合は、README.md と CLAUDE.md を適宜更新すること
- **本リポジトリはパブリック**。非公開の他プロジェクト名・顧客名などの固有名詞を、コード・ドキュメント・コミットメッセージ・PR・issue に含めない。比較や経緯に触れる必要がある場合は「別プロジェクト」等に言い換える

## リポジトリ構成

pnpm Workspace + Turborepo のモノレポ。

```
apps/web/          Next.js 15 (メインWebアプリ)
apps/mobile/       Expo (WebView ラッパー + ネイティブチャット + Push通知)
apps/desktop/      Electron (Web版を表示するデスクトップラッパー)
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
- チャット・通知・未読の同期は **Supabase Realtime（Broadcast from Database）** で配信。DB トリガー + `realtime.broadcast_changes()` → `RealtimeProvider` が該当クエリを invalidate → REST 再取得（ポーリング・フォールバックなし）。**postgres_changes は本プロジェクトの Realtime では動作しないため使用しない**。詳細は [`docs/notification-ux-redesign.md`](docs/notification-ux-redesign.md) の Phase 2
- **AI**: Vercel AI SDK + OpenAI API (gpt-5 / gpt-5-mini)
- **非同期ジョブ**: Inngest

## アーキテクチャ方針

- `packages/core` に業務ロジックを集約し、DB・フレームワークから分離する
- ポートはインターフェース定義のみ。実装は `apps/web` 側に置く
- CQRS をコード構造として軽量に採用（Command / Query を分けて命名する）
- Write DB / Read DB は分離しない

## ローカル開発環境

- **Supabase CLI + Docker** を使う。`supabase start` で PostgreSQL / Auth / Storage / Realtime / Studio が一括起動する
- 環境変数は `apps/web/.env.local.example` をコピーして使う。`supabase start` のデフォルトキーが事前入力済み
- DBスキーマは `packages/db/src/schema/` で管理（Drizzle が正）→ `pnpm db:generate` で `supabase/migrations/` にSQLを生成 → `supabase migration up` でローカルに差分適用（データを保持したまま未適用マイグレーションだけ実行）。新規 migration ファイル名は `packages/db/drizzle.config.ts` の `migrations.prefix = 'timestamp'` で timestamp 方式に統一する
- **ブランチ切り替え後は `supabase migration up` を実行する**。未適用マイグレーションがあると enum 不一致や Realtime 認可ポリシー欠如などで API が 500・Realtime が接続不能になるが、原因がマイグレーション未適用だと気づきにくい
- `supabase db reset` はデータを全削除して再構築するため、CI や初回セットアップ専用

起動順序:

```bash
supabase start
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```

- **通知・AIインデックスは Inngest ジョブ経由**。ローカルで Inngest dev server を起動していないと、メンション・DM・ファイルの通知が**サイレントに生成されない**（API は `inngest.send()` 失敗を warn ログに残すのみ）。通知周りを動作確認する際は Inngest dev server を併せて起動すること

## 決定済みの技術判断

- **DM と AI PMO は環境別 feature flag でリリースを制御する**: `packages/shared/src/config/feature-flags.ts` の `FEATURE_FLAGS` を Web・API・Expo で共有する。`VERCEL_ENV === 'production'` のときだけ `dm` / `aiPmo` を `false`、それ以外では `true` とする。Productionへ公開する際はこの条件を変更して再ビルド・再リリースする。背景は [`docs/telecom-business-filing-research.md`](docs/telecom-business-filing-research.md)

- **Web のプロダクト分析は production 限定の PostHog**: Vercel Production のみに `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` を設定し、環境変数がある場合だけ初期化する。ページビューは History API の変化を自動捕捉し、認証後は Supabase の user ID を distinct ID として `identify`、サインアウト時は `reset` する。Feature Flag は市場投入判断による機能公開制御に使い、インフラ接続の環境差には使わない
- **tsconfig の extends は相対パス**で書く（`../../packages/config/tsconfig/base.json`）
  - Vite/Vitest の `tsconfck` が workspace パッケージ参照を解決できないため
- **AIモデルは OpenAI**（gpt-5 / gpt-5-mini）。Claude は使用しない
- **Mobile (Expo) は `apps/mobile/`**: チャット以外は WebView で Web 版を表示する方針。ネイティブ化のロードマップは [`docs/08_expo_roadmap.md`](docs/08_expo_roadmap.md) を参照
  - 開発は expo-dev-client を使う。`pnpm ios` / `pnpm android` でローカルビルド（単体アプリとしてインストール）、2回目以降は `pnpm dev` で Metro 起動のみ
  - ネイティブ側の接続先 URL は `EXPO_PUBLIC_*` 未設定時に Metro の接続先ホストから自動導出する（`apps/mobile/lib/env.ts`）。シミュレータ・実機・Android エミュレータで IP の手動設定は不要
  - PR の Mobile Preview は、Vercel Deployment Protection を避けるため初回から `https://develop.oss-cairn.com` を Web / API 接続先にする。この URL と共有 Supabase Preview 設定を EAS の `preview` 環境へ同期し、`eas update --environment preview` で Development Build 向けに配信する（`.github/workflows/mobile-preview.yml`）。同一 PR の古い実行はキャンセルし、異なる PR は EAS 同期直前の FIFO ゲートで直列化する
  - EAS Build profile は `apps/mobile/eas.json` で `development` / `preview` / `production` の同名 EAS Environment へ明示的に対応づける。ローカル `.env.local` をクラウドビルドや EAS Update の接続先として使用しない
  - 実機で WebView 画面を使う場合のみ `pnpm setup:mobile-lan` で `apps/web/.env.local` の `NEXT_PUBLIC_SUPABASE_URL` を LAN IP に書き換える
  - **Expo の共通ヘッダーと通知スライドインは React Native が所有する**。WebView モードでは Web の `MobileHeader` を描画せず、`native-header` bridge でタイトル・サブタイトル・戻る可否を Expo へ通知する。Web 固有の右側アクションだけは WebView 内のコンテンツツールバーとして残す
  - **テーマとハイライトカラーは `profiles.theme` / `profiles.accent_id` が共有元**。Web の `next-themes` / localStorage は即時描画用キャッシュに留め、設定変更時は `PATCH /api/me` へ保存する。設定 WebView は `appearance-changed` を React Native bridge へ通知し、Expo は `/api/me` と前面復帰時の再取得で別端末の変更にも追従する
  - ネイティブチャットも Web と同じ private Realtime Broadcast（`user:{userId}` / `channel:{channelId}`）で更新し、ポーリングは使わない
  - **ネイティブの本文・返信送信は必ずオフラインキューを経由する**。初回POSTより前にユーザー別AsyncStorageへ保存し、保存完了後に即時送信、失敗時は8秒間隔・前面復帰時に自動再送する。クライアント生成UUIDを `messages.id` としてAPIへ渡して再送を冪等化し、通信障害時は後続送信を止めて順序を維持する。完全オフラインで選択したローカル添付ファイルの後送は未対応
  - **Google ログインはネイティブ実装**: Web のリダイレクト方式は使えないため、`expo-web-browser` で認可コードを受け取り Supabase の PKCE フロー（`exchangeCodeForSession`）で交換する（`apps/mobile/lib/oauth.ts`）。redirect 先はアプリスキーム `cairn://auth/callback`。**Supabase の許可リストに登録が必要**（ローカルは `supabase/config.toml` の `additional_redirect_urls`、本番は Supabase ダッシュボードの Redirect URLs）。初回ログイン時も `/api/auth/setup` を呼んで profiles を作成する
- **UA ベースのデバイス出し分け**: middleware で `x-device` ヘッダーをセットし、`app/(app)/layout.tsx` で PC シェル / モバイルシェルを切り替える。レスポンシブ CSS は使わない
- **プロジェクトビューは localStorage で管理**: 旧 `/calendar` `/kanban` は Server Component で `/projects` にリダイレクト済み。ビュー切替（一覧 / カレンダー / カンバン）はURLパラメータを使わず localStorage のみで永続化（`STORAGE_KEYS.projects_view_pc` / `STORAGE_KEYS.projects_view_mob`）。`/projects/[id]` はプロジェクト詳細（現在は `/projects?open={id}` にリダイレクト）
- **設定セクションは URL 駆動**: 設定の各セクションは `/settings/[section]`（例 `/settings/account` `/settings/integrations`）に対応する。セクション定義（一覧・ラベル・アイコン）とメインカラム本体は `apps/web/src/components/app/pages/settings.tsx` に集約し、`SETTINGS_NAV_GROUPS` / `SettingsSectionContent` を PC とモバイルで共有する。PC はサイドバー + メインカラム、モバイルは設定一覧（`MobileSettings`）→ タップで `/settings/[section]` に遷移し同じメインカラムを全画面表示（`MobileSettingsDetail`）。`/settings` 単体は PC で `account`、モバイルで一覧を表示する。`?tab=` 形式は廃止
- **API 認証は Bearer トークン（Supabase JWT）**: Web クライアントも Expo も同じ Next.js Route Handlers を呼び出し、`Authorization: Bearer <token>` で認証する。`getAuthContext()` は `Authorization` ヘッダを優先し、なければ Cookie にフォールバックする。Hono API 分離は「Next.js からの独立スケール・デプロイ分離が必要」になった時点で改めて検討する
- **WebView 認証はワンタイムトークンハンドオフ方式**: ネイティブ（Expo）の `refresh_token` を WebView に渡して `setSession()` するのは禁止。同一 refresh_token を 2 クライアントが共有すると rotation と衝突してセッションが突然失効する。ネイティブは `POST /api/auth/webview-handoff` で本人の使い捨て magiclink（`hashed_token`）を発行させ、WebView 側は `verifyOtp` で独立したセッションを確立する。詳細は [`docs/mobile-webview-auth-handoff.md`](docs/mobile-webview-auth-handoff.md)
- **メール機能はアプリが持たない**: ログイン確認・パスワードリセット等のトランザクショナルメールは Supabase Auth が管理する。招待はリンク共有（30日有効）で行い、アプリ側にメール送信ロジックは実装しない。将来的に通知メール等の要望が出た場合は Resend 等を検討する
- **権限モデルはワークスペースロールのみで決定する**（プロジェクトロールは業務上の役割であり、システム権限に影響させない）
  - `owner`: WS設定（名前・ロゴ等）変更 + admin の全権限
  - `admin`: メンバー管理・招待、プロジェクト作成・削除、ゲスト招待リンク発行 + member の全権限
  - `member`: プロジェクト編集・メンバー追加削除、日常操作（チャット・タスク・ファイル等）
  - `guest`: 参加プロジェクトのみ参照・書き込み可。プロジェクト一覧・チャンネル一覧はメンバーのみの参加プロジェクトに制限
  - 権限ヘルパーは `apps/web/src/lib/permissions.ts` に集約（`requireWorkspaceOwner` / `requireWorkspaceAdmin` / `requireWorkspaceMember`）。403 時はロールを明示した日本語メッセージを返す（例「この操作には管理者以上の権限が必要です」）。フロントは生の 401/403 を出さない
  - UI 側は `apps/web/src/hooks/use-current-user.ts` の `useWorkspacePermissions()`（`isOwner` / `isAdmin` / `isMember` / `isGuest`）で操作ボタンを disable・非表示にし、権限不足を事前に示す。サーバー側チェックは常に必須（UI ガードは UX 上の補助に過ぎない）
  - **非活性メンバー（membership_status = 'inactive'、卒業生等）は「未所属」と同等に扱う**。active membership の定義は `active_workspace_members` ビュー 1 箇所に閉じ込め、**認可目的で membership を読む処理は `apps/web/src/lib/access/membership.ts`（`getWorkspaceRole` / `require*` / `listActiveMemberIds` / `filterActiveMemberIds`）とこのビューを必ず経由する**（`permissions.ts` は同モジュールへ委譲）。`getWorkspaceRole` が active 限定のため role 参照系（`require*` / `requireProjectAccess` / `requireChannelAccess` / `canAccessFile`）は横断的に非活性を 403 で弾く。Storage RLS（chat-attachments）と Realtime の `can_access_channel` も同ビュー経由。**発言者・アップロード者・担当者など「履歴上の行為者」を表示する装飾 join だけは `workspace_members` を直接引き、非活性でも本人名義で残す**（§5: 履歴は変えない）。設計は [`docs/user-deactivation-design.md`](docs/user-deactivation-design.md)

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

- **デフォルトブランチは `develop`**。フィーチャーブランチは `develop` を起点に切り、PR も `develop` を宛先にする
- `main` は本番ブランチ。`develop` → `main` の PR で本番へ反映する（`main`・`develop` に直接コミットしない）
- ブランチ名は `feat/`, `fix/`, `refactor/` などのプレフィックスを付ける
- デプロイは Vercel の Git 連携で自動。`develop` への merge で `develop.oss-cairn.com`（環境変数は Preview と共通）、`main` への merge で `oss-cairn.com`（本番）にリリースされる。詳細は [`docs/production-deployment.md`](docs/production-deployment.md)

## コミットメッセージ

- `feat:`, `fix:`, `chore:`, `docs:` などの Conventional Commits のプレフィックスを使う
- プレフィックスのあとの件名は日本語で書く
- 件名は体言止めにする
- 何を変更したかより、なぜ変更したかを優先して書く
- どのファイルを変更したか、どのように実装したかは繰り返さない（Git の履歴に残るため）
- 推奨スタイル: `fix: XXXXのため、ZZZZを修正`
- AIエージェントがコミットする場合は、`Co-Authored-By: <エージェント名> <noreply メールアドレス>` トレーラーを付け、どのAIが対応したかをコミットに残す（例: `Co-Authored-By: Claude <noreply@anthropic.com>`）

## GitHubレビュー指摘への返信

- レビュー指摘へ返信する際は、「妥当な指摘のため、対応しました」のような汎用文だけで済ませない。
- 指摘が問題になる理由・影響と、どのように修正したかを1文で具体的に書く。
- 対応 commit がある場合は、commit hash だけでなく「コミットメッセージ + GitHubのcommitリンク」をMarkdownリンクで含める。
- AIエージェントが返信する場合は、末尾に自分のエージェント名を署名する（例: `— 🤖 Claude (Claude Code)` / `— 🤖 Codex`）。どのAIが対応したか人間が一目で分かるようにする。

## 詳細ドキュメント

ドキュメント全体の一覧と各文書のステータス（現行リファレンス / 設計時スナップショット / アーカイブ）は [`docs/README.md`](docs/README.md) を参照。**ドキュメントと実装が矛盾する場合はコードと本ファイルを正とする。**

特定の作業時に参照:

- [`docs/frontend-guidelines.md`](docs/frontend-guidelines.md) — コンポーネント設計・Domain Hook パターン・UIディレクトリ構成
- [`docs/api-conventions.md`](docs/api-conventions.md) — API ルート実装規約・認証・サインアップフロー
- [`docs/notification-design.md`](docs/notification-design.md) — 通知設計（メンション・Push・アプリ内通知）
