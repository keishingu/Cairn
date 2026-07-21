# 本番デプロイ・運用リファレンス

> ステータス: **現行リファレンス** ／ 最終更新: 2026-07-01
>
> 本番環境（Vercel + Supabase）の構成・残タスク・将来の一般公開に向けた設定をまとめる。
> 実装・設定が変わったら本ファイルを更新すること。

## 環境構成

| 環境 | Supabase | Vercel | ドメイン | デプロイ契機 |
|---|---|---|---|---|
| 本番 | `cairn-production`（Pro / Tokyo / ref: `bmhcgjqisqnyvbrrvqug`） | Production | `https://oss-cairn.com` | `main` への merge |
| 検証 | `cairn-preview`（Free / Tokyo） | Preview | `https://develop.oss-cairn.com` | `develop` への merge |
| PR プレビュー | `cairn-preview`（Free / Tokyo） | Preview | （Vercel 自動採番 preview ドメイン） | PR 作成・更新 |

## デプロイパイプライン

Vercel の Git 連携（GitHub）でデプロイする。GitHub Actions 側はデプロイを行わず、CI（typecheck / lint / test）のみを担当する。

- **`main` への merge → 本番デプロイ**: Vercel の **Production Branch = `main`**。Production 環境変数で `https://oss-cairn.com` にリリースされる。
- **`develop` への merge → 検証デプロイ**: `develop` は Vercel の Preview デプロイ。**`develop.oss-cairn.com` を `develop` ブランチに割り当て**ており、**環境変数は Preview と共通**（PR プレビューと同じ `cairn-preview` を指す）。
- **PR → プレビューデプロイ**: 各 PR は Vercel 自動採番の Preview URL にデプロイされる（環境変数は Preview）。

### Webに影響しない変更のビルドスキップ

Vercel の Ignored Build Step（`vercel.json` の `ignoreCommand`）で、前回デプロイからの変更が**すべて既知の除外対象**だった場合だけ Web ビルドをスキップする。除外対象にはドキュメント、Mobile / Desktop、GitHub Actions、Supabase、テスト、AI エージェント設定など、`apps/web` の成果物を変えないパスを明示的に列挙する。

- 変更に `apps/web/**`、`packages/**`、lockfile、workspace / Turbo / Vercel / npm 設定などが1件でも含まれる場合はビルドする
- 未知のパス、変更ファイルなし、比較元 SHA の欠落・取得失敗時は、安全側に倒してビルドする（fail-open）
- Mobile-only の PR は同一 SHA の Vercel Preview が作られないため、Mobile Preview の WebView / API 接続先には `https://develop.oss-cairn.com` を使う。Web に影響する変更を含む場合は、従来どおり同一 SHA の Vercel Preview を待つ

### Vercel ダッシュボード設定（この振り分けの前提）

リポジトリだけでは完結しないため、以下は Vercel ダッシュボードで設定する。

1. **Settings → Git → Production Branch** を `main` にする。
2. **Settings → Domains** で `develop.oss-cairn.com` を追加し、**Git Branch を `develop`** に割り当てる（Preview デプロイに固定ドメインを紐付ける）。DNS は `oss-cairn.com` のサブドメインとして CNAME を Vercel に向ける。
3. `develop` は Production Branch ではないため、ビルド時に自動で **Preview 環境変数**が使われる（本番と分離するための追加設定は不要）。

### GitHub 設定（ブランチ運用の前提）

- **Settings → Branches → Default branch** を `develop` にする。これにより新規ブランチの起点と PR のデフォルト先が `develop` になる。本番反映は `develop` → `main` の PR で行う。

### 接続・キーの方針

- **アプリ実行時 `DATABASE_URL`（Vercel）**: Transaction pooler の **Shared Pooler / IPv4**（ホスト `aws-X-ap-northeast-1.pooler.supabase.com:6543`、ユーザー `postgres.<ref>`）。
  - Direct connection（`db.<ref>.supabase.co`）は **IPv6 専用で Vercel(IPv4) から繋がらない**ため使わない。
- **マイグレーション `supabase db push`**: ローカルから **Session/Direct（5432）** で実行（`--db-url` を明示し、CLI の link は preview のまま）。
- **`SUPABASE_SERVICE_ROLE_KEY`**: **Legacy service_role JWT（`eyJ...`）** を使う。
  - 新形式 `sb_secret_...` は **Storage が JWT を要求するため `Invalid Compact JWS` で失敗**する。
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**: 新形式 `sb_publishable_...`（Auth は新形式で動作）。

## リリース手順（develop → main）

`develop` の内容を本番（`main`）へリリースする手順。リリースノート生成・Release PR・Draft Release の作成は `.github/workflows/release.yml`（手動実行）が担う。**順序が重要**で、必ず「PR マージ → その後に Draft を Publish」で行う。

1. **リリースワークフローを手動実行**
   - GitHub の **Actions** タブ → **`Release (develop → main)`** → **Run workflow**。
   - （任意）入力 `release_tag` にタグ名（例 `v1.1.0`）。空なら `release-YYYY-MM-DD` で自動採番。
   - 生成物: **Release PR（develop → main、本文は AI 生成ノート）** と **Draft Release（同じ本文。※この時点ではタグ未作成）**。
   - ノートは利用ユーザー向けに絞り込む（docs/CI/テスト/依存・設定のみのコミットは除外。全差分が除外パスのみなら汎用のメンテナンス文）。
2. **Release PR を `main` にマージ**
   - CI と Vercel プレビューを確認してマージ。`main` が `develop` の内容に更新され、Vercel が本番デプロイする。
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

### 4. プライバシーポリシー・利用規約ページ
- `oss-cairn.com` 上に公開ページを用意（Google 審査・同意画面・ユーザー信頼の前提）。

### 5. 不正対策・スケール
- Supabase Auth の **Attack Protection / CAPTCHA（hCaptcha・Turnstile）**、レート制限の見直し。
- **Compute スケール**: 初期は Micro。負荷が上がったら拡張（コネクション数・RAM/CPU）。
- **バックアップ**: 重要度が上がったら PITR（Point-in-Time Recovery）アドオンを検討。

### 6. （任意）OAuth クライアントの環境分離
- 本番 / プレビューで Google OAuth クライアントを分離し、鍵のローテーション・影響範囲を分離。
