# Expo ネイティブアプリ化 ロードマップ

> **ステータス**: 設計時スナップショット（作成: 2026-05-27 / 最終更新: 2026-05-29）
> 作成時点のロードマップ。一部は実施済み（`apps/mobile` の WebView ラッパー等、[`docs/archive/prompts/`](./archive/prompts/) の Phase 2-B 参照）。進捗はコードを正とする。
> **現状の完成定義・残作業は [`mobile-native-completion.md`](./mobile-native-completion.md) を正とする**。

---

## 1. 現状の整理

### モバイルブラウザ版（現在）

現在の「モバイル対応」は **Next.js + モバイルブラウザ** での動作を前提とする。

```
middleware.ts
  UA を判定 → x-device: mobile ヘッダーをセット
    ↓
app/(app)/layout.tsx
  x-device === 'mobile' → MobileShell をレンダリング
                        → PCShell はレンダリングしない
```

`MobileShell` は SPA 風のフルスクリーン UI（ボトムナビ 5 タブ）を提供しており、コンポーネント側では `isMobile` prop でレイアウト・密度を切り替えている。

### Expo アプリで「そのまま使える」もの

| レイヤー | 共用可否 | 理由 |
|---|---|---|
| `packages/core` ドメインロジック | ✅ | React / Next.js 依存なし |
| `packages/shared` 型・Zod スキーマ | ✅ | 純粋な TypeScript |
| `packages/db` Drizzle スキーマ | ✅ | 型定義として参照可能 |
| API DTOs（Route Handler の型） | ✅ | 型のみ import |
| TanStack Query のフック（ロジック部） | ⚠️ | ほぼそのまま動くが `fetch` の base URL 調整が必要 |
| UI コンポーネント（HTML / CSS） | ❌ | React Native は DOM を持たない |
| Next.js 固有フック（useRouter 等） | ❌ | Expo Router の API に差し替える |
| CSS 変数 / Tailwind | ❌ | React Native はスタイルシートが別体系 |
| Web Push / Service Worker | ❌ | Expo Push Notifications に置き換える |

---

## 2. Expo 移行の前提条件

Expo アプリは Next.js サーバーを直接叩けないため、以下の整備が先に必要。

### 2-A. API 層の整備（最重要）

Next.js Route Handlers はブラウザ向けに Cookie 認証を前提としている。Expo から叩くには **Bearer トークン認証に対応した API エンドポイント**が必要。

**採用方針：Bearer トークンを Next.js Route Handlers に追加（Hono 移行は行わない）**

`getAuthContext()` を拡張し、`Authorization: Bearer <token>` ヘッダを優先して検証し、なければ Cookie にフォールバックする構造にする。Web クライアントも同じエンドポイントを Bearer トークンで呼ぶよう統一する。

| 比較軸 | Bearer on Next.js（採用） | Hono 分離 |
|---|---|---|
| 移行コスト | 小（getAuthContext + fetcher のみ変更） | 大（全ルートの移植） |
| デプロイ変更 | なし（Vercel の Next.js のまま） | 不要（Next.js catch-all 内で動かせる）が構成が増える |
| Expo 対応 | ✅ | ✅ |
| 将来の独立スケール | ❌ | ✅ |

> **将来の Hono 移行トリガー**：「API を Next.js とは別サービスにスケールしたい」「Vercel 以外にデプロイしたい」という要件が出た時点で改めて検討する。Bearer 対応は Hono 移行後もそのまま使えるため、今の投資は無駄にならない。

### 2-B. 通知・未読基盤の整備

Expo の主要価値である Push 通知を機能させるために、以下が先に完成している必要がある。

- `channel_read_states` テーブル（→ `docs/07_notifications_and_unread.md`）
- `notifications` テーブル
- `push_subscriptions` テーブル（Web Push との共用テーブル）
- Inngest 通知生成ジョブ

### 2-C. 認証フローの Expo 対応

Supabase Auth は Expo 向け SDK（`@supabase/supabase-js` + `expo-secure-store`）を公式サポートしている。

```ts
// apps/mobile での Supabase クライアント初期化例
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStore,       // トークンをセキュアに永続化
    autoRefreshToken: true,
    detectSessionInUrl: false,  // Web の OAuth コールバックは不要
  },
})
```

---

## 3. `apps/mobile/` の構成

```
apps/mobile/
  app/                     Expo Router のルート（Next.js の app/ 相当）
    _layout.tsx            ルートレイアウト（Supabase Provider, TanStack Query Provider）
    (auth)/
      login.tsx
      signup.tsx
    (app)/
      _layout.tsx          ボトムタブナビゲーション
      projects/
        index.tsx          プロジェクト一覧
        [id].tsx           プロジェクト詳細
      chats/
        index.tsx          チャンネル一覧
        [channelId].tsx    チャット画面
      tasks/
        index.tsx          マイタスク
      ai/
        index.tsx          AI アシスタント
      notifications/
        index.tsx          通知一覧
  components/              React Native UI コンポーネント
    primitives/            Icon, Avatar 等（RN 版）
    chat/
    projects/
    tasks/
  lib/                     API クライアント、フック
    supabase.ts
    query-client.ts
  assets/
```

### ナビゲーション対応表

現在の `MobileNav`（5 タブ）を Expo Router のタブナビゲーションに対応させる。

| モバイルブラウザ版タブ | Expo Router タブ |
|---|---|
| プロジェクト | `(app)/projects/` |
| チャット | `(app)/chats/` |
| タスク | `(app)/tasks/` |
| AI | `(app)/ai/` |
| メニュー（ファイル / ギャラリー / メンバー / 設定） | ドロワーまたはモーダル |

---

## 4. Push 通知の統合

### フロー

```
Expo アプリ起動
  ↓
expo-notifications で Push トークン取得
  ↓
POST /api/push-subscriptions
  { device_type: 'expo', expo_token: '...' }
  ↓
push_subscriptions テーブルに保存
```

通知送信側（Inngest ジョブ）は `device_type` で送信先を切り替える：

```ts
// packages/core/src/ports/notification-service.ts
export interface NotificationService {
  sendPush(params: {
    userIds: string[]
    title: string
    body: string
    data?: Record<string, string>
  }): Promise<void>
}

// apps/web の実装: device_type === 'web'  → web-push
//                  device_type === 'expo' → Expo Push API
```

### 必要なパーミッション（iOS）

```ts
import * as Notifications from 'expo-notifications'

const { status } = await Notifications.requestPermissionsAsync()
```

`app.json` の `expo.ios.infoPlist` に `NSUserNotificationsUsageDescription` が必要。

---

## 5. 実装ロードマップ

### Phase 1（Web 版で完結、Expo の前提条件を固める）

| ステップ | 内容 |
|---|---|
| 1-1 | `channel_read_states` + `notifications` + `push_subscriptions` テーブル追加 |
| 1-2 | 通知生成 Inngest ジョブ（mention / task / file） |
| 1-3 | アプリ内通知 UI の実データ化（`PageNotifications`） |
| 1-4 | チャンネルサイドバー未読バッジの実データ化 |
| 1-5 | Web Push 実装（Service Worker + web-push） |

### Phase 2-A（API 層の整備）

| ステップ | 内容 |
|---|---|
| 2-1 | `getAuthContext()` を Bearer トークン対応に拡張（`Authorization` ヘッダ優先、Cookie フォールバック） |
| 2-2 | `fetchWithAuth()` ユーティリティを作成し、全 TanStack Query fetcher を Bearer ヘッダ付きに統一 |
| 2-3 | Expo での Supabase Auth 初期化（`expo-secure-store` によるトークン永続化） |

### Phase 2-B（Expo アプリ）

**方針: チャット以外は WebView で Web アプリを表示。チャットのみネイティブ実装。**

| ステップ | 内容 | 状態 |
|---|---|---|
| 2-1 | `apps/mobile/` 新設、Expo Router・Auth・API クライアント | ✅ 完了（PR #68） |
| 2-2 | ネイティブ画面実装（projects / chats / tasks / notifications） | ✅ 完了（PR #68） |
| 2-3 | Expo Push Notifications 統合 | ✅ 完了（PR #68） |
| 2-4 | WebView 化（projects / tasks / notifications）+ セッション橋渡し | ✅ 完了（認証は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md) のワンタイムトークン方式） |
| 2-5 | ネイティブチャット強化（オフライン送信キュー・バックグラウンドアップロード） | 未着手 → [`docs/archive/prompts/phase2b-5-native-chat.md`](./archive/prompts/phase2b-5-native-chat.md) |

### Phase 3（仕上げ・マイルストーン等）

- マイルストーン機能（`channels` 拡張）→ `docs/07_notifications_and_unread.md` 参照
- Supabase Realtime 導入（ポーリングからの移行）→ ✅ Web 側は実施済み（[`notification-ux-redesign.md`](./notification-ux-redesign.md) Phase 2。Broadcast from Database 方式）
- App Store / Google Play リリース対応（`app.json`, EAS Build）

---

## 6. 技術選定メモ

| 項目 | 採用 | 理由 |
|---|---|---|
| ナビゲーション | Expo Router | File-based routing。Next.js との思想が近く学習コストが低い |
| データフェッチ | TanStack Query | Web 版と同じ。React Native でも動作する |
| 認証トークン永続化 | expo-secure-store | iOS Keychain / Android Keystore に安全に保存 |
| スタイリング | React Native StyleSheet / NativeWind | CSS 変数は使えないため別管理 |
| Push 通知 | expo-notifications | EAS でトークン管理、iOS/Android 統一 API |
| ビルド | EAS Build | Expo の managed workflow でクラウドビルド |

---

## 7. 今後の課題: 環境定義の一元化（app.config.ts 化）

> **2026-07-05 実施済み**: `app.config.ts` 化（APP_VARIANT 分岐）と EAS production プロファイルは導入済み。現行の運用は [`mobile-store-release.md`](./mobile-store-release.md) を正とする。

現状の環境管理は以下の構成になっている:

- `app.json`（静的）でアプリ設定を管理
- 接続先 URL は `EXPO_PUBLIC_*` 環境変数 + 未設定時の自動導出（`lib/env.ts` が Metro の接続先ホストから導出）
- CI（mobile-preview.yml）は EAS Update 発行時に環境変数で検証環境の URL を注入

ストアリリース対応（Phase 3）に着手する際、以下の構成へ移行する:

### 移行内容

1. **`app.json` → `app.config.ts` 化**
   - `APP_VARIANT` 環境変数（`development` / `preview` / `production`）で bundle ID・アプリ名・アイコンを分岐
   - 同一端末に開発版・プレビュー版・本番版を共存インストールできるようにする（例: `com.oss-cairn.dev` / `com.oss-cairn.preview` / `com.oss-cairn`）
   - `eas.json` の各ビルドプロファイルに `env: { APP_VARIANT: ... }` を追加

2. **環境定義モジュール（`lib/environment.ts`）の導入**
   - `expo-updates` の `Updates.channel` を見て dev / preview / production を実行時判定する（`isDev` / `isPreview` / `isProd`）
   - API・Supabase・Web の接続先 URL を環境ごとに一元定義し、`lib/env.ts` の自動導出は dev 環境のフォールバックとして統合する
   - Sentry 等の計測系を導入する場合のサンプリング設定もここに集約する

### 移行のトリガー

- App Store / Google Play への提出準備を始めたとき
- もしくは preview / production の接続先が CI の環境変数注入だけでは管理しきれなくなったとき（環境数の増加・チャンネル分岐の複雑化）

それまでは現状の「環境変数 + 自動導出」で十分なため、先行して導入しない。
