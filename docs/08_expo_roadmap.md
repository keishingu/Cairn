# Expo ネイティブアプリ化 ロードマップ

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

選択肢：

| 方式 | 内容 | タイミング |
|---|---|---|
| **Supabase クライアント直接** | Expo から Supabase JS SDK を直接使用。DB アクセスは RLS で制御 | Expo 開始時点の暫定策 |
| **Hono API 分離** | `apps/api/` に Hono サーバーを追加。Bearer トークン認証。Expo・Web 共用 | Phase 2 で正式対応 |

`packages/core` にビジネスロジックを寄せているのは、この Hono 移行を見越した設計。

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
| 2-1 | `apps/api/` に Hono サーバーを追加 |
| 2-2 | Bearer トークン認証ミドルウェア（Supabase JWT 検証） |
| 2-3 | 主要エンドポイントを Hono に移植（channels / messages / projects / tasks） |
| 2-4 | `packages/core` の UseCase を Hono ハンドラから呼び出す |

### Phase 2-B（Expo アプリ）

| ステップ | 内容 | 依存 |
|---|---|---|
| 2-5 | `apps/mobile/` 新設、Expo Router セットアップ | 2-1〜2-4 |
| 2-6 | Supabase Auth 統合（SecureStore） | 2-5 |
| 2-7 | プロジェクト一覧・詳細画面 | 2-5, 2-6 |
| 2-8 | チャット画面（TanStack Query ポーリング） | 2-5, 2-6 |
| 2-9 | タスク画面 | 2-5, 2-6 |
| 2-10 | Expo Push Notifications 統合 | 1-1〜1-5, 2-6 |
| 2-11 | 通知一覧画面 | 2-10 |
| 2-12 | 写真アップロード・ギャラリー（expo-image-picker） | 2-5, 2-6 |

### Phase 3（仕上げ・マイルストーン等）

- マイルストーン機能（`channels` 拡張）→ `docs/07_notifications_and_unread.md` 参照
- Supabase Realtime 導入（ポーリングからの移行）
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
