# ランディングページ導入とルーティング再構成 設計

- **ステータス**: 設計時スナップショット（実装未着手）
- **作成**: 2026-06-13
- **対象**: `apps/web`（Next.js 15 App Router）

> 本ドキュメントは設計案であり、実装の現状を保証しない。矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。


## 1. 背景と目的

巷の SaaS は「`/` がランディングページ（LP）、`/login` がログイン、ログイン後は `/dashboard` 等にリダイレクト」という構成が一般的。Cairn の場合、ログイン後の入口は `/projects`。

現状の Cairn は **LP を `/lp` 配下に静的ファイルとして持つが、トップ `/` には置いていない**:

- `/`（`apps/web/src/app/page.tsx`）は無条件で `redirect('/projects')`
- 未認証ユーザーが `/` に来ると、middleware が `/auth/login` へ強制リダイレクト
- 公開 LP は `apps/web/public/lp/`（`/lp/index.html`）に既に存在するが、**トップではなく `/lp` 配下**で、`/auth/login` 等への CTA 導線も未接続

このため、トップページ（`/`）が訪問者に対して何も語らず、SEO・OGP・第一印象の起点になっていない。本設計はこれを解消し、`/` を公開 LP にする。**既存 `/lp` の扱い（再利用 / リダイレクト / 削除）も本設計のスコープに含める**（§4.4）。


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


## 3. 現状（As-Is）

### ルート構成

```
apps/web/src/app/
├── page.tsx              # redirect('/projects') — 固定リダイレクト
├── layout.tsx            # グローバルレイアウト
├── middleware.ts         # 認証ガード + x-device 出し分け
├── (app)/                # 認証済みエリア（PC/モバイルシェル、各種 Provider）
│   ├── projects/         # ログイン後の既定の入口
│   ├── dashboard/ ...
├── auth/
│   ├── login/page.tsx    # ログイン（メール/パスワード + OAuth）
│   ├── signup/page.tsx
│   └── verify-email/ ...
├── onboarding/           # ワークスペース未作成ユーザー向け
└── invite/[token]/       # 招待リンク（パブリック）
```

### 認証ガード（`apps/web/src/middleware.ts`）

```ts
const isAuthRoute = pathname.startsWith('/auth')
const isPublicRoute = pathname.startsWith('/invite') || pathname.startsWith('/lp')
const isOnboardingRoute = pathname.startsWith('/onboarding')

if (!user && !isAuthRoute && !isPublicRoute) {
  return NextResponse.redirect(new URL('/auth/login', request.url))
}
if (user && isAuthRoute && !isOnboardingRoute) {
  return NextResponse.redirect(new URL('/projects', request.url))
}
```

- `/`（ルート）は `isPublicRoute` に該当しないため、**未認証だと `/auth/login` に飛ばされ、LP を表示する余地がない**
- `isPublicRoute` の `pathname.startsWith('/lp')` は**既存の静的 LP を公開するためのコード**。`apps/web/public/lp/` に完成済みの静的 LP（`index.html` / `cairn-lp.css` / `cairn-lp.js`、ダークテーマ・日英切替・features/open-source/self-hosted/enterprise/docs 構成）が存在し、`/lp/index.html` として現に公開されている。**つまり対外的な公開 LP は既に1つ存在する**（ただしトップ `/` ではなく `/lp` 配下で、`/auth/login` 等への CTA 導線は未接続）

### ログイン後の振り分け（`apps/web/src/app/auth/login/page.tsx`）

```ts
if (inviteToken) { router.push(`/invite/${inviteToken}`); return }
const body = await (await fetch('/api/auth/setup', ...)).json()
router.push(body.needsWorkspace ? '/onboarding' : '/projects')
```


## 4. 提案（To-Be）

### 4.1 方針

`/` を `(app)` 認証シェルの**外**に置いた公開 LP にする。認証済みかどうかの分岐は、引き続き `middleware.ts` に集約する。

```
未認証ユーザー  →  /            （LP を表示）
                   /auth/login  （ログイン）
                   /auth/signup （サインアップ）
認証済みユーザー →  /            （/projects へリダイレクト）
                   /projects    （アプリ本体）
```

ログイン後 `/projects` に着地する導線は現状のまま。**変えるのは「`/` の意味」と「未認証で `/` を見られるようにする配線」だけ**。

### 4.2 変更点

#### (a) `apps/web/src/app/page.tsx` を LP に置換

- 現在の `redirect('/projects')` を削除し、LP を表示するページに変更する
- LP は**認証前提のコンテキスト（`(app)` の Provider 群）を一切要求しない**こと。`(app)/layout.tsx` の外なので構造的には満たされるが、import 依存に注意する
- ヒーロー / 機能紹介 / CTA（「ログイン」「無料で始める」→ `/auth/login`, `/auth/signup`）を持つ。初期はプレースホルダで可

#### (b) `apps/web/src/middleware.ts` の分岐修正

2 点修正する:

1. **`/` を公開ルートに含める** — 未認証でも LP を見られるようにする
2. **認証済みが `/` に来たら `/projects` へ** — LP ではなくアプリに誘導する

```ts
// 例: ルート '/' を公開しつつ、認証済みはアプリへ誘導する
const isLandingRoute = pathname === '/'
const isPublicRoute =
  pathname.startsWith('/invite') || pathname.startsWith('/lp') || isLandingRoute

if (!user && !isAuthRoute && !isPublicRoute) {
  return NextResponse.redirect(new URL('/auth/login', request.url))
}
// 認証済みユーザーは LP ではなくアプリへ
if (user && isLandingRoute) {
  return NextResponse.redirect(new URL('/projects', request.url))
}
if (user && isAuthRoute && !isOnboardingRoute) {
  return NextResponse.redirect(new URL('/projects', request.url))
}
```

> 注: `isLandingRoute` は `pathname === '/'` の**完全一致**にする。`startsWith('/')` は全パスに一致してしまうため不可。

#### (c) デバイス出し分けの扱い

CLAUDE.md の方針どおり、デバイス判定は middleware の `x-device` ヘッダーで行う（レスポンシブ CSS は使わない）。LP も以下のどちらかを決める:

- **A 案**: LP も `x-device` に乗せて PC/モバイルで別レイアウト
- **B 案**: LP だけは例外的に単一レイアウト（LP は静的訴求が中心で、アプリ本体ほど UI 差が要らないため）

初期は **B 案（単一レイアウト）** を推奨。アプリ本体の出し分け方針には影響しない。

#### (d) `apps/web/src/app/page.tsx` の中身は既存 `/lp` を再利用する

(a) の LP コンテンツは**ゼロから作らず、既存の `apps/web/public/lp/` の静的 LP を起点にする**。既に作り込まれたデザイン・コピー・日英切替があるため、第一候補は「既存資産の再利用」。具体策は §4.4 で決める。

### 4.4 既存 `/lp` の扱い（必須・新規）

> このセクションは Codex レビュー指摘（[PR #139](https://github.com/keishingu/Cairn/pull/139#discussion_r3417555380)）を反映して追加。**`/lp` を放置すると、`/` と `/lp` でコピー・CTA・SEO が食い違う公開 LP が2つ並ぶため、明示的な処理が必要**。

3 つの選択肢:

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| **A. 再利用（推奨）** | 既存 `public/lp/` の HTML/CSS/JS を `/` で配信し（rewrite もしくはファイル移設）、`/auth/login` 等への CTA を接続。`/lp/*` は `/` へ 308 リダイレクト | 作り込み済みデザインを活かせる。LP が1つに集約され重複しない | 静的 HTML を Next の page として扱う配線（rewrite / `dangerouslySetInnerHTML` 等）の検討が要る |
| B. 作り直し | `page.tsx` を React で新規実装し、`/lp/*` は削除 | App Router・shadcn/ui と一貫。i18n やテーマを React 側に寄せられる | 既存 LP のデザイン移植コストが高い |
| C. リダイレクトのみ | `/` → `/lp/` へリダイレクトし、LP は `/lp` のまま | 最小工数 | 「トップが LP」という目的を満たさず、URL が `/lp` のまま。SEO 上も不利。**非推奨** |

**推奨は A 案**（既存資産の再利用 + `/lp` を `/` に集約）。いずれの案でも、**最終的に公開 LP は `/`（実体は1つ）に統一し、`/lp` の旧 URL は `/` へリダイレクトする**ことを必須条件とする。CTA のリンク先は `/auth/login`（ログインのパス変更はしない）。

### 4.5 触らないもの

- `auth/login` / `auth/signup` / `onboarding` / `invite/[token]` のパスと中身
- ログイン後の `/projects` 誘導ロジック
- `/projects` 等のハードコード参照（約 100 箇所）— **遷移先は変わらないため修正不要**


## 5. 影響範囲

| 対象 | 影響 | 備考 |
|---|---|---|
| `app/page.tsx` | 置換 | リダイレクト削除 → LP 化 |
| `middleware.ts` | 小修正 | `/` の公開化 + 認証済みの誘導分岐 |
| `(app)/*` | なし | 認証シェル内は不変 |
| `auth/*`, `onboarding/*`, `invite/*` | なし | パス・遷移先とも不変 |
| `public/lp/*`（既存静的 LP） | 移設 / リダイレクト | §4.4 の方針に従い `/` へ集約。放置すると LP が二重化する |
| `/projects` 等のハードコード参照 | なし | 遷移先が変わらない |
| OGP / SEO / sitemap | 新規 | LP を公開する以上、別途整備が望ましい（別タスク） |


## 6. 検討した代替案と却下理由

### ログイン画面を `/login` にリネームする案 → 今回は見送り

- 一般的な SaaS の見た目には近づくが、`/auth/login` への参照が約 33 箇所あり、OAuth コールバックやメール内リンクの確認も含めて書き換え範囲が広い
- 得られる利益（URL の見栄え）に対してコストとリスクが見合わない
- やる場合は **LP 導入とは別 PR** に切り、リダイレクト（`/login` → `/auth/login`）を一定期間残す
- 結論: **`/auth/login` のまま**とし、LP の CTA から `/auth/login` にリンクする

### `/` を据え置き、LP を `/lp` のまま運用する案 → 却下

- 既存の静的 LP が `/lp` にあるため技術的には最短だが、「トップページが LP」という本来の目的（SEO・第一印象）を満たさない
- `/` と `/lp` の二重 LP を避けるため、`/lp` は §4.4 のとおり `/` へ集約・リダイレクトする


## 7. 段階的な進め方（推奨）

1. **PR1: ルーティング配線 + `/lp` 集約**
   - `page.tsx` を LP に置換、`middleware.ts` を修正
   - §4.4 A 案を採るなら、既存 `public/lp/` を `/` で配信し `/lp/*` → `/` リダイレクトを設定（プレースホルダで始める場合も `/lp` 集約は同 PR で行い、LP の二重化を残さない）
   - 未認証 `/` → LP 表示、認証済み `/` → `/projects` を確認
2. **PR2 以降: LP の中身の磨き込み**
   - CTA 接続・コピー・料金導線・OGP・sitemap などを段階投入


## 8. 受け入れ条件（PR1）

- [ ] 未認証ユーザーが `/` にアクセスして LP が表示される（`/auth/login` に飛ばされない）
- [ ] 認証済みユーザーが `/` にアクセスすると `/projects` にリダイレクトされる
- [ ] 未認証ユーザーが `/projects` 等の保護ルートに来たら従来どおり `/auth/login` に飛ぶ
- [ ] ログイン後の `/onboarding` / `/projects` 振り分けが従来どおり動く
- [ ] LP が `(app)` の認証前提コンテキストに依存していない
- [ ] 旧 `/lp/*` URL が `/` にリダイレクトされ、公開 LP が `/` の1つに集約されている


## 9. 工数目安

| スコープ | 目安 |
|---|---|
| ルーティング配線 + 既存 `/lp` 再利用（A 案・`/lp` 集約込み） | 0.5〜1 人日 |
| LP を React で作り直し（B 案） | 3〜5 人日以上（既存デザインの移植次第で変動） |
| CTA 接続・OGP・sitemap 等の磨き込み（PR2 以降） | 中（内容次第） |

> 既存の静的 LP が再利用できるため、配線だけなら作り直しより小さく収まる。デザインを React に作り直す場合のみ工数が大きくなる。


## 10. 未決事項 / 確認したいこと

- **既存 `/lp` の扱い（§4.4）**: A 案（既存資産を再利用）/ B 案（React で作り直し）のどちらにするか。推奨は A
- LP のデバイス出し分け: A 案（`x-device` で別レイアウト）/ B 案（単一レイアウト）のどちらにするか。推奨は単一レイアウト
- LP に載せる要素の確定（料金は [`pricing-plan-design.md`](./pricing-plan-design.md) と整合させる）

### 決定済み

- **ログインのパスは `/auth/login` のまま**（`/login` へのリネームはしない）。LP の CTA は `/auth/login` にリンクする
