# ランディングページ導入とルーティング再構成 設計

- **ステータス**: PR1（ルーティング配線 + `/lp` 集約）実装済み
- **作成**: 2026-06-13
- **対象**: `apps/web`（Next.js 15 App Router）

> 本ドキュメントは設計案であり、実装の現状を保証しない。矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。


## 1. 背景と目的

巷の SaaS は「`/` がランディングページ（LP）、`/login` がログイン、ログイン後は `/dashboard` 等にリダイレクト」という構成が一般的。Cairn の場合、ログイン後の入口は `/projects`。

導入前の Cairn は **LP を `/lp` 配下に静的ファイルとして持つが、トップ `/` には置いていなかった**:

- `/`（`apps/web/src/app/page.tsx`）は無条件で `redirect('/projects')`
- 未認証ユーザーが `/` に来ると、middleware が `/auth/login` へ強制リダイレクト
- 公開 LP は `apps/web/public/lp/`（`/lp/index.html`）に既に存在するが、トップではなく `/lp` 配下で、`/auth/login` 等への CTA 導線も未接続

このため、トップページ（`/`）が訪問者に対して何も語らず、SEO・OGP・第一印象の起点になっていなかった。本設計はこれを解消し、`/` を公開 LP にする。


## 2. ゴール / 非ゴール

### ゴール

- `/` を**未認証でも閲覧できる公開 LP** にする
- 認証済みユーザーが `/` に来た場合は従来どおりアプリ（`/projects`）へ誘導する
- ログイン後の遷移先（`/onboarding` / `/projects` の振り分け）は**変更しない**
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
認証済みユーザー →  /            （/projects へリダイレクト）
                   /projects    （アプリ本体）
```

### 3.2 実装方式（採用: A案 — 既存静的アセットを middleware で rewrite）

既存 `apps/web/public/lp/` の静的 HTML/CSS/JS をゼロから作り直さず、**middleware の rewrite** で `/` にそのまま配信する。

`apps/web/src/middleware.ts`:

- 未認証で `/` にアクセス → `NextResponse.rewrite('/lp/index.html')`（URL バーは `/` のまま、実体は既存の静的 LP を返す）
- 認証済みで `/` にアクセス → `/projects` へリダイレクト
- `/lp`・`/lp/`・`/lp/index.html`（旧 LP の URL）へのアクセス → `/` へ 308 リダイレクト（公開 LP の URL を `/` に一本化）
- `/lp/cairn-lp.css` ・`/lp/cairn-lp.js` などの静的アセットは `/lp/` 配下に残置し、そのまま配信（リダイレクト対象から除外）

この方式のため、**`apps/web/src/app/page.tsx` は変更していない**。middleware が `/` へのリクエストを常に横取りして rewrite/redirect するため、App Router の `page.tsx` は実質到達しない（フォールバックとして残置）。

### 3.3 デバイス出し分け

LP は単一レイアウト（B 案）。既存の静的 HTML をそのまま配信するため、`x-device` による PC/モバイル出し分けは行わない。

### 3.4 CTA 動線（Try Demo → クラウド版を試す）

旧 LP の主要 CTA「Try Demo / デモを試す」はページ内アンカー（`#demo`）止まりで実体のあるデモに繋がっていなかったため、`/auth/login`（クラウドホスティング版のログイン/サインアップ入口）に張り替えた。ラベルも「クラウド版を試す / Try Cairn Cloud」に変更。自己ホスト派の導線（GitHub / Self-Hosted / Docs）は現状維持。

対象箇所（`apps/web/public/lp/index.html`）:

- ナビの CTA ボタン
- ヒーローの CTA ボタン
- 最終 CTA セクションのボタン
- フッターの「Cairn Cloud」導線（ソーシャルアイコン・Product 列・Community 列）


## 4. 触らないもの

- `auth/login` / `auth/signup` / `onboarding` / `invite/[token]` のパスと中身
- ログイン後の `/projects` 誘導ロジック
- `/projects` 等のハードコード参照（約 100 箇所）— 遷移先は変わらないため修正不要


## 5. 影響範囲

| 対象 | 影響 | 備考 |
|---|---|---|
| `middleware.ts` | 修正 | `/` の公開化（rewrite）+ 認証済みの誘導分岐 + 旧 `/lp` URL のリダイレクト |
| `app/page.tsx` | 変更なし | middleware が `/` を常に横取りするため未到達（フォールバックとして残置） |
| `(app)/*` | なし | 認証シェル内は不変 |
| `auth/*`, `onboarding/*`, `invite/*` | なし | パス・遷移先とも不変 |
| `public/lp/index.html` | CTA リンク変更 | `#demo` → `/auth/login`、ラベル変更 |
| `/projects` 等のハードコード参照 | なし | 遷移先が変わらない |
| OGP / SEO / sitemap | 未着手 | 別タスク |


## 6. 検討した代替案と却下理由

### ログイン画面を `/login` にリネームする案 → 見送り

- `/auth/login` への参照が約 33 箇所あり、OAuth コールバックやメール内リンクの確認も含めて書き換え範囲が広い
- 得られる利益（URL の見栄え）に対してコストとリスクが見合わない
- 結論: **`/auth/login` のまま**とし、LP の CTA から `/auth/login` にリンクする

### `/` を据え置き、LP を `/lp` のまま運用する案 → 却下

- 「トップページが LP」という本来の目的（SEO・第一印象）を満たさない

### LP を React で作り直す案（B案） → 見送り（今回は不採用）

- 既存の静的 LP（ダークテーマ・日英切替・features/open-source/self-hosted/enterprise/docs 構成）を活かせる rewrite 方式のほうが工数が小さく、デザイン移植リスクもない
- React 化は LP の中身を大きく作り替えるタイミングで再検討する


## 7. 今後の進め方（PR2 以降）

- CTA 接続・コピー・料金導線・OGP・sitemap などを段階投入
- LP のデバイス出し分けが必要になった場合は、単一レイアウト（現状）から `x-device` ベースの出し分けへの移行を再検討


## 8. 受け入れ条件（PR1・実装済み）

- [x] 未認証ユーザーが `/` にアクセスして LP が表示される（`/auth/login` に飛ばされない）
- [x] 認証済みユーザーが `/` にアクセスすると `/projects` にリダイレクトされる
- [x] 未認証ユーザーが `/projects` 等の保護ルートに来たら従来どおり `/auth/login` に飛ぶ
- [x] ログイン後の `/onboarding` / `/projects` 振り分けが従来どおり動く
- [x] LP が `(app)` の認証前提コンテキストに依存していない（静的アセットのため無関係）
- [x] 旧 `/lp/*` URL が `/` にリダイレクトされ、公開 LP が `/` の1つに集約されている
- [x] LP の主要 CTA（旧「Try Demo」）が `/auth/login` に遷移する（`#demo` アンカー止まりでない）
