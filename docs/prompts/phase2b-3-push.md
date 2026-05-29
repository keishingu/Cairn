# Phase 2-B Session 3: Expo Push Notifications

## タスク

Expo Push Notifications を実装する。
**`apps/mobile/`（Expo 側）と `apps/web/`（サーバー側）の両方**を変更する。

## 前提条件

Session 1・2 が完了済み。
`push_subscriptions` テーブルに `expo_token` カラムがある（`packages/db/src/schema/notifications.ts` 参照）。

## 参照ドキュメント

- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `packages/db/src/schema/notifications.ts` — `push_subscriptions` スキーマ
- `apps/web/src/app/api/push/subscribe/route.ts` — 現在の購読登録 API
- `apps/web/src/lib/push/send.ts` — 現在の Web Push 送信実装
- `apps/web/src/lib/inngest/functions.ts` — Push を呼び出している Inngest ジョブ

---

## 作業 1: `push_subscriptions` スキーマ変更とマイグレーション（`packages/db` + `supabase/migrations`）

現在の `endpoint` カラムは `.notNull()` で Web Push の購読 URL を前提としている。
Expo Push Token は `endpoint` とは別概念のため、カラムと制約を分離する。

### `packages/db/src/schema/notifications.ts` の変更

```ts
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    deviceType: text('device_type').notNull(), // 'web' | 'expo'
    // web: Web Push 購読 URL。expo: null
    endpoint: text('endpoint'),
    keys: jsonb('keys').$type<{ p256dh: string; auth: string }>(),
    // expo: Expo Push Token ("ExponentPushToken[...]")。web: null
    expoToken: text('expo_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres の UNIQUE は NULL を比較から除外するため、両制約は相互干渉しない
    unique('uniq_push_web').on(t.userId, t.endpoint),
    unique('uniq_push_expo').on(t.userId, t.expoToken),
    index('idx_push_subscriptions_user').on(t.userId),
  ],
)
```

### マイグレーション（`supabase/migrations/0019_push_subscriptions_expo.sql`）

> `pnpm db:generate` は Drizzle のメタが古く余分な差分が混入するため使わない。手書きで作成すること。

```sql
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_endpoint_unique";
ALTER TABLE "push_subscriptions" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "uniq_push_web"  UNIQUE("user_id", "endpoint");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "uniq_push_expo" UNIQUE("user_id", "expo_token");
```

---

## 作業 2: `push/subscribe` API を Expo 対応に拡張（`apps/web`）

`apps/web/src/app/api/push/subscribe/route.ts` のバリデーションスキーマを discriminated union に変更する。

```ts
const webSchema = z.object({
  deviceType: z.literal('web'),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

const expoSchema = z.object({
  deviceType: z.literal('expo'),
  expoToken: z.string().startsWith('ExponentPushToken['),
})

const subscribeSchema = z.discriminatedUnion('deviceType', [webSchema, expoSchema])
```

DB への insert を分岐させる:
- `deviceType: 'web'` → 既存と同じ（`endpoint` + `keys`）、conflict target は `[userId, endpoint]`
- `deviceType: 'expo'` → `endpoint: null`、`keys: null`、`expoToken` に保存、conflict target は `[userId, expoToken]`

---

## 作業 3: Push 送信に Expo 対応を追加（`apps/web`）

`apps/web` に `expo-server-sdk` パッケージを追加する。

`apps/web/src/lib/push/send.ts` を変更し、`deviceType` で送信先を分岐させる。
関数名を `sendWebPushToUser` → `sendPushToUser` に変更する。

```ts
import { Expo } from 'expo-server-sdk'
import webpush from 'web-push'

const expo = new Expo()

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await db.select(...).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))

  // Web Push（deviceType === 'web' の行のみ）
  const webSubs = subs.filter(s => s.deviceType === 'web' && s.keys?.p256dh && s.keys?.auth)
  // 既存の webpush.sendNotification ロジックをここに移動

  // Expo Push（deviceType === 'expo' の行のみ）
  const expoSubs = subs.filter(s => s.deviceType === 'expo' && s.expoToken)
  if (expoSubs.length > 0) {
    const messages = expoSubs.map(s => ({
      to: s.expoToken!,
      title: payload.title,
      body: payload.body,
      data: payload.url ? { url: payload.url } : undefined,
    }))
    const chunks = expo.chunkPushNotifications(messages)
    await Promise.allSettled(chunks.map(chunk => expo.sendPushNotificationsAsync(chunk)))
  }
}
```

`apps/web/src/lib/inngest/functions.ts` の `sendWebPushToUser` 呼び出しを `sendPushToUser` に更新する。

---

## 作業 4: Expo 側のトークン登録（`apps/mobile`）

`app/(app)/_layout.tsx`（タブレイアウト）にトークン登録処理を追加する。
ログイン後にタブが初めて表示されるタイミングで一度だけ実行する。

```ts
import * as Notifications from 'expo-notifications'
import { apiFetch } from '@/lib/api-fetch'

// フォアグラウンド通知の表示設定（_layout.tsx 最上部で呼ぶ）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: process.env['EXPO_PUBLIC_EAS_PROJECT_ID']!,
  })

  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ deviceType: 'expo', expoToken: token.data }),
  })
}
```

---

## 完了の定義

- `pnpm typecheck` が全パッケージで通ること
- `push_subscriptions` テーブルに `deviceType: 'expo'` の行が登録されること
- Web 版でメンション付きメッセージを送ると、Expo アプリに Push 通知が届くこと
- Web Push（既存）が引き続き動作すること（リグレッションなし）
