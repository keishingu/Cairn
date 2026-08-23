# ランディングページ導入とルーティング再構成 設計

- **ステータス**: PR1（`/` での LP 直配信）+ `/chats` 既定化を実装済み
- **作成**: 2026-06-13
- **更新**: 2026-08-23
- **対象**: `apps/web`（Next.js 15 App Router）

> 本ドキュメントは設計案であり、実装の現状を保証しない。矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。


## 1. 背景と目的

巷の SaaS は「`/` がランディングページ（LP）、`/login` がログイン、ログイン後は `/dashboard` 等にリダイレクト」という構成が一般的。Cairn の場合、ログイン後の入口は `/chats`。

導入前の Cairn は **LP を `/lp` 配下に静的ファイルとして持つが、トップ `/` には置いていなかった**:

- `/`（`apps/web/src/app/page.tsx`）は無条件で `redirect('/projects')`
- 未認証ユーザーが `/` に来ると、middleware が `/auth/login` へ強制リダイレクト
- 公開 LP は `apps/web/public/`（現在は `public/index.html`）で管理する。初期導入時は `/lp/index.html` 配下にあり、トップではなく `/lp` 配下で、`/auth/login` 等への CTA 導線も未接続だった

このため、トップページ（`/`）が訪問者に対して何も語らず、SEO・OGP・第一印象の起点になっていなかった。本設計はこれを解消し、`/` を公開 LP にする。


## 2. ゴール / 非ゴール

### ゴール

- `/` を**未認証でも閲覧できる公開 LP** にする
- 認証済みユーザーが `/` に来た場合はアプリ（`/chats`）へ誘導する
- ログイン後の遷移先は、ワークスペース未作成なら `/onboarding`、作成済みなら `/chats` とする
- 認証ガードの一元管理（`middleware.ts`）の構造を崩さない

### 非ゴール

- ログイン画面のパス変更（`/auth/login` → `/login`）は**本設計のスコープ外**（理由は §6）
- LP のデザイン・コピー・料金表などの最終確定は別タスク（本設計は配線とプレースホルダまで）
- ログイン後の画面構成・ダッシュボード新設などの変更


## 3. 実装（To-Be, 実装済み）

### 3.1 方針

`/` を `(app)` 認証シェルの**外**に置いた公開 LP にする。認証済みかどうかの分岐は、引き続き `middleware.ts` に集約する。

```
未認証ユーザー  →  /            （LP を表示）
                   /auth/login  （ログイン）
                   /auth/signup （サインアップ）
認証済みユーザー →  /            （/chats へリダイレクト）
                   /chats       （アプリの既定画面）
```

### 3.2 実装方式（採用: 既存静的アセットを `/` の Route Handler で配信）

既存の静的 HTML/CSS/JS をゼロから作り直さず、`apps/web/src/app/route.ts` の Route Handler で `/` に直接配信する。

`apps/web/src/middleware.ts`:

- 未認証で `/` にアクセス → middleware は通過し、`apps/web/src/app/route.ts` が `public/index.html` を `text/html` として返す
- 認証済みで `/` にアクセス → `/chats` へリダイレクト
- LP の静的アセット（`/cairn-lp.css`・`/cairn-lp.js`・`/og-image.png` など）は未認証でもアクセス可能
- 旧 `/lp` 配下や `/index.html` の互換リダイレクトは持たない。公開 LP は最初から `/` を正規 URL とする
- `/robots.txt`・`/sitemap.xml` は公開 SEO ルートとして未認証でもアクセス可能

この方式では、旧 `apps/web/src/app/page.tsx` の `/projects` リダイレクトは削除し、`apps/web/src/app/route.ts` が `/` のレスポンスを担当する。ログイン済みユーザーの `/chats` 誘導は middleware に集約する。

### 3.3 デバイス出し分け

LP は単一レイアウト（B 案）。既存の静的 HTML をそのまま配信するため、`x-device` による PC/モバイル出し分けは行わない。

### 3.4 CTA 動線（Try Demo → クラウド版を試す）

旧 LP の主要 CTA「Try Demo / デモを試す」はページ内アンカー（`#demo`）止まりで実体のあるデモに繋がっていなかったため、`/auth/login`（クラウドホスティング版のログイン/サインアップ入口）に張り替えた。ラベルも「クラウド版を試す / Try Cairn Cloud」に変更。自己ホスト派の導線（GitHub / Self-Hosted / Docs）は現状維持。

> **追記（2026-07-03）**: CTA ラベルはその後 [`lp-content-redesign.md`](./lp-content-redesign.md) で「無料で始める / Start for free」に変更された。

対象箇所（`apps/web/public/index.html`）:

- ナビの CTA ボタン
- ヒーローの CTA ボタン
- 最終 CTA セクションのボタン
- フッターの「Cairn Cloud」導線（ソーシャルアイコン・Product 列・Community 列）


## 4. 触らないもの

- `auth/login` / `auth/signup` / `onboarding` / `invite/[token]` のパス（完了後の既定遷移先だけ `/chats` に変更）
- `/projects` 自体のルートとプロジェクト詳細への導線
- プロジェクト機能としての `/projects` 参照 — 既定画面の変更とは独立しているため修正不要


## 5. 影響範囲

| 対象 | 影響 | 備考 |
|---|---|---|
| `middleware.ts` | 修正 | 認証済み `/` の誘導分岐 + LP 静的アセット / SEO ルート公開 |
| `app/route.ts` | 追加 | `/` で `public/index.html` を直接配信 |
| `app/page.tsx` | 削除 | `/` は Route Handler が担当 |
| `(app)/*` | 修正 | サイドメニュー・モバイルタブの先頭をチャットにし、旧 `/dashboard` を `/chats` へ転送 |
| `auth/*`, `onboarding/*`, `invite/*` | 修正 | ワークスペース作成済みユーザーの既定遷移を `/chats` に統一 |
| `manifest.ts`, `public/sw.js` | 修正 | PWA の起動先・オフラインフォールバック・通知URL既定値を `/chats` に統一 |
| `public/index.html` | CTA / SEO 変更 | `#demo` → `/auth/login`、ラベル変更、OGP/canonical 追加、フッター導線の一部を要望受付ワークスペースへ接続 |
| `/projects` の機能内参照 | なし | プロジェクト画面への明示的な導線は維持 |
| OGP / SEO / sitemap | 修正 | LP の `<head>` に OGP/canonical を追加し、`robots.ts` / `sitemap.ts` を追加 |


## 6. 検討した代替案と却下理由

### ログイン画面を `/login` にリネームする案 → 見送り

- `/auth/login` への参照が約 33 箇所あり、OAuth コールバックやメール内リンクの確認も含めて書き換え範囲が広い
- 得られる利益（URL の見栄え）に対してコストとリスクが見合わない
- 結論: **`/auth/login` のまま**とし、LP の CTA から `/auth/login` にリンクする

### `/` を据え置き、LP を `/lp` のまま運用する案 → 却下

- 「トップページが LP」という本来の目的（SEO・第一印象）を満たさない

### LP を React で作り直す案（B案） → 見送り（今回は不採用）

- 既存の静的 LP（ダークテーマ・日英切替・features/open-source/self-hosted/enterprise/docs 構成）を活かす方式のほうが工数が小さく、デザイン移植リスクもない
- React 化は LP の中身を大きく作り替えるタイミングで再検討する


## 7. 今後の進め方（PR2 以降）

- CTA 接続・コピー・料金導線などを段階投入
- LP のデバイス出し分けが必要になった場合は、単一レイアウト（現状）から `x-device` ベースの出し分けへの移行を再検討


## 8. 受け入れ条件（PR1・実装済み）

- [x] 未認証ユーザーが `/` にアクセスして LP が表示される（`/auth/login` に飛ばされない）
- [x] 認証済みユーザーが `/` にアクセスすると `/chats` にリダイレクトされる
- [x] 未認証ユーザーが `/projects` 等の保護ルートに来たら従来どおり `/auth/login` に飛ぶ
- [x] ログイン後にワークスペース未作成なら `/onboarding`、作成済みなら `/chats` に遷移する
- [x] LP が `(app)` の認証前提コンテキストに依存していない（静的アセットのため無関係）
- [x] 公開 LP が `/` を正規 URL として直接配信されている
- [x] LP の主要 CTA（旧「Try Demo」）が `/auth/login` に遷移する（`#demo` アンカー止まりでない）
