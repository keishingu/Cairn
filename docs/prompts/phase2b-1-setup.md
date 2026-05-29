# Phase 2-B Session 1: setup + Auth + API client

## タスク

`apps/mobile/` を新設し、Expo Router・Supabase Auth・API クライアントが動く状態まで持っていく。
画面の実装（プロジェクト・チャット等）は Session 2 で行う。

## 前提条件

- Phase 2-A 完了済み（`getAuthContext()` が Bearer トークン対応済み）
- Phase 1 完了済み（`notifications` / `push_subscriptions` / `channel_read_states` テーブルあり）

## 参照ドキュメント

- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `docs/08_expo_roadmap.md` — Phase 2-B の全体設計・ディレクトリ構成
- `apps/web/src/app/api/auth/setup/route.ts` — サインアップ後に呼ぶセットアップ API
- `apps/web/src/lib/get-auth-context.ts` — Bearer 認証の実装（呼び出し側の参考として）

---

## 作業 1: pnpm ワークスペース統合

### `apps/mobile/package.json`

```json
{
  "name": "@cairn/mobile",
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cairn/shared": "workspace:*",
    "@supabase/supabase-js": "^2",
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-notifications": "~0.29.0",
    "@tanstack/react-query": "^5",
    "react": "18.3.2",
    "react-native": "0.76.5"
  },
  "devDependencies": {
    "@cairn/config": "workspace:*",
    "typescript": "^5"
  }
}
```

### `apps/mobile/tsconfig.json`

```json
{
  "extends": "../../packages/config/tsconfig/base.json",
  "compilerOptions": {
    "jsx": "react-native",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

### `apps/mobile/app.json`

```json
{
  "expo": {
    "name": "Cairn",
    "slug": "cairn",
    "scheme": "cairn",
    "version": "1.0.0",
    "platforms": ["ios", "android"],
    "ios": {
      "bundleIdentifier": "com.cairn.app",
      "infoPlist": {
        "NSUserNotificationsUsageDescription": "プロジェクトのメンションやタスクの更新を通知します"
      }
    },
    "android": { "package": "com.cairn.app" },
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

### `turbo.json` の更新

既存の `typecheck` タスクに `@cairn/mobile#typecheck` を追加する（他のパッケージと同じ設定）。

---

## 作業 2: ディレクトリ構成（このセッションで作るもの）

```
apps/mobile/
  app/
    _layout.tsx              ルートレイアウト（Providers + 認証ガード）
    (auth)/
      _layout.tsx
      login.tsx
      signup.tsx
    (app)/
      _layout.tsx            ボトムタブ（空のプレースホルダーで可）
  lib/
    supabase.ts
    api-fetch.ts
    query-client.ts
  .env.local.example
```

---

## 作業 3: Supabase クライアント（`lib/supabase.ts`）

`expo-secure-store` をストレージアダプタとして使う。

```ts
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

---

## 作業 4: API フェッチユーティリティ（`lib/api-fetch.ts`）

```ts
import { supabase } from './supabase'

const API_BASE = process.env['EXPO_PUBLIC_API_BASE_URL']!

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}
```

---

## 作業 5: ルートレイアウト（`app/_layout.tsx`）

セッション状態を監視し、未ログインなら `/(auth)/login` へ、ログイン済みなら `/(app)/projects` へ
Expo Router でリダイレクトする。`QueryClientProvider` もここで wrap する。

セッションが `undefined`（初期化中）の間は `null` を返してスプラッシュを表示させる。

---

## 作業 6: 認証画面

### `app/(auth)/login.tsx`

- メール・パスワードで `supabase.auth.signInWithPassword()` を呼ぶ
- エラー時はインライン表示（サイレント無視しない）

### `app/(auth)/signup.tsx`

- メール・パスワード・表示名を入力
- `supabase.auth.signUp()` 後、**必ず** 以下を呼ぶ:

```ts
await apiFetch('/api/auth/setup', {
  method: 'POST',
  body: JSON.stringify({ displayName }),
})
```

> **この呼び出しを省くと `workspace_members` に行が入らず、以降の全 API が 403 になる。**
> Web 版のサインアップフローも同じ手順を踏んでいる（`apps/web/src/app/auth/signup/page.tsx` 参照）。

- セットアップ成功後に `/(app)/projects` へ遷移

---

## 作業 7: 環境変数（`apps/mobile/.env.local.example`）

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=（supabase start の出力値）
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_EAS_PROJECT_ID=
```

> **ローカル開発の注意**: 物理デバイスで Expo Go を使う場合、`localhost` はデバイスから到達できない。
> `EXPO_PUBLIC_API_BASE_URL` に開発マシンの LAN IP（例: `http://192.168.1.x:3000`）を設定する。

---

## 完了の定義

- `pnpm typecheck` が全パッケージで通ること
- Expo Go でログイン・サインアップが動くこと
- サインアップ後に `profiles` と `workspace_members` に行が作られること
- `apiFetch('/api/me')` が 200 を返すこと（Bearer 認証の疎通確認）
