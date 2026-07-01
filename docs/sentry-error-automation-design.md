# Sentry エラー検知 → GitHub issue → 修正PR 自動化 設計メモ（ドラフト）

> ステータス: 設計時スナップショット（実装前の合意メモ）
> 目的: Sentry が検知したランタイムエラーを起点に、「GitHub issue 化 → AI が修正 PR → 人間が merge → 再発監視」の
> ループを自動化する。既存の [`docs/ai-self-improvement-loop.md`](ai-self-improvement-loop.md) の姉妹ドキュメントであり、
> あちらの intake 源（改善提案チャンネル / PostHog）に対して、本書は **「ランタイムエラー（定量・自動検知）」の intake 源**を追加する位置づけ。
> ラベル体系・SOUL/禁止ゾーンのゲート・「merge は人間」の原則はそちらと共有する。
>
> 前提スタック: Next.js 15 / Supabase(PostgreSQL) / Inngest / Vercel AI SDK(OpenAI) / GitHub / **Claude Code GitHub Action**。
> 対象アプリ: `apps/web`（Next.js）/ `apps/mobile`（Expo）/ `apps/desktop`（Electron）の 3 面すべて。

---

## 0. 基本方針

- **Sentry issue を「エラー台帳」の中心に置き、GitHub issue と 1:1 で紐付ける**。透明・監査可能。
- AI は **triage（issue 化）と修正案（PR）までを担い、最終判断（merge・却下）は人間**が行う。
- **入口で徹底的にノイズを削る**。全エラーを issue 化すると issue/PR を量産して破綻する。冪等性（重複排除）が生命線。
- **禁止ゾーン（認証 / 権限 / 課金 / DB マイグレーション）は AI に自動修正させない**。issue は立てるが `needs-human` 止まり。自己改善ループの `soul.policy.yaml` をそのまま流用する。
- **修正エージェントは Claude Code GitHub Action**。このリポジトリの `CLAUDE.md` / `AGENTS.md` がそのまま Fix Agent への憲法として効く（製品運用と同じ系譜）。
- **プライバシー優先**。stacktrace / breadcrumb に混入しうる PII は Sentry 側スクラブ + issue 貼付前マスキングの二段で防ぐ。

段階は自己改善ループと同じ **Sense → Recall → Reason → Gate → Act → Learn** の 6 段で捉える。

---

## 1. 全体フロー

```text
[Sentry] エラー発生・集約（web / mobile / desktop の各 project）
   │  Alert Rule（新規fingerprint / 頻度 / 影響ユーザー数）でフィルタ
   ▼
[Webhook] POST /api/webhooks/sentry  ── 署名検証
   │  inngest.send('sentry/issue.alerted')  ← 即 200、重い処理は Inngest へ
   ▼
[Triage Agent]（Inngest function）
   │  Recall : sentry_issue_links 台帳で dedup（既存 issue があれば追記）
   │  Reason : enrich（stacktrace / breadcrumb / release / suspect commit / 該当コード）
   │           + LLM 分類（level L0-L2 / severity / auto_fixable / 根本原因仮説）
   │  Gate   : SOUL / 禁止ゾーン判定 → ready-for-ai か needs-human か
   ▼
[GitHub issue] 新規作成 or 既存 issue にコメント追記
   │  label: source:sentry, level:*, ready-for-ai | needs-human
   ▼
[Fix Agent] Claude Code GitHub Action が ready-for-ai を拾う
   │  ブランチ + 修正 + 根本原因分析 + テスト → PR（宛先 develop）
   │  CI: typecheck / lint / test + Implementation ゲート（禁止ゾーン差分検知）
   ▼
[人間レビュー] committer が merge  ← 最終ゲート。ここは自動化しない
   ▼
[deploy] Vercel（develop → develop.oss-cairn.com）→ 次リリースで regression 監視
   ▼
[loop close] 同 fingerprint が消えたら Sentry resolve + GitHub issue close + 台帳更新
             再発したら reopen + needs-human
```

---

## 2. Sense — Sentry 導入と intake

### 2-1. Sentry のセットアップ（前提工事）

**3 アプリそれぞれに SDK を入れる。Sentry の project も 3 つ（または environment で分離）に分ける**。

| アプリ | SDK | 備考 |
|---|---|---|
| `apps/web` | `@sentry/nextjs` | `instrumentation.ts` + client / server / edge の 3 面。Vercel デプロイ時に source map 自動アップロード（`withSentryConfig`） |
| `apps/mobile` | `@sentry/react-native`（Expo 対応） | ネイティブチャット / OAuth など**ネイティブ実装部分**が対象。WebView 内は web project 側で捕捉されるため二重計上に注意（WebView 由来は tag で区別） |
| `apps/desktop` | `@sentry/electron` | main / renderer プロセス両方。renderer が web を表示する部分は web project と重複するため、desktop 固有（Electron main・IPC・自動更新等）を主対象にする |

- **release = git SHA を必ず紐付ける**（`SENTRY_RELEASE`）。これで Sentry の「Suspect Commits」が効き、Fix Agent に渡す「怪しいコミット / ファイル」の精度が上がる。mobile はアプリバージョン + build number、desktop はアプリバージョンで release を定義する。
- **environment** を `production` / `preview`（develop） / `development` で分ける。自動修正の対象は原則 `production`（と develop）に限定。
- **WebView 二重計上対策**: mobile / desktop の WebView は web project でも捕捉される。`tags: { surface: 'mobile-webview' | 'desktop-webview' | 'web' | 'mobile-native' | 'desktop-native' }` を全 SDK で付与し、Triage 側で重複を寄せる。

### 2-2. ノイズを入口で削る（最重要）

全エラーを issue 化すると破綻する。**Sentry の Alert Rule で絞ってから** Webhook を出す。

- 新規 fingerprint（今まで無かったエラー）
- または「N 分で M 回以上」「影響ユーザー数 ≥ 閾値」
- `environment = production`（+ develop は別ラベル）
- `level >= error`（warning は原則除外）

さらに **無視リスト**を Sentry 側と Webhook 受信側の両方に持つ:
- サードパーティ / ブラウザ拡張由来、ネットワーク断（`Failed to fetch` 等）、ユーザー操作起因の想定内エラー。
- SDK の `ignoreErrors` / `denyUrls` + 受信側の allow/deny 判定。

### 2-3. Webhook 受信

- `apps/web/src/app/api/webhooks/sentry/route.ts` を新設。
- **署名検証必須**（`sentry-hook-signature` を `SENTRY_CLIENT_SECRET` で HMAC 検証）。失敗は 401。
- 受信後は軽量な正規化だけして `inngest.send('sentry/issue.alerted', {...})` し即 200。重い処理は Inngest 側（既存 Webhook 群と同じ流儀。`apps/web/src/app/api/inngest/route.ts` に function を登録）。
- ペイロードは Zod で検証（`packages/shared` のスキーマ規約に合わせる）。

---

## 3. Recall — 重複排除の台帳

自動化の最大の失敗モードは「**同じエラーで issue と PR を量産する**」こと。台帳テーブルで冪等化する。

`packages/db/src/schema/` に追加（Drizzle が正 → `pnpm db:generate` → migration）:

```
sentry_issue_links
  sentry_issue_id      text   PK   -- Sentry の issue.id（fingerprint 束）
  sentry_project       text        -- web / mobile / desktop
  github_issue_number  int    null
  github_pr_number     int    null
  state                enum        -- received / triaged / issue_opened / ready_for_ai
                                   --  / in_pr / merged / resolved / wontfix / gate_rejected
  fingerprint          text
  surface              text        -- web / mobile-native / desktop-native / *-webview
  first_seen_at        timestamptz
  last_alerted_at      timestamptz
  attempt_count        int         -- Fix Agent 試行回数（暴走防止の上限）
  created_at / updated_at
```

- Triage は必ずこの台帳を引く。**既存 issue があればコメント追記（再発回数 / 影響数を更新）**、無ければ新規作成。
- `attempt_count` に上限（例: 2）。超えたら `needs-human` にして自動修正を止める。
- Sentry の `regression`（resolved が再発）は既存 GitHub issue を reopen し `needs-human`。
- **注**: CLAUDE.md の方針どおり `packages/db` にはテストを書かない（DB 接続が必要なため）。

---

## 4. Reason — Triage Agent（Inngest function）

`sentry/issue.alerted` を購読する新 Inngest function。既存 function（`onMessageCreated` 等）と同様に `step` 分割する。

1. **dedup**: `sentry_issue_links` を照会。既存なら「追記モード」、新規なら「作成モード」。WebView 由来の重複は surface tag で web 側に寄せる。
2. **fetch-context**: Sentry API で issue 詳細を取得（最新イベント / stacktrace / breadcrumbs / tags / release / suspect commits / 発生数 / 影響ユーザー数）。
3. **locate-code**: stacktrace の **in-app フレーム**からリポジトリのファイル / 行を特定し、周辺コードを収集（GitHub の該当ファイル取得。pgvector ではなくコード位置特定が要る）。mobile / desktop フレームは各アプリのソースにマップする。
4. **scrub-pii**: issue 本文に載せる前に PII をマスキング（§5）。
5. **classify（LLM）**: OpenAI（既存 `@/lib/ai/client`）で以下を判定。
   - `level`: L0(文言 / 軽微) / L1(null ガード・設定・軽微なロジック) / L2(要ロジック変更)
   - `auto_fixable`: bool（AI が安全に直せるか）
   - 根本原因の仮説・再現条件・修正方針の下書き
6. **gate**: SOUL / 禁止ゾーン判定（§5）。
7. **create-issue**: GitHub API / MCP で issue 作成 or 追記。台帳を更新。

> Sentry issue に `assigned_to` / `ignored` が付いていればスキップ（人間が既に対応中）。

---

## 5. Gate — 自動修正の安全弁

### 5-1. 禁止ゾーン（自己改善ループと共有）

`soul.policy.yaml` の `forbidden_zones` を流用。Sentry 由来でも触ってはいけない領域は同じ。
**グロブはこのリポの実パスに合わせて具体化する**（`**/auth/**` や root `billing/**` のような概念的パターンは、`apps/web/src/lib/get-auth-context.ts` や `apps/mobile/app/(auth)/...`、`packages/db/src/schema/billing.ts` 等の実在パスに一致せず素通りしてしまう。CI ゲート実装前にリポ固有パターンへ広げること）:

```yaml
forbidden_zones:                              # AI 自動 PR 禁止。issue は立てるが ready-for-ai は付けない
  # 権限
  - "**/permissions.ts"                       # apps/web/src/lib/permissions.ts
  # 認証（"auth" ディレクトリを持たないファイルも捕捉する）
  - "**/get-auth-context.ts"                  # apps/web/src/lib/get-auth-context.ts
  - "**/fetch-with-auth.ts"
  - "apps/web/src/app/api/auth/**"
  - "apps/web/src/app/api/invite/**"          # 招待受諾・トークン検証
  - "apps/mobile/app/(auth)/**"               # ( ) 付きセグメントは **/auth/** では拾えない
  - "apps/mobile/lib/oauth.ts"
  # 課金（現状は設計のみ。実装時の想定パスを先回りで登録）
  - "apps/web/src/app/api/billing/**"
  - "packages/db/src/schema/billing.ts"
  - "**/*billing*"                            # 保険。billing を含む新規ファイルを広く捕捉
  # DB スキーマ / マイグレーション
  - "supabase/migrations/**"
  - "packages/db/src/schema/**"               # Drizzle が正。schema 変更は人間設計必須
```

> 実装時は「概念（何を守るか）」と「グロブ（どのパスか）」を分けて管理し、ディレクトリ構成が変わってもゲートが素通りしないよう、パスを追加したかを CI で検証する。理想は Sentry 由来と自己改善ループが**単一の `soul.policy.yaml` を共有参照**すること（§10-e）。

- stacktrace が禁止ゾーンのファイルを指す → issue は作るが **`needs-human` ラベルのみ**（自動 PR しない）。
- `environment != production`（develop 以外）の crash は原則自動修正しない。
- 「影響が大きすぎる / 根本原因不明」は Triage が `auto_fixable = false` を返し `needs-human`。

### 5-2. PII マスキング（プライバシー）

CLAUDE.md のプライバシー志向と整合させる。stacktrace / breadcrumb / request データに個人情報が混入しうる。

- Sentry SDK の `beforeSend` / `beforeBreadcrumb` で送信前スクラブ（メール・トークン・Authorization ヘッダ・Cookie・body の機密フィールド）。
- **GitHub issue 本文に貼る前にもう一段マスキング**（Sentry で漏れたものを二重で防ぐ）。GitHub は公開されうるため、ここは決定論的なルールベースで堅く。

---

## 6. Act — Fix Agent（Claude Code GitHub Action）

`ready-for-ai` かつ `source:sentry` の issue を対象に、**Claude Code GitHub Action** が修正 PR を生成する。

- 起動: issue に `ready-for-ai` が付いた時、または cron で未処理 issue を巡回。まずは**手動トリガー（人が issue にコマンド）で品質を見てから自動化**するのが安全。
- Fix Agent への入力（issue 本文にテンプレ化して埋める）:
  - Sentry permalink / 発生数・影響ユーザー数・release / surface（web / mobile / desktop）
  - 整形済み stacktrace（in-app フレーム）と該当コード周辺
  - 根本原因の仮説・再現条件
  - 制約: 「禁止ゾーンに触れない」「テストを足す」「なぜ直したかを PR 本文に」「対象アプリのビルド / typecheck を通す」
- **リポジトリの `CLAUDE.md` / `AGENTS.md` がそのまま Fix Agent の憲法**として効く（コミット規約・ブランチ運用・テスト方針・エラー表示方針など）。
- PR の必須項目: 元 Sentry issue リンク / GitHub issue リンク / 根本原因 / 修正内容 / 追加テスト / 再発監視方法。
- ブランチ: `fix/sentry-<issueid>-...`、宛先は `develop`（CLAUDE.md のブランチ運用）。コミットは Conventional Commits（日本語件名・体言止め）+ `Co-Authored-By` トレーラー。
- CI で **Implementation ゲート**（禁止ゾーンの差分検知）+ 既存 `pnpm typecheck` / `lint` / `test` を必ず通す。mobile / desktop は各アプリのビルド / 型チェックを対象に含める。

---

## 7. Learn — ループを閉じる & 学習

- merge → Vercel deploy → **次リリースで同 fingerprint が出なくなったら** Sentry issue を自動 resolve、GitHub issue を close、台帳を `resolved`。
- 出続けたら（regression）reopen し `needs-human`。**「AI が直したつもりで直っていない」を検知する**のが Learn の主眼。
- 採否・再発・修正までのリードタイムを台帳に蓄積し、`auto_fixable` 判定と分類プロンプトの eval（回帰テスト）に使う（自己改善ループ doc の Learn と同じ思想）。効果指標は「エラー削減 / MTTR」に限定し、人の評価指標にはしない。

---

## 8. 最小実装（PoC）— 既存スタックだけで完結

自動化度を段階的に上げる。各段で止めても価値が出る形にする。

1. **`apps/web` に `@sentry/nextjs` 導入** + release / source map。Alert Rule を「新規 error @ production」1 本だけに絞る。（mobile / desktop の SDK 導入はこの後追加）
2. `POST /api/webhooks/sentry`（署名検証）→ `inngest.send`。
3. `sentry_issue_links` テーブル + Triage Inngest function（dedup → enrich → scrub → 分類 → issue 作成）。**まずは issue 化まで**。
4. `.github/ISSUE_TEMPLATE` と label（`source:sentry` / `level:*` / `ready-for-ai` / `needs-human`）を整備。禁止ゾーンは `needs-human` 止まり。
5. **Fix Agent（Claude Code GitHub Action）を手動起動**で試す（`ready-for-ai` issue に人がトリガー）→ 品質を見て自動化。
6. merge 後の resolve / close を自動化して初めてループが閉じる。
7. （次段）mobile / desktop の SDK を追加し、surface tag で web と重複排除しながら 3 面をカバー。

段階目標: **「3 まで（自動 issue 化）」→「5（半自動 PR）」→「6（全自動ループ）」→「7（3 面対応）」**。

---

## 9. 主要な失敗モードと対策（まとめ）

| リスク | 対策 |
|---|---|
| issue / PR の量産 | `sentry_issue_links` 台帳で冪等化 + `attempt_count` 上限 + Alert Rule で入口フィルタ |
| 権限 / 課金 / 認証を AI が改変 | `forbidden_zones` → `needs-human` 止まり、CI で差分検知 |
| PII 漏洩 | `beforeSend` スクラブ + issue 貼付前マスキング（二段） |
| 直っていないのに close | 次リリースの regression 監視で reopen |
| WebView の二重計上 | 全 SDK に `surface` tag、Triage で web 側へ寄せる |
| ノイズ PR でレビュー疲弊 | merge は必ず人間、L0 / L1 から段階導入、手動トリガーから開始 |

---

## 10. 次に具体化する候補

- (a) `sentry_issue_links` の Drizzle スキーマ確定（state enum / surface / index 設計）
- (b) Sentry Webhook ペイロードの Zod スキーマ（`packages/shared`）
- (c) Triage Agent の分類プロンプト（level / auto_fixable / 根本原因）と eval セット
- (d) `.github/ISSUE_TEMPLATE` と Fix Agent 用 issue 本文テンプレ（Claude Code Action が読む前提の項目設計）
- (e) `soul.policy.yaml` の forbidden_zones を自己改善ループと共通化（1 ファイルを両フローで参照）
- (f) mobile（`@sentry/react-native`）/ desktop（`@sentry/electron`）の release 定義と surface tag 設計
