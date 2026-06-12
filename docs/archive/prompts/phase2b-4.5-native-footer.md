# Phase 2-B Session 4.5: フッター（タブナビ）のネイティブ化

## 背景と方針

Session 4 の WebView 化の際、ネイティブのタブバーを非表示（`tabBarStyle: { display: 'none' }`）にし、WebView 内に表示される Web 版フッター（`MobileNav`）がナビゲーションを担う構成になった。

この構成には次の問題があり、Session 5（オフライン送信キュー）の前にフッターをネイティブへ移す:

1. **オフライン時にナビゲーションが死ぬ**: フッターが WebView 内にあるため、圏外では WebView ページごと描画できず「チャットタブへ移動する」操作自体ができない。Session 5 の「圏外で書いて電波回復時に送信」はネイティブのナビゲーションがあって初めて成立する
2. **ネイティブチャット画面に到達できない**: 現状、ネイティブチャット画面（`chats/index.tsx`）へは Push 通知タップ以外から遷移できない
3. **二重実装の回避**: ネイティブチャット画面には Web フッターが表示されないため、どのみちネイティブのフッターが必要になる。Web フッターと併存させると見た目・挙動を揃えて2つ維持することになる

**スコープ: フッター（5タブ + 2つのポップアップ）をネイティブ化する。各タブのコンテンツは WebView のまま。チャット会話画面のネイティブ強化は Session 5。**

参照ドキュメント・ファイル:

- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `apps/mobile/app/(app)/_layout.tsx` — 現在のタブ構成（タブバー非表示）・Push 登録
- `apps/mobile/components/app-webview.tsx` — WebView 共通コンポーネント（handoff・オリジン制限）
- `apps/web/src/components/app/mobile/nav.tsx` — Web 版フッター `MobileNav`（移植元）
- `apps/web/src/app/(app)/_shells/mobile-shell.tsx` — `MobileNav` のレンダリングと `projectsView` の管理
- `apps/web/src/middleware.ts` — `?webview=1` → `x-webview` ヘッダー（現状未使用）
- `apps/mobile/hooks/use-projects.ts` — `useProjectChannels`（未読数を返す）

---

## 前提知識: `MobileNav` は単なるタブバーではない

`apps/web/src/components/app/mobile/nav.tsx` には以下が含まれる。すべてネイティブで再現する:

| 要素 | 内容 |
|---|---|
| 5タブ | プロジェクト / チャット / タスク / AI / メニュー（通知タブは**ない**） |
| プロジェクトビュー切替ポップアップ | プロジェクトタブ**再タップ**で開く。一覧 / カレンダー / カンバン。localStorage（`cairn:projects_view_mobile`）のみで永続化され URL パラメータは使わない |
| メニューポップアップ | ワークスペース名・ユーザー情報（`/api/workspaces`, `/api/me`）+ ファイル / ギャラリー / メンバー / 設定 |
| プロジェクトタブのアイコン | 現在のビューに応じて kanban / calendar アイコンに変わる |

---

## 作業 1: Web 側 — WebView 表示時に `MobileNav` を隠す（`apps/web`）

ネイティブフッターと二重にならないよう、WebView 内では Web フッターを非表示にする。

- `AppWebView` の handoff リダイレクト先には既に `?webview=1` が付いている（`apps/mobile/components/app-webview.tsx` 参照）
- middleware の `x-webview` ヘッダーは**初回リクエストにしか付かず**、クライアントナビゲーション後に失われるため使わない。クライアント側で判定する:

```
MobileShell の初回マウント時:
  location.search に webview=1 がある → sessionStorage に保存
  ↓
isWebView = (webview=1 クエリ) || (sessionStorage のフラグ)
  ↓
isWebView のとき <MobileNav> をレンダリングしない
```

- sessionStorage キーは `apps/web/src/lib/storage-keys.ts` の `STORAGE_KEYS` に追加する（例: `webview_mode`）
- state の初期化は `loadStoredView()` と同じ lazy initializer + `typeof window` ガードのパターンに従う（SSR では false → ハイドレーション後に隠れる一瞬のちらつきは許容）
- `x-webview` を使わないことになるため、middleware の該当行は削除してよい（残す場合は理由をコメントで書く）

---

## 作業 2: Mobile 側 — ネイティブフッターの実装（`apps/mobile`）

### タブバーの再有効化

`apps/mobile/app/(app)/_layout.tsx` の `tabBarStyle: { display: 'none' }` をやめ、Expo Router `Tabs` の `tabBar` prop にカスタムコンポーネント（`apps/mobile/components/mobile-nav.tsx` 新規）を渡す。ポップアップ2種を含むため標準タブバーのカスタマイズでは足りず、カスタム実装が前提。

- タブは Web 版と同じ5つ: projects / chats / tasks / ai / menu
- `notifications` ルートは Push 通知タップ遷移用に画面として残すが、タブには出さない（`<Tabs.Screen name="notifications" options={{ href: null }} />`）。Web 版フッターにも通知タブはない
- `menu` タブはタップで遷移せずポップアップを開く（Web 版と同じ挙動）。`menu/index.tsx` のルート自体は不要になれば削除してよい
- メニューポップアップの各項目（ファイル / ギャラリー / メンバー / 設定）は WebView で該当パスを表示する画面へ遷移する。実装方法は「`menu` 配下に `files.tsx` 等のルートを置き `AppWebView path="/files"` を返す」で十分
- ワークスペース名・ユーザー情報は `apiFetch('/api/workspaces')` / `apiFetch('/api/me')` を TanStack Query で取得（`hooks/` の既存パターンに従う）
- チャットタブに未読バッジを表示する: `useProjectChannels()` の `unreadCount` 合計を使う
- セーフエリア: フッターがネイティブになるため、`AppWebView` の `paddingBottom: insets.bottom` はタブバー側で吸収するよう調整する（二重に空かないこと）

### スタイル

Web 版 `nav.tsx` の見た目（高さ約 65px、アイコン 22px + ラベル 10px、アクティブ色）に寄せる。色は `app-webview.tsx` の `BG_DARK` / `BG_LIGHT` と同様に Web の CSS 変数値をハードコードで揃える。

---

## 作業 3: プロジェクトビュー切替のブリッジ（ネイティブ → WebView）

ビューは Web 側 localStorage のみで管理され URL パラメータがないため、ネイティブのピッカーから WebView 内の表示を切り替えるブリッジが必要。

### 設計

- **ネイティブ側を選択状態の起点にする**: 選択値を AsyncStorage に永続化し、フッターのプロジェクトタブアイコン（kanban / calendar）の出し分けに使う
- 選択時、projects タブの WebView に `injectJavaScript` で反映する:

```ts
webViewRef.current?.injectJavaScript(`
  localStorage.setItem('cairn:projects_view_mobile', '${view}');
  window.dispatchEvent(new Event('cairn:projects-view-changed'));
  true;
`)
```

- Web 側 `MobileShell` は `cairn:projects-view-changed` イベントを listen し、localStorage を読み直して `projectsView` state を更新する（リロード不要で切り替わる）
- `AppWebView` は現状 ref を外部公開していないため、`forwardRef` などで `injectJavaScript` を叩ける手段を公開する（projects タブ画面とフッター間の連携は React Context か Zustand 等、`apps/mobile` 内の最小構成で実装する）

### 注意

- `injectedJavaScriptBeforeContentLoaded` は使わない（iOS/Android 実機で別 JS コンテキストになりページから参照できない既知問題。`app-webview.tsx` のコメント参照）
- 初回インストール直後はネイティブ側 AsyncStorage と WebView 側 localStorage が両方とも未設定（= 一覧）で一致するため、初期同期処理は不要

---

## 作業 4: WebView 内のチャットリンクをネイティブへ委譲

WebView 内のリンク（通知一覧・メンション等）から `/chats` へ遷移しようとした場合、WebView 内で開かずネイティブのチャットタブへ切り替える。

- `app-webview.tsx` の `onShouldStartLoadWithRequest` で `${trustedOrigin}/chats` への遷移を検知 → `false` を返してブロックし、`router.push('/(app)/chats')`
- チャンネル単位のディープリンクはネイティブの会話画面が整う Session 5 で対応する。本セッションではチャット一覧への遷移まででよい

---

## やらないこと

- チャット会話画面のネイティブ実装・オフライン送信キュー → Session 5（`phase2b-5-native-chat.md`）
- 通知タブの追加（Web 版フッターと同様、通知一覧へは Push タップ・ページ内導線から到達する）
- Android ハードウェアバックボタンの WebView 履歴対応 → 必要になったら追加
- Web 側 `MobileNav` の削除（モバイルブラウザ直アクセスでは引き続き使う）

---

## 完了の定義

- ネイティブフッターに5タブが表示され、WebView 内に Web フッターが表示されない（二重にならない）
- 機内モードでもタブ切替が動作し、ネイティブチャット画面に到達できる
- プロジェクトタブ再タップでビュー切替ポップアップが開き、選択すると WebView 内の表示が一覧 / カレンダー / カンバンに切り替わる。タブアイコンも追従する
- メニューポップアップにワークスペース・ユーザー情報が表示され、ファイル / ギャラリー / メンバー / 設定の各画面（WebView）へ遷移できる
- チャットタブに未読バッジが表示される
- WebView 内のチャットリンクからネイティブのチャットタブへ切り替わる
- Push 通知の登録・タップ遷移が引き続き動作する（`_layout.tsx` の既存処理が壊れていないこと）

実装完了後、`docs/08_expo_roadmap.md` のステータス表と `CLAUDE.md` のモバイル方針（「フッターはネイティブ、コンテンツは WebView」）を更新すること。
