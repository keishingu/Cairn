# Phase 2-B Session 4: WebView 化（ネイティブ画面の置き換え）

## 背景と方針

PR #68 でネイティブ画面（プロジェクト・チャット・タスク・通知）を実装済み。
Web 版のモバイル UI が既に整備されているため、**チャット以外の画面は WebView で Web アプリをそのまま表示する** 方針に変更する。

- チャット画面: ネイティブのまま維持（将来の電波断・バックグラウンドアップロード対応のため）
- その他の画面（プロジェクト・タスク・通知）: WebView に置き換え
- Push 通知: ネイティブのまま変更なし（`_layout.tsx` 実装済み）

参照ドキュメント:
- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `apps/mobile/app/(app)/_layout.tsx` — 現在のタブ構成・Push 登録
- `apps/web/src/middleware.ts` — 認証ガード（`x-device` ヘッダー設定）
- `apps/web/src/app/(app)/layout.tsx` — PC/モバイルシェル切り替え

---

## 認証の橋渡し（最重要）

Expo は Bearer トークン（`apiFetch` で使用）を持っているが、WebView が Next.js のページを開くには **Supabase の Cookie セッション** が必要。middleware が未認証リクエストを `/auth/login` にリダイレクトするため、WebView 起動前にセッションを Cookie に書き込む必要がある。

### 仕組み

```
Expo ログイン済み
  ↓ supabase.auth.getSession() で access_token + refresh_token を取得
  ↓
WebView を /auth/mobile-handoff?access_token=...&refresh_token=...&redirect=/projects に遷移
  ↓ web 側でセッションを Cookie にセット
  ↓
WebView が /projects を表示（Cookie 認証が通る）
```

---

## 作業 1: Web 側 — セッション橋渡しページ（`apps/web`）

### `apps/web/src/app/auth/mobile-handoff/page.tsx` を新規作成

`/auth/*` は middleware の認証チェック対象外のため、未認証でもアクセスできる。

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MobileHandoffPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const redirect = params.get('redirect') ?? '/projects'

    if (!accessToken || !refreshToken) {
      router.replace('/auth/login')
      return
    }

    const supabase = createClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => router.replace(redirect))
      .catch(() => router.replace('/auth/login'))
  }, [])

  return null  // ローディング中は空白（スプラッシュが見える）
}
```

セキュリティ上の注意: トークンが URL に含まれるが、この URL はアプリ内部でのみ使用され、ユーザーには表示されない。トークンは Supabase がデフォルトで1時間で失効するため許容範囲。

### Web アプリのシェルナビゲーション抑制

WebView で表示した場合、MobileShell のタブバーと Expo のネイティブタブバーが二重になる。
以下の対応を行う:

**`apps/web/src/middleware.ts`**: `?webview=1` クエリパラメータがある場合に `x-webview: 1` ヘッダーをセット

```ts
// middleware 内の既存ヘッダー設定の直後に追加
const isWebView = request.nextUrl.searchParams.get('webview') === '1'
if (isWebView) {
  requestHeaders.set('x-webview', '1')
}
```

**`apps/web/src/app/(app)/layout.tsx`**: `x-webview` ヘッダーがある場合は MobileShell のタブナビを非表示にする

```ts
import { headers } from 'next/headers'

// layout.tsx 内
const headersList = await headers()
const isWebView = headersList.get('x-webview') === '1'

// MobileShell に isWebView prop を渡し、MobileShell 側でタブバーを非表示にする
```

ただし Next.js では `x-webview` ヘッダーはリクエストパラメータとして WebView の最初のリクエストにしか付かない。その後のナビゲーションには付かないため、`sessionStorage.setItem('webview', '1')` を最初のページロード時にセットし、以降は JS で読む方が安定する。実装はシンプルさを優先して選ぶこと。

---

## 作業 2: Mobile 側 — WebView への画面置き換え（`apps/mobile`）

### 共通 WebView コンポーネント（`apps/mobile/components/app-webview.tsx`）

```tsx
import { useRef, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'

const WEB_BASE = process.env['EXPO_PUBLIC_API_BASE_URL']!

interface Props {
  path: string  // 例: '/projects', '/tasks'
}

export function AppWebView({ path }: Props) {
  const webViewRef = useRef<WebView>(null)
  const [uri, setUri] = React.useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const { access_token, refresh_token } = session
      const redirect = encodeURIComponent(`${path}?webview=1`)
      setUri(
        `${WEB_BASE}/auth/mobile-handoff?access_token=${access_token}&refresh_token=${refresh_token}&redirect=${redirect}`
      )
    })
  }, [path])

  // タブに戻ってきたときに WebView をリロード（任意）
  // useFocusEffect(() => { webViewRef.current?.reload() })

  if (!uri) return null

  return (
    <WebView
      ref={webViewRef}
      source={{ uri }}
      style={styles.webview}
      // チャット URL への遷移はネイティブ画面に委譲（Session 5 で実装）
    />
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
})
```

`react-native-webview` を `apps/mobile/package.json` に追加する:
```json
"react-native-webview": "13.x"
```

### 各画面の置き換え

**`apps/mobile/app/(app)/projects/index.tsx`**: 既存のネイティブ実装を `AppWebView` に置き換え

```tsx
import { AppWebView } from '../../../components/app-webview'

export default function ProjectsScreen() {
  return <AppWebView path="/projects" />
}
```

**`apps/mobile/app/(app)/tasks/index.tsx`**: 同様に置き換え（`path="/tasks"` または相当するパス）

**`apps/mobile/app/(app)/notifications/index.tsx`**: 同様に置き換え（`path="/notifications"` または相当するパス）

**`apps/mobile/app/(app)/projects/[id].tsx`**: WebView で個別プロジェクト詳細を表示する場合は `AppWebView path={'/projects?open=' + id}` でよい（Web 版の URL 設計に合わせる）。ただしネイティブのチャット画面への遷移を維持したい場合は Session 5 まで保留。

**`apps/mobile/app/(app)/chats/`**: **変更しない**（ネイティブのまま）

---

## 作業 3: `apps/mobile` への `react-native-webview` 追加

`pnpm --filter @cairn/mobile add react-native-webview` を実行する。

`apps/mobile/app.json` の `plugins` に追加:
```json
"plugins": ["expo-router", "expo-secure-store", "react-native-webview"]
```

---

## やらないこと

- WebView の戻るボタン対応（Android のハードウェアバック）→ 必要なら後から追加
- WebView のキャッシュ制御 → デフォルトで可
- チャット画面の WebView 化 → ネイティブを維持（Session 5 で強化）

---

## 完了の定義

- プロジェクト一覧・タスク・通知タブで Web アプリの画面が表示されること
- ネイティブのタブバーが表示され、Web 側のタブバーが重複しないこと
- チャットタブはネイティブのまま動作すること
- Push 通知が引き続き届くこと（`_layout.tsx` の Push 登録が壊れていないこと）
