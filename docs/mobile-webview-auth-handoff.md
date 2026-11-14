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

- **API**: 認証済みユーザーのメールアドレスをサーバー側で取得し、メールを送らずに引換券を発行する。レスポンスはキャッシュしない。
- **mobile-handoff ページ**: フラグメントを履歴から消去し、同じユーザーの WebView セッションがあれば再利用する。Cookie の更新が一時的に失敗したときは再試行に回し、残っているセッションを上書きしない。ハンドオフ後はページ全体を再読み込みして新しい Cookie を送る。
- **自動復旧**: 信頼済み WebView のログイン画面への遷移や `HANDOFF_FAILED` は、WebView の認証を一度再試行する。同じ試行の重複通知や終了済みの WebView の通知は無視し、繰り返し失敗したら再試行ボタンを出す。Bearer が拒否された場合に限りネイティブの更新を一度試す。通信失敗や WebView の Cookie 消失でネイティブをログアウトさせず、ネイティブのセッションが失効した場合に再ログインへ進む。
- **明示ログアウト**: ブラウザ版はそのブラウザのセッションを終了する。アプリのメニューと WebView 内の設定からは、専用ページで WebView のセッションを終了してからネイティブを終了する。両方に `scope: 'local'` を指定する。圏外などで WebView を終了できない場合はネイティブの保存を消し、次のハンドオフより先に WebView の後処理を行う。
- **旧バージョンとの組み合わせ**: 新しいアプリは専用の `/auth/mobile-device-signout` を使う。旧 Web にある全端末ログアウトを呼ばないため、Web を先に更新する。旧アプリにはログイン画面を監視してログアウトする実装が残る。

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
4. WebView の Cookie だけを消して保護ページを開く。WebView が復旧し、ネイティブのチャットと別端末を引き続き利用できる
5. ハンドオフを連続で失敗させる。再試行ボタンが出て、ネイティブがログイン済みのまま使える
6. ネイティブのセッションだけを失効させる。ネイティブで再ログインが必要になり、別端末は使い続けられる
7. アプリのメニューと WebView 内の設定からそれぞれログアウトする。ネイティブと WebView を終了した後も、同じアカウントの別端末でセッションを更新できる
8. 圏外でアプリからログアウトする。再接続して別アカウントでログインしても、以前のユーザーの WebView が表示されない

## 不採用とした代替案

- **WebView 側 `autoRefreshToken: false` でリフレッシュ所有者をネイティブに一本化**: 更新のたびに再ハンドオフ通知が要り、タイミング依存が残る
- **WebView セッションレス（postMessage でトークン貸出）**: apps/web が Cookie / SSR 前提のため認証経路の二重化になる
- **Cookie 直接注入**: クロスプラットフォームの公式 API がなく、HttpOnly Cookie を作れない
