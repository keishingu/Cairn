# Resend Auth メール配信運用

> ステータス: **現行リファレンス** ／ 最終更新: 2026-08-22
>
> Supabase Auth が生成する認証メールを Resend のカスタム SMTP で配送するための設定と運用をまとめる。

導入状況（2026-08-22）: Resend への `mail.oss-cairn.com` 登録まで完了。DNS 検証と Supabase Preview / Production の SMTP 設定は未完了。

## 方針

- サインアップ確認、パスワードリセット、メールアドレス変更、マジックリンク等の生成と送信契機は、引き続き **Supabase Auth** が担う。
- **Resend は Supabase Auth のカスタム SMTP として配送だけを担う**。アプリから Resend API を呼ばず、`resend` SDK や `RESEND_API_KEY` を Vercel に追加しない。
- ローカル開発は `supabase/config.toml` の Mailpit（設定名は `[inbucket]`）を維持し、実メールを送らない。
- 検証環境と本番環境は Supabase ダッシュボードで個別に設定し、Resend API キーも環境ごとに分ける。

## 送信ドメイン

送信専用サブドメインとして **`mail.oss-cairn.com`** を使い、送信元を **`Cairn <no-reply@mail.oss-cairn.com>`** とする。

- ルート `oss-cairn.com` の SPF は `v=spf1 -all` でメール送信を禁止しているため、ルートドメインを Resend の送信ドメインにしない。
- `auth.oss-cairn.com` は将来の Supabase Custom Domain 候補として予約し、メール送信には使わない。
- 認証メールと将来のマーケティングメールは送信ドメインを共用しない。

## 導入手順

### 1. Resend

1. Resend に `mail.oss-cairn.com` を送信ドメインとして追加する。
2. Resend が表示する DKIM の TXT レコードと送信用の CNAME レコードをそのまま登録する。受信機能は有効にせず、受信用 MX は追加しない。
3. ルートの DMARC（`p=reject; sp=reject; adkim=s; aspf=s`）がサブドメインにも適用されるため、ポリシーを緩めない。Resend 検証後は From ドメインと DKIM 署名ドメインが厳密一致し、DMARC が pass することを確認する。
4. Resend でドメインが `Verified` になったことを確認する。
5. `cairn-preview-supabase-smtp` と `cairn-production-supabase-smtp` の送信専用 API キーを個別に発行する。

API キーはリポジトリ、Vercel、GitHub Actions、ローカル `.env` に保存しない。Supabase ダッシュボードの SMTP password にだけ登録する。

### 2. Supabase Preview

Supabase の `cairn-preview` で Authentication の SMTP 設定を開き、Custom SMTP を有効化する。

| 項目 | 値 |
|---|---|
| Sender email | `no-reply@mail.oss-cairn.com` |
| Sender name | `Cairn` |
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | Preview 用 Resend API キー |

保存後、Auth のメール送信レート制限を Resend 契約枠と想定トラフィックに合わせて確認する。カスタム SMTP 有効化直後の Supabase 側上限は低く設定されるため、未確認のまま一般公開しない。

### 3. Preview の検証

1. `https://develop.oss-cairn.com` でパスワードリセットを要求する。
2. Resend の送信ログに記録され、テスト用受信箱へ届くことを確認する。
3. From、Return-Path、SPF、DKIM、DMARC の結果を確認する。
4. メール内リンクが `develop.oss-cairn.com` の正しい画面へ遷移し、期限内のトークンで処理を完了できることを確認する。
5. 存在しないメールアドレスへの要求で、アカウント有無を推測できるレスポンス差が生じていないことを確認する。

### 4. Supabase Production

Preview の検証完了後、Supabase の `cairn-production` に同じ SMTP 設定を Production 用 Resend API キーで登録する。Auth の Site URL / Redirect URLs とメールテンプレート内リンクが `https://oss-cairn.com` を向くことを確認する。

本番反映後は、管理下の実メールアドレスでパスワードリセットを1件だけ実行し、Resend ログ、受信、認証完了まで確認する。

## ローカル開発

`supabase/config.toml` には Resend SMTP を設定しない。`supabase start` が起動する Mailpit を使い、`supabase status` に表示される URL から認証メールを確認する。

ローカルで実配送を試すために Resend のキーを設定ファイルへ追加しない。配送確認は共有 Preview 環境で行う。

## 運用

- 配信障害は、Supabase Auth Logs で SMTP への引き渡しエラーを確認し、引き渡し後は Resend Logs で `delivered` / `bounced` / `complained` / `suppressed` を確認する。
- API キーをローテーションするときは、新しいキーを発行して Supabase 側を更新し、送信確認後に旧キーを失効させる。
- バウンスや苦情の増加時は送信を止め、原因を解消してから再開する。認証メールに広告・販促文を混ぜない。
- 送信量の急増前に Supabase と Resend の双方のレート制限を確認する。

## ロールバック

Resend 障害時は、Supabase の Custom SMTP を無効化してデフォルト SMTP に戻す。ただしデフォルト SMTP は送信先とレートが厳しく制限されるため、一般ユーザー向けの恒久運用には使わない。長期障害に備えた代替 SMTP は別途検討する。

## 完了条件

- [x] `mail.oss-cairn.com` を Resend に登録
- [ ] Resend 指定の DNS レコードを追加し、ステータスが Verified
- [ ] Preview 用と Production 用の Resend API キーを分離
- [ ] `cairn-preview` の Custom SMTP を設定
- [ ] Preview でパスワードリセットの送信・受信・リンク完了を確認
- [ ] `cairn-production` の Custom SMTP を設定
- [ ] Production で管理下アドレスへの送信・受信・リンク完了を確認
- [ ] Supabase / Resend のレート制限と障害時確認先を運用担当者間で共有

## 公式リファレンス

- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase CLI config: Auth SMTP](https://supabase.com/docs/guides/local-development/cli/config)
- [Resend: Send emails with SMTP](https://resend.com/docs/send-with-smtp)
