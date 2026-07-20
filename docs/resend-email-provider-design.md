# Resend メールプロバイダ導入設計

> ステータス: **設計時スナップショット** ／ 作成: 2026-07-20 ／ 実装未着手
>
> Supabase デフォルト SMTP のレート制限（数通/時）を解消するため、トランザクショナルメールの
> 送信元を **Resend** に切り替える方針と手順をまとめる。実装・設定を反映したら本ファイルを更新すること。

## 背景・課題

- Cairn のトランザクショナルメール（サインアップ確認・パスワードリセット・メールアドレス変更確認・
  マジックリンク等）は **Supabase Auth が送信を担う**。アプリ側にメール送信ロジックは持たない
  （[`CLAUDE.md`](../CLAUDE.md) の技術判断「メール機能はアプリが持たない」）。
- Supabase の**デフォルト（組み込み）SMTP は本番不可レベルのレート制限**（数通/時、かつ送信先は
  チームメンバーのみに制限される）。一般公開・不特定多数への送信では確認メールが届かず、サインアップ
  やパスワードリセットが実質機能しない。
- 対策は Supabase 公式も推奨する **カスタム SMTP の設定**。プロバイダとして **Resend** を採用できるか、
  というのが本設計の起点（[`docs/production-deployment.md`](./production-deployment.md) の
  「限定公開 → 一般公開」§3 で既に候補として言及済み）。

## 結論

**Resend は使える。** 今回のレート制限問題に対しては、**Resend を Supabase Auth のカスタム SMTP として
設定する（下記スコープ A）** のが第一候補。Resend は SMTP エンドポイント（`smtp.resend.com`）を提供して
おり、Supabase Auth の Custom SMTP にそのまま接続できる。**アプリケーションコードの変更は不要**で、
設定（`supabase/config.toml` + 本番は Supabase ダッシュボード）と DNS のみで完結する。

## スコープの整理

導入は目的によって 2 段階に分かれる。今回のレート制限対策は **A のみ**で足りる。

### スコープ A: Auth のカスタム SMTP として Resend を使う（今回の対象・アプリコード不要）

Supabase Auth が送るメール（確認・リセット・変更確認・マジックリンク・招待）の**配送経路だけ**を
デフォルト SMTP から Resend に差し替える。テンプレートやトリガーは従来どおり Supabase Auth が管理する。

- **メリット**: レート制限を即解消。アプリコードに手を入れない。CLAUDE.md の「メール機能はアプリが
  持たない」方針を維持できる。
- **前提**: Resend で**送信ドメイン（`oss-cairn.com`）の検証**（SPF / DKIM の DNS レコード追加）が必要。

### スコープ B: アプリから Resend API で任意メールを送る（将来・方針変更を伴う）

通知メール・ダイジェスト等、**Supabase Auth が送らない任意のメール**をアプリから送るケース。
`packages/core` にメール送信ポートを定義し、`apps/web` に Resend 実装を置く（ポート/アダプタ構成）。

- **注意**: これは CLAUDE.md の「メール機能はアプリが持たない」方針の**見直し**を伴う。今回の
  レート制限問題とは別テーマなので、通知メール等の要望が具体化した時点で別途設計する。
- 本ドキュメントでは A を主対象とし、B は §6 に方針だけ残す。

## Resend を選ぶ理由（他候補との比較）

| プロバイダ | SMTP 提供 | 無料枠の目安 | 備考 |
|---|---|---|---|
| **Resend** | あり（`smtp.resend.com`） | 100 通/日・3,000 通/月程度 | 開発者体験が良い。ダッシュボード・ドメイン検証が容易。小〜中規模に十分 |
| SendGrid | あり | 100 通/日程度 | 実績豊富だが管理画面が重め |
| Amazon SES | あり | EC2 経由でなければ有料（従量） | 大規模・低単価向け。設定はやや煩雑 |

Cairn の現状（限定公開〜小規模一般公開）では **Resend の無料〜低額枠で十分**。運用が軽く、独自ドメイン
検証も簡単なため第一候補とする。将来送信量が跳ねたら SES への移行も SMTP 差し替えで済む。

## スコープ A の設定手順

### 1. Resend 側の準備

1. Resend アカウントを作成し、**送信ドメイン `oss-cairn.com` を追加**する。
2. Resend が提示する **DNS レコード（SPF: `TXT`、DKIM: `CNAME`/`TXT`、推奨で DMARC）** を
   `oss-cairn.com` の DNS に追加し、Resend 側で **Verified** になるまで待つ。
   - ドメインが未検証だと送信が拒否される。ここが実質の律速。
3. **API キー**を発行する。SMTP 接続では、
   - `host = smtp.resend.com`
   - `port = 587`（STARTTLS。465 の SMTPS も可）
   - `user = resend`
   - `pass = <Resend API キー>`
   - として使う（Resend の SMTP は「ユーザー名 `resend` / パスワードに API キー」）。
4. 送信元アドレス（例 `no-reply@oss-cairn.com`）を決める。**検証済みドメイン配下**である必要がある。

### 2. ローカル（`supabase/config.toml`）

ローカルの Supabase はデフォルトで Inbucket（メールテスト用の受信ボックス、`http://127.0.0.1:54324`）に
メールを溜めるため、**通常ローカルでは実 SMTP は不要**。ただし Resend 経由の実送信をローカルで検証したい
場合のみ、`[auth.email.smtp]` を追加する。API キーは**コミットせず** `env()` で渡す。

```toml
# supabase/config.toml の [auth.email] の直後などに追加（検証時のみ有効化）
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 587
user = "resend"
pass = "env(RESEND_SMTP_PASSWORD)"   # Resend の API キーを環境変数で渡す
admin_email = "no-reply@oss-cairn.com"
sender_name = "Cairn"
```

- `RESEND_SMTP_PASSWORD` は各自のローカル環境変数（`.env` 等、Git 管理外）で設定する。
- 平常のローカル開発では `enabled = false` かコメントアウトのままにして **Inbucket を使う**
  （実メールを飛ばさない）。CLAUDE.md の「エラーは握りつぶさない」方針と同様、検証目的が明確なときだけ
  実送信に切り替える。

### 3. 本番・検証（Supabase ダッシュボード）

本番（`cairn-production`）・検証（`cairn-preview`）は `config.toml` ではなく **Supabase ダッシュボード**で
設定する（config.toml の Auth 設定はローカル用で、リモートには自動適用されない）。

- **Authentication → Emails → SMTP Settings** で **Enable Custom SMTP** をオンにし、上記の
  host / port / user（`resend`）/ pass（API キー）/ Sender email / Sender name を入力する。
- **Rate limits**（Authentication → Rate Limits）でメール送信レートを Resend の枠に合わせて調整する。
- **メールテンプレート内の URL が本番ドメインで動くか**確認する（`{{ .ConfirmationURL }}` 等が
  `https://oss-cairn.com` を指すよう Auth の Site URL / Redirect URLs を整合させる。§3 ToDo と重複確認）。
- API キーは**ダッシュボードに直接入力**し、リポジトリには置かない。ローテーション時は Resend で
  再発行 → ダッシュボード更新。

### 4. 動作確認

- 本番/検証で新規サインアップ・パスワードリセットを実行し、Resend ダッシュボードの **Logs** に
  送信が記録され、受信箱にドメイン検証済み（SPF/DKIM pass）で届くことを確認する。
- 招待リンク運用（30 日有効のリンク共有）は現状メール送信を伴わないため影響を受けないが、将来
  「招待メール送信」を足す場合はスコープ B ではなく Auth の invite 経由にできるか要検討。

## 影響範囲・非目標

- **影響なし**: アプリコード（`apps/*` / `packages/*`）、DB スキーマ、Realtime、認可。A は設定のみ。
- **非目標（今回やらない）**: アプリからの任意メール送信（スコープ B）、メールテンプレートの
  デザイン刷新、通知メール機能そのものの追加。
- **秘匿情報**: Resend API キーは Git に含めない（`env()` / ダッシュボード入力）。本リポジトリは
  パブリックのため特に厳守。

## 6. スコープ B（将来）: アプリからの Resend API 送信の方針メモ

通知メール等を実装する段階になったら、以下の構成を想定する（本ドキュメントでは着手しない）。

- `packages/core` に `EmailPort`（`sendEmail({ to, subject, ... })` 等のインターフェース）を定義。
- `apps/web` に `resend` SDK を用いた `ResendEmailAdapter` を実装（ポートはインターフェースのみ・
  実装は web 側、という既存アーキテクチャ方針に沿う）。
- 大量送信・リトライは Inngest ジョブ経由にする（既存の非同期ジョブ基盤に載せる）。
- CLAUDE.md「メール機能はアプリが持たない」の**明示的な見直し**を伴うため、要望が具体化した時点で
  別設計ドキュメントを起こす。

## 関連

- [`docs/production-deployment.md`](./production-deployment.md) 「限定公開 → 一般公開」§3 本番用 SMTP
- [`CLAUDE.md`](../CLAUDE.md) 決定済みの技術判断「メール機能はアプリが持たない」
- `supabase/config.toml` `[auth.email]`
