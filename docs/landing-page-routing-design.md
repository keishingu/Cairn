# ランディングページの配信とルーティング

> **ステータス**: 現行リファレンス（`/` の公開 LP 配信）。LP のコンテンツ・CTA・パラメータ規約は [`lp-content-redesign.md`](./lp-content-redesign.md) が正。

`/` を未認証でも閲覧できる公開 LP にし、認証済みユーザーはアプリ既定画面 `/chats` へ誘導する。認証分岐は `apps/web/src/middleware.ts` に集約する。

## 配信方式

- `apps/web/src/app/route.ts` の Route Handler が `public/index.html` を読み、`text/html` として `/` に返す（`app/page.tsx` はない）
- 既存の静的 HTML/CSS/JS（`public/index.html`・`cairn-lp.css`・`cairn-lp.js`）をそのまま配信する。React で作り直すより工数・デザイン移植リスクが小さいため。React 化は LP を大きく作り替える時に再検討する
- 単一レイアウトで、`x-device` による PC / モバイル出し分けはしない
- 旧 `/lp` 配下や `/index.html` の互換リダイレクトは持たない。正規 URL は `/`
- SEO: LP の `<head>` に OGP / canonical、`app/robots.ts` / `app/sitemap.ts`

## middleware のルール

| 条件 | 動作 |
|---|---|
| 未認証 + `/` | 通過（LP を表示） |
| 認証済み + `/` | `/chats` へリダイレクト |
| 未認証 + 公開ルート | 通過。公開ルートは `/`、LP アセット（`/cairn-lp.css` `/cairn-lp.js` `/og-image.png` `/og-image.svg`）、`/robots.txt` `/sitemap.xml`、`/privacy` `/terms`、`/invite/*`、`/.well-known/*` |
| 未認証 + それ以外（`/auth/*` を除く） | `/auth/login` へ（`/oauth/authorize` は `next` を付与） |
| 認証済み + `/auth/*` | `/chats` へ（`/onboarding`・`/auth/mobile-handoff`・`/auth/mobile-signout` は除外） |

LP に公開アセットを追加したら middleware の許可リストにも足す。ログイン後はワークスペース未作成なら `/onboarding`、作成済みなら `/chats`。

## 決定事項

- **ログイン画面は `/auth/login` のまま**。`/login` へのリネームは参照箇所・OAuth コールバック・メール内リンクの書き換え範囲に対して利益（URL の見栄え）が見合わないため見送り。LP の CTA は `/auth/login` にリンクする
