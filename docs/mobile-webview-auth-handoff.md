# モバイル WebView 認証ハンドオフ再設計（ワンタイムトークン方式）

## ステータス

- 状態: 設計（未実装）
- 関連: [`docs/08_expo_roadmap.md`](08_expo_roadmap.md), [`docs/api-conventions.md`](api-conventions.md)

## 背景・課題

現在のモバイルアプリ（Expo）は、ネイティブでログインした Supabase セッションの
`access_token` / `refresh_token` を URL フラグメントで WebView に渡し、Web 側が
`supabase.auth.setSession()` でセッションを確立している
（`apps/mobile/components/app-webview.tsx` → `apps/web/src/app/auth/mobile-handoff/page.tsx`）。

この方式は **1 つの refresh_token をネイティブと WebView の 2 クライアントが共有する**
構造になっており、Supabase の refresh token rotation と衝突する。

- Supabase の refresh_token は使い捨て（rotation）。リフレッシュすると新しい
  refresh_token が発行され、古いものは失効する
- 同じ refresh_token を持つ 2 クライアントのうち片方がリフレッシュすると、
  もう片方は古い refresh_token を持ち続ける
- 古い refresh_token でのリフレッシュ試行は reuse 検出にかかり、猶予
  （`REFRESH_TOKEN_REUSE_INTERVAL`、デフォルト 10 秒）を超えると
  **セッションファミリーごと失効**する
- 結果として「使っていたら突然ログアウトされる」「WebView だけ未認証になる」
  という不安定な挙動が発生する

参考: [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions)、
[supabase/auth-js#213（並行リフレッシュによる意図しないサインアウト）](https://github.com/supabase/auth-js/issues/213)

付随する既知の問題:

- `app-webview.tsx` は `path` が変わるたびにハンドオフをやり直すため、
  古いトークンの再注入が起きやすい
- `mobile-handoff` で `setSession()` が失敗すると `/auth/login` に飛ばすだけで、
  ネイティブセッションは残存したまま復帰経路がない

## 方針: ワンタイムトークン交換（One-Time Token Exchange）

Auth0（Native to Web SSO）・Microsoft Entra・Ping が公式機能として提供している
標準パターンに合わせる。

> ネイティブの強いトークン（refresh_token）をブラウザに渡さない。
> 渡すのは短命・1 回限りの引換券だけ。WebView 側のセッションはサーバーが新規発行する。

Supabase には公式の Native-to-Web SSO 機能がないため、
`admin.generateLink({ type: 'magiclink' })` + `verifyOtp({ type: 'magiclink', token_hash })`
で同等のフローを構成する。

これにより:

- ネイティブと WebView が **完全に独立したセッション**（別々の refresh_token）を持つ
- どちらが先にリフレッシュしても干渉しない（rotation 競合が原理的に消滅）
- 片方のログアウト・失効がもう片方を壊さない

## シーケンス

```
ネイティブ (Expo)                Next.js (apps/web)              Supabase Auth
     │                                │                              │
     │ POST /api/auth/webview-handoff │                              │
     │ Authorization: Bearer <native AT>                             │
     ├───────────────────────────────>│                              │
     │                                │ getAuthContext() で検証       │
     │                                │ admin.generateLink(          │
     │                                │   type: 'magiclink',         │
     │                                │   email: user.email)         │
     │                                ├─────────────────────────────>│
     │                                │<───── hashed_token ──────────┤
     │<──── { token_hash } ───────────┤                              │
     │                                │                              │
     │ WebView を開く:                 │                              │
     │ /auth/mobile-handoff?redirect=...#th=<token_hash>             │
     ├───────────────────────────────>│                              │
     │                                │ (クライアント) 既存セッション確認 │
     │                                │ なければ verifyOtp(           │
     │                                │   type: 'magiclink',         │
     │                                │   token_hash)                │
     │                                ├─────────────────────────────>│
     │                                │<── 新規セッション(独立RT) ─────┤
     │                                │ Cookie 書き込み → フルリロード  │
     │                                │ で redirect 先へ              │
```

## 変更点

### 1. 新規 API ルート: `POST /api/auth/webview-handoff`（apps/web）

- `getAuthContext()` で認証（ネイティブは `Authorization: Bearer <access_token>` で呼ぶ。
  [`docs/api-conventions.md`](api-conventions.md) の規約どおり）
- `createServiceRoleClient()`（`src/lib/supabase/service.ts`）で
  `auth.admin.generateLink({ type: 'magiclink', email })` を実行
  - `email` は認証済みユーザー自身のものをサーバー側で取得する。
    リクエストボディからは受け取らない（他人のリンクを発行できてしまうため）
  - Admin API はメールを送信せず、リンク（`properties.hashed_token`）を返すだけ
- レスポンス: `{ tokenHash: string }`
- 失敗時は 401 / 500 を素直に返す（サイレントフォールバックしない。
  CLAUDE.md「エラー表示」方針に従う）

注意: service role キーを使うのはこのルートのサーバー側処理のみ。
キーがレスポンスやログに出ないことをレビュー観点とする。

### 2. `mobile-handoff` ページの差し替え（apps/web）

`apps/web/src/app/auth/mobile-handoff/page.tsx`:

- フラグメントから受け取るのは `#th=<token_hash>` のみ（`at` / `rt` は廃止）
- 処理順:
  1. `supabase.auth.getSession()` で **既存セッションがあれば verifyOtp をスキップ**して
     redirect のみ行う（タブ切り替えごとの再ハンドオフで無駄なセッションを作らない）
  2. なければ `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`
  3. 成功 → `history.replaceState` でフラグメント消去 → `window.location.replace(redirect)`
     （フルリロードで Cookie を確実に送信する。現行実装と同じ理由）
  4. 失敗 → `window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HANDOFF_FAILED' }))`
     を送ってから `/auth/login` へ。ネイティブ側が受け取って復帰処理を行う（後述）

### 3. `app-webview.tsx` の変更（apps/mobile）

- マウント時に `supabase.auth.getSession()` → その access_token で
  `POST /api/auth/webview-handoff` を呼び、`tokenHash` を取得して
  `/auth/mobile-handoff?redirect=...#th=<tokenHash>` を WebView の初期 URL にする
  - API 呼び出しは既存の `lib/api-fetch.ts` を利用する
- `path` 変更時は **ハンドオフをやり直さない**。WebView 側に
  `injectJavaScript` で `location.assign(path)` を実行して内部遷移させる
  （Web 側セッションは Cookie で生きているため再認証不要。
  既存セッションスキップ（変更点 2-1）が二重の保険になる）
- `onMessage` ハンドラを追加:
  - `HANDOFF_FAILED` 受信 → トークン期限切れの可能性があるため
    `supabase.auth.refreshSession()` → 成功ならハンドオフを 1 回だけ再試行、
    失敗なら `signOut()` してログイン画面へ。**無限リトライしない**
- ハンドオフ API の呼び出し失敗（ネットワーク等）はエラー表示
  （WebView 領域にエラーメッセージ + 再試行ボタン）。サイレントに古い方式へ
  フォールバックしない

### 4. ログアウト連携（スコープ内・最小限）

現行の「WebView が `/auth/login` へ遷移したらネイティブも signOut」という
URL 監視（`handleNavigationStateChange`）は、SPA 遷移で漏れる既知の問題があるが、
セッション分離後は「片方のログアウトがもう片方を壊す」ことがなくなるため
緊急度が下がる。本設計では:

- URL 監視は残す（ベストエフォートの同期として）
- ただし `mobile-handoff` 失敗時の `/auth/login` 遷移で URL 監視が誤発火して
  ネイティブまで signOut しないよう、`HANDOFF_FAILED` の復帰処理中は
  URL 監視を一時停止する
- postMessage ベースの明示的なログアウトイベント（Web 側 logout ボタン →
  `{ type: 'LOGGED_OUT' }`）は **別タスク**として切り出す

## セキュリティ考慮

| 項目 | 評価 |
|------|------|
| `token_hash` の露出 | 1 回限り・短命（Otp expiry、デフォルト 1 時間）。URL フラグメントで渡すためサーバーログに残らず、`verifyOtp` 成功で即失効。現行の refresh_token 露出（長命・再利用可能）より大幅に改善 |
| リンク発行の認可 | `getAuthContext()` で本人確認し、本人の email のみ対象。任意 email を指定する入力経路を作らない |
| service role キー | サーバー側 Route Handler 内のみで使用。クライアントへ返すのは `tokenHash` だけ |
| `verifyOtp` の副作用 | magiclink の verify はメールアドレス確認済みフラグに影響しない（既存ユーザーのみが対象） |

## 留意点・トレードオフ

- **セッション行の増加**: WebView ごとに独立セッションが作られる。
  既存セッションスキップ（変更点 2-1）で増加は「アプリの Cookie が消えた時だけ」に
  抑えられる。Supabase ダッシュボードの Single session per user 制約は
  **有効化しない**こと（有効化するとネイティブと WebView が相互に蹴り合う）
- **ローカル開発**: `SUPABASE_SERVICE_ROLE_KEY` は `supabase start` のデフォルトキーが
  `.env.local.example` に入っており追加設定は不要
- **Inbucket 等のメール設定は不要**: `admin.generateLink` はメールを送信しない

## 実装順序

1. `POST /api/auth/webview-handoff` ルート追加 + vitest（`getAuthContext` /
   `generateLink` をモックし、認証なし 401・正常時 `tokenHash` 返却を検証）
2. `mobile-handoff` ページを `verifyOtp` 方式へ差し替え（既存セッションスキップ含む）
3. `app-webview.tsx` をハンドオフ API 呼び出し + `path` 内部遷移 +
   `HANDOFF_FAILED` 復帰処理に変更
4. 手動検証（下記）
5. CLAUDE.md「決定済みの技術判断」に本方式を追記

## 手動検証シナリオ

1. ネイティブログイン → WebView タブを開く → Web 画面が認証済みで表示される
2. タブ切り替えを繰り返す → 再ハンドオフが走らず即表示される（Network ログで
   `webview-handoff` が初回のみであることを確認）
3. アプリをバックグラウンドに 1 時間以上放置 → 復帰 → ネイティブ・WebView とも
   操作可能（rotation 競合によるログアウトが起きない）
4. ネイティブのトークンを意図的に失効させた状態で WebView を開く →
   `HANDOFF_FAILED` → リフレッシュ再試行 or ログイン画面への誘導が 1 回で収束する
5. Web 側（WebView 内）でログアウト → ネイティブもログイン画面に戻る
6. Supabase Studio の auth.sessions で、ネイティブと WebView のセッションが
   別ファミリーであること、WebView 再オープンでセッションが増殖しないことを確認

## 不採用とした代替案

- **現方式の維持 + WebView 側 `autoRefreshToken: false`**: リフレッシュ所有者を
  ネイティブに一本化する案。実装は小さいが、トークン更新のたびにネイティブ →
  WebView への再ハンドオフ通知が必要で、タイミング依存の複雑さが残る
- **wellnessMobile 方式（WebView セッションレス + postMessage でトークン貸出）**:
  rotation 競合は消えるが、apps/web が Cookie/SSR 前提（middleware 認可・RSC）の
  ため、WebView 向けに認証経路を二重化する大改修になる
- **Cookie 直接注入**: React Native WebView に Cookie を安全に注入する
  クロスプラットフォームな公式 API がなく、HttpOnly Cookie を作れない
