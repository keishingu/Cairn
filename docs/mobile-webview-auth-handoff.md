# モバイル WebView 認証ハンドオフ（ワンタイムトークン方式）

> **ステータス**: 現行リファレンス。実装は `apps/web/src/app/api/auth/webview-handoff/route.ts`、`apps/web/src/app/auth/mobile-handoff/page.tsx`、`apps/mobile/components/app-webview.tsx`。関連: [`mobile-app.md`](mobile-app.md)、[`api-conventions.md`](api-conventions.md)

## 方針

**ネイティブの refresh_token を WebView に渡さない。** 渡すのは短命・1 回限りの引換券（magiclink の `token_hash`）だけで、WebView のセッションは独立に新規発行する。

理由: 1 つの refresh_token をネイティブと WebView で共有すると Supabase の refresh token rotation と衝突し、片方のリフレッシュ後にもう片方が古いトークンで更新を試みると reuse 検出（猶予 `REFRESH_TOKEN_REUSE_INTERVAL` 既定 10 秒）で**セッションファミリーごと失効**する（「突然ログアウトされる」）。Supabase には Native-to-Web SSO がないため、`admin.generateLink({ type: 'magiclink' })` + `verifyOtp({ type: 'magiclink', token_hash })` で Auth0 等と同じワンタイムトークン交換を構成する。ネイティブと WebView は別々の refresh_token を持ち、互いのリフレッシュ・ログアウトが干渉しない。

## シーケンス

```
ネイティブ (Expo)                Next.js (apps/web)              Supabase Auth
     │ POST /api/auth/webview-handoff │                              │
     │ Authorization: Bearer <native AT>                             │
     ├───────────────────────────────>│ getAuthContext() で検証       │
     │                                │ admin.generateLink(magiclink, │
     │                                │   本人の email) ─────────────>│
     │                                │<───── hashed_token ──────────┤
     │<──── { tokenHash } ────────────┤                              │
     │ WebView: /auth/mobile-handoff?redirect=...#th=<tokenHash>     │
     ├───────────────────────────────>│ 既存セッションがあれば skip    │
     │                                │ なければ verifyOtp ──────────>│
     │                                │<── 新規セッション(独立RT) ─────┤
     │                                │ フラグメント消去 → フルリロード │
```

- **API**: `email` はリクエストから受け取らずサーバー側で本人のものを取得する（任意 email で他人のリンクを発行させないため）。`generateLink` はメールを送らない。失敗は 401 / 500 をそのまま返す
- **mobile-handoff ページ**: `getSession()` で既存セッションがあれば `verifyOtp` を省略（タブ切替ごとにセッションを増やさない）。成功時は `history.replaceState` でフラグメントを消し、`location.replace(redirect)` のフルリロードで Cookie を確実に送る。失敗時は `HANDOFF_FAILED` を postMessage してから `/auth/login` へ
- **app-webview.tsx**: `path` 変更時はハンドオフをやり直さず `injectJavaScript` の `location.assign` で内部遷移。`HANDOFF_FAILED` 受信時は `refreshSession()` → 成功なら 1 回だけ再試行、失敗なら `signOut()`（無限リトライしない）。API 失敗はエラー + 再試行ボタンを出し、旧方式へフォールバックしない
- **ログアウト連携**: WebView が `/auth/login` へ遷移したらネイティブも signOut する URL 監視はベストエフォートで残す。`HANDOFF_FAILED` の復帰処理中は誤発火を防ぐため一時停止する

## セキュリティ

| 項目 | 評価 |
|------|------|
| `token_hash` の露出 | 1 回限り・短命（OTP expiry 既定 1 時間）。URL フラグメントなのでサーバーログに残らず、`verifyOtp` 成功で即失効 |
| リンク発行の認可 | `getAuthContext()` で本人確認し、本人の email のみ対象 |
| service role キー | Route Handler 内のみで使用。クライアントへ返すのは `tokenHash` だけ。キーがレスポンス・ログに出ないことをレビュー観点にする |
| `verifyOtp` の副作用 | 既存ユーザーのみが対象で、メール確認済みフラグに影響しない |

## トレードオフ・運用上の注意

- WebView ごとに独立セッションが作られるが、既存セッションスキップにより増えるのはアプリの Cookie が消えたときだけ
- Supabase の **Single session per user は有効化しない**（ネイティブと WebView が相互に蹴り合う）
- ローカル開発は `supabase start` の service role キーが `.env.local.example` に入っており追加設定不要。メール設定も不要

## 手動検証シナリオ

1. ネイティブログイン → WebView タブが認証済みで表示される
2. タブ切替を繰り返しても `webview-handoff` は初回のみ
3. 1 時間以上バックグラウンド → 復帰後もネイティブ・WebView とも操作可能
4. ネイティブのトークンを失効させて WebView を開く → `HANDOFF_FAILED` → 再試行またはログイン誘導が 1 回で収束
5. WebView 内でログアウト → ネイティブもログイン画面に戻る
6. `auth.sessions` でネイティブと WebView が別ファミリーで、再オープンで増殖しない

## 不採用とした代替案

- **WebView 側 `autoRefreshToken: false` でリフレッシュ所有者をネイティブに一本化**: 更新のたびに再ハンドオフ通知が要り、タイミング依存が残る
- **WebView セッションレス（postMessage でトークン貸出）**: apps/web が Cookie / SSR 前提のため認証経路の二重化になる
- **Cookie 直接注入**: クロスプラットフォームの公式 API がなく、HttpOnly Cookie を作れない
