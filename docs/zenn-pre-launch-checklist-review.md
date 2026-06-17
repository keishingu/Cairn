# 「Webサービス公開前のチェックリスト」によるレビュー記録

> 作成: 2026-06-17
> 出典: [Webサービス公開前のチェックリスト（catnose99, Zenn）](https://zenn.dev/catnose99/articles/547cbf57e5ad28)
> 対象: `apps/web`（Next.js 15）コードベースの静的レビュー。本番インフラ・Supabase ダッシュボード設定・実機での動作確認は対象外。
>
> 凡例: ✅ 対応済み / ⚠️ 部分対応・要確認 / ❌ 未対応 / — 対象外（現状の機能要件では不要）

## 総括（優先度高）

1. **`drizzle-orm` に SQLインジェクションの既知脆弱性（High）** — `packages/db/package.json` で `drizzle-orm: ^0.38.3` を使用しているが、`pnpm audit` で SQL識別子の不適切なエスケープによる SQLインジェクション（[GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9)、`>=0.45.2` で修正）が検出された。`0.45.2` 以降へのアップデートを推奨。
2. **セキュリティレスポンスヘッダーが一切設定されていない** — `Strict-Transport-Security` / `X-Frame-Options` / `X-Content-Type-Options` / CSP のいずれも `next.config.ts` や `middleware.ts` に存在しない。
3. **エラー監視ツールが未導入** — Sentry 等は package.json に見当たらず、API ルートは `console.error` のみ。サーバーエラーの通知・検知の仕組みがない。
4. **カスタム 404/50x ページが存在しない** — `app/not-found.tsx` / `app/error.tsx` / `app/global-error.tsx` がなく、Next.js のデフォルト画面のまま。
5. **OGP / Twitter Card 未設定** — `app/layout.tsx` の `metadata` に `openGraph` / `twitter` フィールドがない。

---

## セキュリティ

### Cookie属性
| 項目 | 状態 | 詳細 |
|---|---|---|
| HttpOnly | ⚠️ | `apps/web/src/middleware.ts` は `@supabase/ssr` の `createServerClient` を素のオプションで使用しており、Cookie属性を明示していない。ライブラリのデフォルト（HttpOnly/Secure/SameSite=Lax）に依存している状態。明示設定を推奨 |
| SameSite | ⚠️ | 同上。ライブラリのデフォルト依存。GETで更新処理を行うエンドポイントがないかの確認も未実施 |
| Secure | ⚠️ | 同上。本番（HTTPS）では問題ないと想定されるが明示されていない |
| Domain | ✅ | カスタムDomain指定なし。サブドメイン共有のリスクなし |

### 入力値バリデーション
| 項目 | 状態 | 詳細 |
|---|---|---|
| サーバーサイドバリデーション | ✅ | `packages/shared` に Zod スキーマが集約され、API ルートで使用されている（既存の規約） |
| URLバリデーション（protocol制限等） | ⚠️ | 個別ルートでの網羅的な確認は未実施 |
| `dangerouslySetInnerHTML` | ✅ | 全文検索で使用箇所なし。チャットの Markdown 表示は `react-markdown`（`apps/web/src/components/app/markdown-content.tsx`）で `rehype-raw` 未使用のため、生HTMLは描画されない |
| SQLインジェクション | ⚠️ | コード上で `sql.raw()` 等の危険なAPIは未使用（✅）。ただし上記の **drizzle-orm 既知脆弱性（High）** が残存 |
| 予約ユーザー名/スラッグ | — | 現状、ユーザーが指定したハンドルネームを `https://example.com/◯◯` で公開する機能（公開プロフィールURL等）は見当たらないため対象外。将来的に追加する場合は要対応 |

### レスポンスヘッダー
| 項目 | 状態 | 詳細 |
|---|---|---|
| Strict-Transport-Security | ❌ | 未設定 |
| X-Frame-Options / CSP `frame-ancestors` | ❌ | 未設定（クリックジャッキング対策なし） |
| X-Content-Type-Options: nosniff | ❌ | 未設定 |
| CSP | ❌ | 未設定（要件次第のため必須ではないが検討余地あり） |

`next.config.ts` の `headers()` は `/sw.js` の `Cache-Control` のみを返しており、上記ヘッダーをグローバルに追加する余地がある。

### その他セキュリティ
| 項目 | 状態 | 詳細 |
|---|---|---|
| 退会/メールアドレス変更前の再ログイン必須化 | ⚠️ | 未確認（該当機能の実装箇所を個別に追う必要あり） |
| ユーザー依存レスポンスのCDNキャッシュ | ⚠️ | 明示的なキャッシュ誤設定は見当たらないが網羅確認はしていない |
| オブジェクトストレージの一覧公開 | ⚠️ | Supabase Storage バケットの公開/非公開設定はダッシュボード側のため、コードからは確認不可（要インフラ確認） |
| オープンリダイレクト | ✅ | `apps/web/src/app/auth/_components/social-auth-buttons.tsx` の `redirectTo` は `window.location.origin` から構築されており、ユーザー入力をそのままリダイレクト先に使っていない |
| 更新/削除の権限チェック | ⚠️ | `apps/web/src/lib/permissions.ts` にロールベースの権限ヘルパー（`requireWorkspaceOwner` 等）が集約されているのは良い設計だが、全 API ルートでの網羅的な使用確認は未実施 |
| サーバーエラーメッセージの直接表示 | ✅ | 確認した API ルート（例: `attachments/upload/route.ts`）はいずれも固定の日本語メッセージを返しており、`err.message` をそのまま返している箇所は検出されなかった |
| ファイルアップロードのバリデーション | ✅ | `apps/web/src/app/api/attachments/upload/route.ts` で MIME タイプのアローリスト・10MB のサイズ制限を実装済み |
| DB/オブジェクトストレージのバックアップ、クラウドアカウントの2FA | — | Supabase 管理のためコードからは確認不可。ダッシュボード側の設定確認を推奨 |

### ログイン
| 項目 | 状態 | 詳細 |
|---|---|---|
| メールアドレス本人確認 | — | Supabase Auth 管理（CLAUDE.mdの方針どおりアプリ側にメール送信ロジックはない）。Supabase 側の確認メール設定が有効か要確認 |
| メールアドレス列挙対策 | ⚠️ | ログイン/パスワード再設定のエラーメッセージ文言は未確認。Supabase Auth のデフォルト挙動に依存 |
| 複数ログイン方法の統合仕様 | ⚠️ | Google/Apple OAuth + メール認証の併用時の仕様は Supabase Auth 側の挙動に依存。アプリ側での明示的な仕様確認は未実施 |

### メール送信 / 決済機能
- メール送信ロジックはアプリ側に実装されていない方針（CLAUDE.md）のため、本セクションの大半は **対象外**。
- 決済機能は `docs/billing-implementation-design.md` に設計はあるが、`package.json` に Stripe 関連パッケージが見当たらず **未実装** のため対象外。実装時にこのチェックリストの決済セクションを再確認すること。

---

## SEO / OGP

| 項目 | 状態 | 詳細 |
|---|---|---|
| titleタグ | ⚠️ | ルートの `app/layout.tsx` に固定の `title: 'Cairn'` のみ。各ページごとの個別 `title` 設定は未確認 |
| canonical URL | ❌ | 設定なし |
| robots.txt / サイトマップ | — | `app/robots.ts` / `app/sitemap.ts` は存在しない。大半のページが認証必須のプライベートSaaSであるため優先度は低いが、`/lp`（マーケティングページ）がある場合はSEO観点で追加余地あり |
| OGP（`og:title` / `og:description` / `og:url` / `og:image`） | ❌ | `app/layout.tsx` の `metadata` に `openGraph` フィールドがない |
| `twitter:card` | ❌ | 同上、`twitter` フィールドもない |

---

## アクセシビリティ

| 項目 | 状態 | 詳細 |
|---|---|---|
| `<img>` の `alt` 属性 | ✅（部分確認） | 確認した箇所（`apps/web/src/components/app/chat-thread.tsx` 等）では `alt` が指定されている |
| アイコンのみの `<button>`/`<a>` の `aria-label` | ❌ | 全文検索で `aria-label` の使用は5箇所のみと非常に少なく、サイドバーやモバイルナビ等のアイコンボタンの多くにスクリーンリーダー向けラベルがない可能性が高い |

---

## パフォーマンス

| 項目 | 状態 | 詳細 |
|---|---|---|
| bundle-analyzer によるバンドルサイズ確認 | ❌ | `next.config.ts` に設定なし |
| 静的ファイルのCDNキャッシュ | ✅（前提付き） | Vercel等にデプロイする前提では `_next/static` は自動でCDN配信される。`sw.js` のみ `no-cache` を明示しており適切 |
| 画像のレイアウトシフト | ⚠️ | `next/image` を使わず生の `<img>` を使用している箇所が10ファイル存在（例: `chat-thread.tsx`, `sidebar.tsx`, `settings.tsx` 等）。確認した範囲では `width`/`height` 指定はあるが、全箇所の網羅確認はしていない |
| 過大サイズ画像の読み込み | ⚠️ | 静的解析では検出できないため実機確認が必要 |
| SQLインデックス | ⚠️ | スキーマ全体のインデックス設計レビューは未実施 |

---

## その他

| 項目 | 状態 | 詳細 |
|---|---|---|
| `<html lang="ja">` | ✅ | `apps/web/src/app/layout.tsx` で設定済み |
| サードパーティCookie依存 | ✅ | Supabase（ファーストパーティ）のみで、サードパーティCookie依存は見当たらない |
| favicon | ✅ | `apps/web/public/favicon.ico` あり |
| apple-touch-icon | ✅ | `apps/web/public/apple-touch-icon*.png` あり（カラーテーマ別に複数バリアントを用意） |
| サーバーエラーの通知/検知 | ❌ | Sentry等の導入なし。`console.error` のみで本番環境での検知手段がない |
| 404/50xページ | ❌ | カスタム `not-found.tsx` / `error.tsx` / `global-error.tsx` が存在せず、Next.jsのデフォルト画面のまま |
| Google Analytics等のアクセス解析 | — | 未導入。必要性は事業判断次第 |
| 電気通信事業者の届出（クローズドチャット） | — | チャット機能を提供しているため対象になりうる。法務確認が必要だがコードレビューの範囲外 |

---

## 推奨アクション（優先順）

1. `drizzle-orm` を `0.45.2` 以降へアップデート（既知のSQLインジェクション脆弱性対応）
2. `next.config.ts` の `headers()` に `Strict-Transport-Security` / `X-Frame-Options` / `X-Content-Type-Options` をグローバル設定として追加
3. `app/not-found.tsx` と `app/error.tsx` を実装し、トップページ等への導線を用意
4. Sentry等のエラートラッキングを導入し、サーバーエラーを検知できるようにする
5. `app/layout.tsx` の `metadata` に `openGraph` / `twitter` フィールドを追加（特に `/lp` 等のシェアされうるページ）
6. アイコンのみの操作要素に `aria-label` を付与（サイドバー・モバイルナビ等から優先的に）
7. Supabase の Cookie属性（HttpOnly/Secure/SameSite）を明示設定し、意図通りであることを確認
