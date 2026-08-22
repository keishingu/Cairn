# 本番デプロイ・運用リファレンス

> ステータス: **現行リファレンス** ／ 最終更新: 2026-07-22
>
> 本番環境（Vercel + Supabase）の構成・残タスク・将来の一般公開に向けた設定をまとめる。
> 実装・設定が変わったら本ファイルを更新すること。

## 環境構成

| 環境          | Supabase                                                        | Vercel     | ドメイン                             | デプロイ契機                               |
| ------------- | --------------------------------------------------------------- | ---------- | ------------------------------------ | ------------------------------------------ |
| 本番          | `cairn-production`（Pro / Tokyo / ref: `bmhcgjqisqnyvbrrvqug`） | Production | `https://oss-cairn.com`              | `main` への merge                          |
| 検証          | `cairn-preview`（Free / Tokyo）                                 | Preview    | `https://develop.oss-cairn.com`      | `develop` への merge                       |
| PR プレビュー | `cairn-preview`（Free / Tokyo）                                 | Preview    | （Vercel 自動採番 preview ドメイン） | PR 作成、または `@vercel preview` コメント |

## デプロイパイプライン

Vercel の Git 連携（GitHub）で常設環境をデプロイする。PR Previewは GitHub Actions からVercel CLIでデプロイする。

- **`main` への merge → 本番デプロイ**: Vercel の **Production Branch = `main`**。Production 環境変数で `https://oss-cairn.com` にリリースされる。
- **`develop` への merge → 検証デプロイ**: `develop` は Vercel の Preview デプロイ。**`develop.oss-cairn.com` を `develop` ブランチに割り当て**ており、**環境変数は Preview と共通**（PR プレビューと同じ `cairn-preview` を指す）。
- **PR → プレビューデプロイ**: PR作成時に `.github/workflows/vercel-preview.yml` がVercel自動採番の Preview URLへデプロイする。以降のpushはスキップし、最新SHAの確認が必要になったら権限のあるメンバーがPRへ `@vercel preview` とコメントする。

### PR更新時のビルドスキップ

Vercel の Ignored Build Step（`apps/web/vercel.json` の `ignoreCommand`）で、Git連携によるPRの自動buildをスキップする。Production、`develop`、`main` は常にbuildし、実行コンテキストが判定できない場合も安全側に倒してbuildする。

- Vercel ProjectのRoot Directoryは `apps/web` のため、`vercel.json` も同ディレクトリに置き、ignore commandはそこを起点にrepository rootの判定scriptを参照する
- `.github/workflows/vercel-preview.yml` は同一repository内のPR作成、または完全一致の `@vercel preview` コメントを受け、openなPRの最新SHAをデプロイする
- CLI deployの結果は同じSHAのGitHub Preview Deploymentへ記録し、Mobile Previewが成功URLを取得できるようにする
- 公開repositoryから任意のbuildを起動されないよう、コメント投稿者は `OWNER` / `MEMBER` / `COLLABORATOR` に限定し、fork PRは拒否する
- GitHubの `Preview` environmentに、`VERCEL_TOKEN`をsecret、`VERCEL_ORG_ID`と`VERCEL_PROJECT_ID`をvariablesとして登録する
- Mobile PreviewはPR作成時からWebView / API接続先に `https://develop.oss-cairn.com` を使う。PR固有の `*.vercel.app` はDeployment Protectionのログイン画面へ遷移し得るため、モバイル接続先には使わない

### DBマイグレーションの自動適用（GitHub Actions）

`develop` / `main` への push 時に `.github/workflows/migrate.yml` が `supabase db push --include-all` を実行し、未適用マイグレーションを自動適用する（`develop` → `cairn-preview`、`main` → `cairn-production`）。手動でのローカルからの `db push` は不要。

- **タイミング（順序は保証されない）**: `migrate.yml` と Vercel の Git 連携デプロイは、どちらも `main` への同じ push イベントに反応する**独立したトリガー**であり、Actions 側が先に完了することを仕組みとして保証してはいない。実運用では db push（数秒）が Vercel の本番ビルド（数分）より先に終わることが多く「新コード × 旧スキーマ」の期間は縮まるが、Actions のキュー詰まり・リトライ・失敗時にはこの前提が崩れうる。**厳密に順序を保証したい場合は、Vercel Production Branch の自動デプロイを無効化し、`migrate.yml` の成功後に Vercel Deploy Hook を叩いて本番デプロイを起動する構成に変更する必要がある**（未実施）。それまでは「旧コード × 新スキーマ」の期間（後方互換を前提にビルド完了まで数分）に加え、まれに「新コード × 旧スキーマ」の期間が残りうる点に注意する。
- **後方互換が前提**: 上記の数分間も旧コードが動くため、マイグレーションは後方互換（テーブル追加・カラム追加・インデックス追加等）を基本とする。**破壊的変更（カラム削除・リネーム・NOT NULL 化等）は 2 段階リリース**で行う — まずコード側の参照をやめてリリースし、次のリリースでスキーマを落とす。
- **事前検証（4段構え）**:
  1. `develop` マージ時に preview DB へ**実適用**されるため、SQL の実行エラーは本番より先に検出される
  2. リリースワークフロー（`release.yml`）は開始直後に、**develop 側の DB Migrate 実行結果**（GitHub Actions API で該当コミットの `migrate.yml` 実行を照会）を確認する。未完了・失敗ならリリースPRを作らず中断する（`dry-run` は SQL を実行しないため、実際に preview へ適用できたかはこの確認でのみ担保される）
  3. 続けて本番DBへ **dry-run** し、適用予定一覧を Release PR 本文に記載する。接続不可・履歴不整合なら PR を作らず中断する
  4. `main` 宛 PR では `.github/workflows/migration-dry-run.yml` が PR チェックとして 2. と 3. を再実行する（リリースPRが open の間に develop へ push が積まれ synchronize で再トリガーされても、その新しい develop HEAD について develop 側 DB Migrate の成功確認と本番DB dry-run の両方をやり直す）。**このジョブは head branch が `develop` かつ同一リポジトリの場合のみ実行する**（`pull_request` イベントは同一リポジトリのブランチには secrets を渡すため、それ以外のブランチから `main` 宛に PR が作られても本番 Secret を使わせないためのガード）

### Secret の管理（GitHub Environments 必須）

`SUPABASE_DB_URL_PRODUCTION` / `SUPABASE_DB_URL_PREVIEW` は**リポジトリ Secret ではなく GitHub Environment の Secret として登録する**。理由: `migrate.yml` の `workflow_dispatch` はブランチを選んで任意のブランチ上のワークフロー内容で実行できてしまうため、そのブランチ上で改変されたスクリプト（例: ガード用の `case` 文を削除したもの）が動くと、ジョブ内のロジックだけでは Secret 漏洩を防げない。Environment の **Deployment branch policy** は、ワークフローファイルの内容にかかわらず GitHub 側が「実際にこのジョブがどの ref で実行されているか」を検証するため、対象ブランチ以外では Secret 自体が渡らない。

**設定手順**（Settings → Environments）:
1. Environment `production` を作成し、Secret `SUPABASE_DB_URL_PRODUCTION` を登録する。**Deployment branches and tags** を `Selected branches and tags` にし、`main`・`develop`・**`refs/pull/*/merge`** を許可する（`develop` は `release.yml` の本番DB dry-run に、`refs/pull/*/merge` は `migration-dry-run.yml` の PR チェックに必要。理由は後述）。
2. Environment `preview` を作成し、Secret `SUPABASE_DB_URL_PREVIEW` を登録する。**Deployment branches and tags** は `develop` のみ許可する。
3. 旧リポジトリ Secret（Settings → Secrets and variables → Actions）に同名のものが残っていれば削除する（残っていると Environment 未参照のジョブにも渡ってしまう）。
4. `migrate.yml` は `environment: ${{ github.ref_name == 'main' && 'production' || 'preview' }}` で分岐、`release.yml` と `migration-dry-run.yml` は `environment: production` を参照する。`main` / `develop` 以外のブランチで `migrate.yml` / `release.yml` を動かそうとすると、Deployment branch policy 違反でジョブが失敗し Secret は渡らない。

**`migration-dry-run.yml`（`pull_request` トリガー）は Environment のブランチ名ベースの制限が効かない**: GitHub は `pull_request` 系イベントでは Environment のブランチポリシーを `refs/pull/<番号>/merge`（PR の head/base どちらでもない合成 ref）に対して評価する。このジョブが Secret を受け取るには `production` Environment の許可リストに `refs/pull/*/merge` を含める必要があるが、このパターンは **PR の送信元ブランチを区別しない**（`main` 宛のどの PR でもマッチする）。そのため `migration-dry-run.yml` の実質的な防御は、前述の `github.head_ref == 'develop'` という `if` ガードのみになる。この `if` はワークフロー実行時の実際の PR メタデータを見ているため「develop 以外のブランチから何もしない PR を main に作る」ケースは防げるが、**同一リポジトリの書き込み権限を持つ人が、自分のブランチ上でこの `if` ガードごとワークフローファイルを改変した場合は防げない**（`pull_request` は fork でない限り secrets を渡すため）。これは GitHub Actions の `pull_request` イベント自体の制約であり、確実に防ぐには `pull_request_target`（常にデフォルトブランチのワークフロー定義で実行される）への変更や、書き込み権限を持つコラボレーターの信頼範囲の見直しが必要になる（未対応）。

- **必要な Secrets**: `SUPABASE_DB_URL_PRODUCTION`（`production` Environment）/ `SUPABASE_DB_URL_PREVIEW`（`preview` Environment）
  - **Session Pooler（ポート 5432）** の接続文字列を使う: `postgresql://postgres.<ref>:<password>@aws-X-ap-northeast-1.pooler.supabase.com:5432/postgres`
  - GitHub-hosted runner は IPv4 のみのため、Direct connection（IPv6 専用）は使えない。Transaction pooler（6543）もマイグレーションには不可
  - パスワードに記号が含まれる場合は URL エンコードする
- **初回導入時**: `supabase migration list --db-url <URL>` で remote のマイグレーション履歴が `supabase/migrations/` と整合しているか確認する（履歴に記録の無い適用済みマイグレーションがあると `db push` が再適用を試みて失敗する）
- **適用失敗時**: Actions が fail する（Vercel のデプロイ自体は止まらない点に注意）。原因を修正して再 push するか、**DB Migrate** ワークフローを `workflow_dispatch` で手動再実行する。

### Vercel ダッシュボード設定（この振り分けの前提）

リポジトリだけでは完結しないため、以下は Vercel ダッシュボードで設定する。

1. **Settings → Git → Production Branch** を `main` にする。
2. **Settings → Domains** で `develop.oss-cairn.com` を追加し、**Git Branch を `develop`** に割り当てる（Preview デプロイに固定ドメインを紐付ける）。DNS は `oss-cairn.com` のサブドメインとして CNAME を Vercel に向ける。
3. `develop` は Production Branch ではないため、ビルド時に自動で **Preview 環境変数**が使われる（本番と分離するための追加設定は不要）。

### GitHub 設定（ブランチ運用の前提）

- **Settings → Branches → Default branch** を `develop` にする。これにより新規ブランチの起点と PR のデフォルト先が `develop` になる。本番反映は `develop` → `main` の PR で行う。

### 接続・キーの方針

- **PostHog**: Vercel の **Production のみ**に `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` と `NEXT_PUBLIC_POSTHOG_HOST` を設定する。ローカルと Preview には設定せず、SDK を初期化しない。これはデプロイ環境の接続設定として扱い、事業判断による公開制御用の Feature Flag には含めない。
- **アプリ実行時 `DATABASE_URL`（Vercel）**: Transaction pooler の **Shared Pooler / IPv4**（ホスト `aws-X-ap-northeast-1.pooler.supabase.com:6543`、ユーザー `postgres.<ref>`）。
  - Direct connection（`db.<ref>.supabase.co`）は **IPv6 専用で Vercel(IPv4) から繋がらない**ため使わない。
  - Drizzle のドライバには `node-postgres` を使う。pool は `max: 1`、`idleTimeoutMillis: 20000`、`connectionTimeoutMillis: 10000`、`query_timeout: 30000` とし、クエリを1接続上で直列化する。`postgres.js` の pipelining は Supavisor Transaction mode で応答が失われる場合があるため使わない。
- **マイグレーション `supabase db push`**: GitHub Actions（`migrate.yml`）が **Session Pooler（5432）** 経由で自動適用する（前述）。手動で適用する場合も `--db-url` を明示して Session Pooler（IPv6 環境なら Direct も可）で実行する（CLI の link は preview のまま）。
- **`SUPABASE_SERVICE_ROLE_KEY`**: **Legacy service_role JWT（`eyJ...`）** を使う。
  - 新形式 `sb_secret_...` は **Storage が JWT を要求するため `Invalid Compact JWS` で失敗**する。
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**: 新形式 `sb_publishable_...`（Auth は新形式で動作）。

### 環境設定と Feature Flag の境界

環境ごとの外部サービス接続や認証情報は、Vercel / EAS の環境変数スコープで制御する。Feature Flag は、システムとして提供可能な機能について「市場へいつ・誰に公開するか」を事業判断で制御するために使う。

- **環境変数を使うもの**: production 専用の外部サービス、接続先 URL、API token、環境別 project ID など。対象環境に値が存在すること自体を有効化条件にする
- **Feature Flag を使うもの**: 実装と運用準備は完了しているが、Go-to-Market、段階公開、契約・届出、ユーザーセグメント等の理由で公開を制御する機能
- **併用する場合**: 外部サービスへの接続可否は環境変数、ユーザーへの機能公開可否は Feature Flag と、責務を分ける。接続情報の有無を Feature Flag で代用しない

PostHog は production の利用状況を収集するインフラ接続なので前者に該当する。Vercel Production のみに project token を設定し、独立した Feature Flag は設けない。

## リリース手順（develop → main）

`develop` の内容を本番（`main`）へリリースする手順。リリースノート生成・Release PR・Draft Release の作成は `.github/workflows/release.yml`（手動実行）が担う。**順序が重要**で、必ず「PR マージ → その後に Draft を Publish」で行う。

1. **リリースワークフローを手動実行**
   - GitHub の **Actions** タブ → **`Release (develop → main)`** → **Run workflow**。
   - （任意）入力 `release_tag` にタグ名（例 `v1.1.0`）。空なら `release-YYYY-MM-DD` で自動採番。
   - 本番DBへマイグレーションの **dry-run** が走り、失敗するとリリースPRを作らず中断する。適用予定のマイグレーション一覧は PR 本文の「DBマイグレーション」欄に記載される。
   - 生成物: **Release PR（develop → main、本文は AI 生成ノート + マイグレーション一覧）** と **Draft Release（AI 生成ノートのみ。※この時点ではタグ未作成）**。
   - ノートは利用ユーザー向けに絞り込む（docs/CI/テスト/依存・設定のみのコミットは除外。全差分が除外パスのみなら汎用のメンテナンス文）。
2. **Release PR を `main` にマージ**
   - CI・**Migration Dry-run** チェックと Vercel プレビューを確認してマージ。`main` が `develop` の内容に更新されると、**DB Migrate ワークフローが本番DBへマイグレーションを自動適用**し、並行して Vercel が本番デプロイする。両者は同じ push イベントに反応する独立したトリガーで、順序は保証されない（詳細・注意点は前述の「タイミング」節を参照）。
   - マージ後は **Actions の DB Migrate が成功したことを確認**する。失敗していた場合は修正 or `workflow_dispatch` で再実行する。
3. **Draft Release を Publish**（※必ずマージ後）
   - **Releases** ページ → Draft を **Edit** → **Target: main** を確認（Publish 時に `main` の HEAD からタグが作られる）。
   - 必要ならタグ名・タイトルを `v1.1.0` 等に調整して **Publish release**。

- **順序が命**: マージ前に Publish すると promote 前のコミットにタグが付く（Draft 本文の先頭にも同じ警告が出る）。
- Draft 段階ではタグ ref を持たないため、やり直したい場合は同名タグで再実行してよい。

## 完了済み（本番）

- DB マイグレーション 0000〜0034（欠番だった 0030 も `--include-all` で適用済み）
- pgvector 拡張・Storage バケット・Realtime（Broadcast from Database）トリガー/RLS（すべて migration 由来）
- `DATABASE_URL` を Shared Pooler/IPv4 に修正し疎通確認
- `SUPABASE_SERVICE_ROLE_KEY` を Legacy JWT にしてファイルアップロード成功
- Inngest（メッセージ通知）動作
- Google ログイン（Supabase Auth Provider）動作
- 独自ドメイン `oss-cairn.com` を Vercel に接続（apex A レコード + www CNAME、Squarespace 既定値は削除済み）

## 短期 ToDo

- [ ] **PR #142（pdf-parse の ENOENT 修正）を本番にマージ＆デプロイ** → PDF インデックスの動作確認
- [ ] Auth → URL Configuration の Site URL / Redirect URLs が本番ドメインになっているか最終確認
- [ ] Google カレンダー連携（`GOOGLE_CALENDAR_*`）を使うなら本番設定
  - Google Calendar API 有効化 / OAuth クライアントに `https://oss-cairn.com/api/calendar/google/callback` を登録 / Vercel に 3 変数設定
- [ ] `CALENDAR_TOKEN_ENCRYPTION_KEY` を本番用に新規生成して Vercel(Production) に設定（鍵はバックアップ）
- [ ] Inngest の Production 環境キーを Preview と分離し、本番 serve エンドポイント（`https://oss-cairn.com/api/inngest`）を Sync

## 限定公開 → 一般公開（不特定多数）に必要な設定

現在は **限定公開（自分たち中心 / テストユーザー）で運用可能**。広く一般に開放する際は以下が必要になる。

### 1. Google OAuth 同意画面の公開・検証

- 同意画面を **「テスト」→「本番環境に公開」** にする（テストモードは利用者がテストユーザー登録した人に限られ、最大 100 人）。
- **ログイン用スコープ（`openid`/`email`/`profile`）は非機密** → ブランド検証（ロゴ・ドメイン確認）程度で済む。
- **カレンダー用スコープ（`calendar.readonly`）は機密スコープ** → **Google の審査（verification）が必要**。
  - 要件: 本番ドメイン上の**プライバシーポリシー・利用規約ページ**、アプリ説明、スコープ使用理由、デモ動画など。
  - 未審査のままだと「未確認アプリ」警告 + 100 ユーザー上限。

### 2. Supabase Custom Domain（任意・信頼性向上）

- Google ログイン/同意画面に出る `bmhcgjqisqnyvbrrvqug.supabase.co` を自前ドメイン（例 `auth.oss-cairn.com`）に置き換える。
- **Custom Domains アドオン（~$10/月）**。機能には影響しないため限定公開中は不要。
- 切替時の追従: DNS に Supabase 指定 CNAME 追加 / Google の承認済みリダイレクト URI を新ホストに変更 / Vercel の `NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_URL` を新ホストに変更して再デプロイ。

### 3. 本番用 SMTP（メール送信）

- Supabase のデフォルト SMTP は**本番不可レベルのレート制限**（数通/時）。
- サインアップ確認・パスワードリセット等を不特定多数に送るなら、**カスタム SMTP（SendGrid / Resend / SES 等）** を Auth に設定。
- メールテンプレート内 URL が本番ドメインで動くか確認。
- 具体的な導入手順（Resend をカスタム SMTP にする設定・DNS 検証・ローカル/本番の差分）は [`resend-email-provider-design.md`](./resend-email-provider-design.md) を参照。

### 4. プライバシーポリシー・利用規約ページ

- `oss-cairn.com` 上に公開ページを用意（Google 審査・同意画面・ユーザー信頼の前提）。

### 5. 不正対策・スケール

- Supabase Auth の **Attack Protection / CAPTCHA（hCaptcha・Turnstile）**、レート制限の見直し。
- **Compute スケール**: 初期は Micro。負荷が上がったら拡張（コネクション数・RAM/CPU）。
- **バックアップ**: 重要度が上がったら PITR（Point-in-Time Recovery）アドオンを検討。

### 6. （任意）OAuth クライアントの環境分離

- 本番 / プレビューで Google OAuth クライアントを分離し、鍵のローテーション・影響範囲を分離。
