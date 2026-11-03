# 「Cairn でログイン」（OIDC）設計書

作成日: 2026-11-03
ステータス: 設計段階（未実装）。論点は 2026-11-03 に決定済み → §9

[`app-platform-design.md`](./app-platform-design.md) §10 で第3段階として位置づけた「Cairn でログイン」の設計。Cairn の外にある画面（PWA など）を持つ外部アプリが、利用者を Cairn のユーザーとして識別できるようにする。

## 1. 結論

- **Cairn が自前で OIDC のプロバイダーになり、Cairn 専用の鍵で署名した ID トークンだけを外部アプリに渡す**。Supabase のトークン（アクセストークン・リフレッシュトークン）は外部アプリに一切渡さない
- 利用者から見た流れは Google でログインと同じ。外部アプリの「Cairn でログイン」→ Cairn の同意画面（共有する情報を表示）→ 許可 → 外部アプリに戻る
- 認可・コード発行・PKCE・リダイレクト URI の検証は、MCP 用の自前 OAuth（[`mcp-server-design.md`](./mcp-server-design.md)）の部品を流用する
- 外部アプリが Cairn のデータを読み書きする手段は、これまでどおり MCP（PAT / OAuth）か、アプリ基盤の Bot トークンに限る。ID トークンは「利用者が誰か」を伝えるだけ

## 2. Supabase の OAuth 2.1 Server を採らない理由

最初は Supabase Auth の OAuth 2.1 Server（ベータ）で Cairn の Supabase プロジェクトを IdP にする設計だった。2026-11-03 にローカル（Supabase CLI 2.100.1、Auth v2.189.0）で実際に動かし、次の問題が分かったため採らない。

- 外部アプリに渡るトークンは、すべて Supabase のプロジェクトの鍵で署名される。Supabase Auth 自身の API（`/auth/v1/user`・`/logout` など）は署名と `sub` だけを見て本人として受け付け、`aud` もトークンの種類も確かめない
- アクセストークンでは、利用者のパスワードを変えてアカウントを乗っ取れた。Custom Access Token Hook で `session_id` を実在しない値に書き換えれば塞げた
- **ID トークンはフックの対象外**で、ユーザー情報の読み取り・`user_metadata` の変更・`/logout` による利用者の全端末のログアウトができた。ID トークンは外部アプリに必ず渡るので、悪意ある外部アプリの操作を防げない
- Cairn の自前の API は、`aud` と `role` を見て外部アプリのトークンを拒否するよう直せるが（`isCairnSessionClaims`）、Supabase Auth の API には同じ判定を足せない

Cairn 専用の鍵で署名すれば、Supabase Auth も Cairn の API も、その ID トークンを署名の時点で受け付けない。外部アプリの手元にどのトークンが残っても、Cairn のアカウントやデータには触れられない。

## 3. 位置づけ

| 用途 | 仕組み | 資格情報 |
|---|---|---|
| 利用者が誰か（ログイン） | **本書**: Cairn の OIDC | Cairn 専用の鍵で署名した ID トークン |
| Cairn のデータを読む（当面） | MCP（`/api/mcp`） | PAT / MCP 用 OAuth |
| チャンネルへの投稿・カード | アプリ基盤の Bot Web API | Bot トークン |

- MCP 用の OAuth（`/oauth/authorize`・`/api/oauth/*`、`resource` = `/api/mcp`）とは、エンドポイント・テーブル・クライアントを分ける。部品（ハッシュ・PKCE・リダイレクト URI の検証）だけを共有する
- MCP の設計方針「独自 JWT・独自暗号を実装しない」は、MCP のアクセストークンを JWT にしない（opaque にする）という意味で守る。ID トークンは OIDC の仕様上 JWT が必須なので、署名は実績のあるライブラリ（`jose`）で標準の ES256 を使い、暗号処理は自作しない

## 4. 全体の流れ

```
[外部アプリ] 「Cairn でログイン」
   │ 認可リクエスト（認可コード + PKCE + state + nonce、scope=openid。profile / email は必要な場合だけ）
   ▼
[Cairn Web] /oidc/authorize（同意画面）
   │ 未ログインなら /auth/login?next=... へ
   │ クライアント・redirect_uri・スコープ・PKCE を検証
   │ 同じスコープで許可済みなら同意画面を出さずにコードを発行
   │ 未許可なら アプリ名・共有する情報を表示 → 許可 / 拒否
   ▼
[外部アプリ] redirect_uri に code と state が届く
   │ /api/oidc/token で code を交換（PKCE の verifier、機密クライアントは client secret も）
   ▼
[Cairn] ID トークン（Cairn の鍵で署名）と、UserInfo 専用のアクセストークンを返す
   ▼
[外部アプリ] ID トークンを JWKS で検証し、sub を Cairn のユーザー ID として使う
```

## 5. エンドポイント

issuer は `https://<Cairn の origin>/oidc`。MCP 用の `/.well-known/oauth-authorization-server`（issuer は origin）と混ざらないよう、OIDC は `/oidc` の下にまとめる。

| エンドポイント | 役割 |
|---|---|
| `GET /oidc/.well-known/openid-configuration` | ディスカバリー（issuer・各エンドポイント・対応スコープ・`id_token_signing_alg_values_supported: ["ES256"]` など） |
| `GET /oidc/jwks.json` | ID トークンを検証するための公開鍵（入れ替え中は旧鍵も載せる） |
| `/oidc/authorize` | 認可リクエストの検証と同意画面（Web のページ） |
| `POST /api/oidc/token` | コードの交換。`authorization_code` だけに対応し、`refresh_token` は発行しない |
| `GET /api/oidc/userinfo` | UserInfo。下のアクセストークンでだけ使える |

## 6. トークン

**ID トークン**（JWT、ES256、Cairn 専用の鍵）
- クレーム: `iss`、`sub`（Cairn のユーザー ID）、`aud`（client ID）、`exp`、`iat`、`auth_time`、`nonce`（リクエストにあれば）
- `profile` を許可した場合: `name`。ワークスペースによらないアカウントの値（`profiles` の表示名）を入れる。`profiles` にはワークスペースによらないアイコンが無いため `picture` は入れない。ワークスペースごとの表示名・アイコンが要る外部アプリは、Bot の Web API や MCP から取る
- `email` を許可した場合: `email` と `email_verified`
- 有効期限は5分。ログインの瞬間に確かめるためだけのもの
- 許可していないスコープの情報は入れない

**アクセストークン**（opaque。`cairn_oidc_at_` で始まる乱数）
- OIDC の仕様でトークンの応答に必須のため発行する。使えるのは `/api/oidc/userinfo` だけで、Cairn のほかの API には使えない（`getAuthContext()` は JWT としても PAT としても受け付けない）
- 有効期限は5分。DB には SHA-256 のハッシュだけを保存する
- レート制限は MCP のトークンと同じく、トークンごとに1分あたり120回（`MCP_RATE_LIMIT_PER_MINUTE`。`api-tokens.ts` と同じ DB のカウンターの仕組み）

**リフレッシュトークン**は発行しない。外部アプリは自分のセッションを自分で管理し、Cairn のログインが要るときはもう一度認可を受ける（許可済みなら同意画面は出ない）。

## 7. データ

| テーブル | 中身 |
|---|---|
| `oidc_clients` | client ID、名前、リダイレクト URI の一覧（https、完全一致）、種別（公開 / 機密）、client secret のハッシュ（機密のみ）、無効化日時 |
| `oidc_authorization_codes` | コードのハッシュ、クライアント、ユーザー、redirect_uri、スコープ、nonce、PKCE の challenge、有効期限（5分）、使用日時（1回だけ交換できる） |
| `oidc_grants` | ユーザーとクライアントの組ごとの許可（スコープ、許可日時、取り消し日時）。同意画面を省くかの判定と、設定の「連携」の一覧に使う |
| `oidc_access_tokens` | UserInfo 用アクセストークンのハッシュ、ユーザー、クライアント、スコープ、有効期限 |

- どれも RLS を有効にし、`anon` / `authenticated` に権限を付けない（Route Handlers から Drizzle で読み書きする）
- 署名鍵は DB に置かない。秘密鍵（JWK）を環境変数 `OIDC_SIGNING_KEYS` に、`kid` 付きの配列で持つ。先頭を署名に使い、残りは入れ替え中の旧鍵として JWKS にだけ載せる

## 8. Cairn 側で作るもの

1. **プロバイダー本体**: §5 のエンドポイント、§7 のテーブル、署名と JWKS
2. **同意画面 `/oidc/authorize`**: アプリ名・接続元のドメイン・共有する情報（スコープを利用者の言葉で）・ログイン中のアカウント・許可 / 拒否。他サイトの iframe に埋め込ませない（`frame-ancestors 'none'`）。許可・拒否はサーバーアクションで受け、同じ origin からの送信だけを受け付ける
3. **クライアントの登録**: Cairn の運営者がスクリプト（`pnpm --filter @cairn/web oidc:client` など）で登録・無効化する。client secret は発行時に一度だけ表示し、ハッシュだけ保存する。管理画面は作らず、動的登録も作らない。機密クライアント（サーバーを持つアプリ）と公開クライアント（サーバーを持たない PWA など）の両方に対応し、どちらも PKCE（S256）を必須にする
4. **設定の「連携」**: 「Cairn でログインを使っているアプリ」の一覧と取り消し。取り消すと次のログインで同意画面が出る（発行済みの ID トークンは5分で切れる）
5. **公開ドキュメント**: `/developers` の「Cairn でログイン」（日英）を、この方式の issuer・エンドポイント・トークンに合わせる
6. **鍵の入れ替え**: 年1回と、漏えいが疑われたときに行う。手順は (1) 新しい鍵を `OIDC_SIGNING_KEYS` の先頭に足して再デプロイ（以降の ID トークンは新しい鍵で署名され、JWKS には新旧両方が載る）、(2) 旧鍵で署名した ID トークンの有効期限（5分）が過ぎてから旧鍵を外して再デプロイ。漏えい時は (2) を待たずに旧鍵を外す（その間にログイン中だった利用者は、外部アプリでログインし直しになる）
7. **API の判定**: `verifyAccessToken`（`lib/auth-jwt.ts`）は引き続き、`client_id` がなく `aud` と `role` がともに `authenticated` の通常のセッションだけを本人として扱う（`isCairnSessionClaims`）。Cairn の ID トークンは Supabase の鍵で署名されていないので、その手前の署名検証で拒否される

## 9. 決定事項（2026-11-03）

| 論点 | 決定 |
|---|---|
| `name` の出どころ | ワークスペースによらない `profiles` の表示名。アカウント単位のアイコンが無いため `picture` は出さない（§6） |
| ゲストの扱い | 許す。Cairn のアカウントがあれば誰でもログインでき、所属・ロールでの絞り込みは外部アプリが Bot の Web API（`users.info`）や MCP で行う |
| 鍵の入れ替え | 年1回と漏えいが疑われたとき。手順は §8 の6 |
| クライアントの登録 | 運営者のスクリプト。管理画面・動的登録は作らない（§8 の3） |
| レート制限 | UserInfo のアクセストークンは MCP と同じくトークンごとに1分120回。`/oidc/authorize` と `/api/oidc/token` には MCP 用 OAuth と同じく専用の制限を置かない（コードは1回限り・5分・PKCE に縛られるため） |
