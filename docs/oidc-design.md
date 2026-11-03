# 「Cairn でログイン」（OIDC）設計書

作成日: 2026-11-03
ステータス: 設計段階（未実装）。論点は §9 の未決事項を参照

[`app-platform-design.md`](./app-platform-design.md) §10 で第3段階として位置づけた「Cairn でログイン」の設計。Cairn の外にある画面（PWA など）を持つ外部アプリが、利用者を Cairn のユーザーとして識別できるようにする。

## 1. 結論

- **Supabase Auth の OAuth 2.1 Server（ベータ）を使い、Cairn の Supabase プロジェクトを OIDC のアイデンティティプロバイダーにする**。認可コード・トークン発行・ID トークン・JWKS・ディスカバリー・UserInfo は Supabase が持ち、Cairn が作るのは同意画面だけ
- **外部アプリが受け取るアクセストークンは、Cairn のどの API・データにも通さない**。Supabase が発行するアクセストークンは通常ログインと同じユーザー JWT（`client_id` クレームが付くだけ）で、スコープで DB アクセスを絞れないため。Cairn 側で `client_id` 付きの JWT を一律に拒否する（§5）
- 外部アプリが使うのは **ID トークン（利用者が誰か）だけ**。Cairn のデータの読み書きは、これまでどおり MCP（PAT / OAuth）か、アプリ基盤の Bot トークンで行う

## 2. 位置づけ

| 用途 | 仕組み | 資格情報 |
|---|---|---|
| 利用者が誰か（ログイン） | **本書**: OIDC | ID トークン（外部アプリが検証） |
| Cairn のデータを読む（当面） | MCP（`/api/mcp`） | PAT / MCP 用 OAuth（[`mcp-server-design.md`](./mcp-server-design.md)） |
| チャンネルへの投稿・カード | アプリ基盤の Bot Web API | Bot トークン（[`app-platform-design.md`](./app-platform-design.md) §3.3） |

- 既存の `/oauth/authorize` と `/api/oauth/*` は **MCP 専用の自前 OAuth**（opaque token、`resource` = `/api/mcp` 固定）。本書の OIDC とは別物で、統合しない
- MCP の設計方針「独自 JWT・独自暗号を実装しない」（[`mcp-server-design.md`](./mcp-server-design.md)）を守るため、ID トークンを自前で署名する案は採らない（§8）

## 3. 前提の確認結果（2026-11-03）

- **署名鍵**: ID トークンは非対称鍵が必須（HS256 では生成に失敗する）。本番プロジェクトの JWKS は ES256 で、条件を満たす
- **Supabase CLI**: `[auth.oauth_server]` は v2.54.11 以上が必要。開発環境は 2.100.1
- **料金**: 全プランで追加料金なし。OAuth 経由のログインも MAU に数える
- **対応範囲**: 認可コード + PKCE とリフレッシュのみ（`client_credentials` / `password` なし）。スコープは `openid` / `email` / `profile` / `phone` だけで、独自スコープは作れない

## 4. 全体の流れ

```
[外部アプリ] 「Cairn でログイン」
   │ 認可リクエスト（PKCE + state, scope=openid。profile / email は必要な場合だけ）
   ▼
[Supabase] /auth/v1/oauth/authorize
   │ Site URL + 認可パスへリダイレクト（?authorization_id=...）
   ▼
[Cairn Web] /oauth/consent
   │ 未ログインなら /auth/login?next=/oauth/consent?authorization_id=... へ
   │ getAuthorizationDetails → 同意済みなら即リダイレクト
   │ 未同意なら アプリ名・スコープを表示 → approve / deny
   ▼
[Supabase] 外部アプリの redirect_uri へ（code）
   ▼
[外部アプリのサーバー] /auth/v1/oauth/token で code を交換
   → ID トークンを JWKS で検証し、sub を Cairn のユーザー ID として使う
   → アクセストークン・リフレッシュトークンは保存しない
```

## 5. 外部アプリのトークンを Cairn に通さない（封じ込み）

### なぜ必要か

Supabase の OAuth アクセストークンは `aud: authenticated` の通常のユーザー JWT に `client_id` が付いたもの。ドキュメント上も「スコープは OIDC のデータを決めるだけで、DB アクセスは制限しない」「既存の RLS がそのまま適用される」とされている。何もしないと、外部アプリがこのトークンで次をすべて利用者本人として使える。

- Cairn の API（`getAuthContext()` は Bearer の Supabase JWT をそのまま受け付ける。`getAuthUser()` も同様）
- PostgREST・Storage（RLS は `auth.uid()` や `can_access_channel()` などで本人を判定しており、`client_id` はどこも見ていない）
- Realtime（`realtime.messages` の認可）

### 方針: `client_id` 付きの JWT を一律に拒否する

外部アプリに Cairn のデータを触らせる手段は、MCP と Bot トークンに限る。OIDC のトークンには役割を持たせない。

| 層 | やること |
|---|---|
| Cairn の API | `verifyAccessToken`（`lib/auth-jwt.ts`）で、`client_id` がなく `aud` と `role` がともに `authenticated` の通常のセッションだけを本人として扱い、それ以外は `null`（401）。外部アプリの ID トークンは同じ鍵で署名され、`aud` が client ID で `client_id` を持たないため、`client_id` を見るだけでは通ってしまう（`getClaims()` は `aud` を検証しない）。`getAuthUser()` は Bearer トークンも Cookie のセッションも `getUser()` に直接渡しており、`getUser()` の戻り値からは `client_id` を確かめられない。外部アプリは自分のトークンを Supabase のセッション Cookie に入れて送ることもできるため、Bearer・Cookie のどちらの経路でも先に `verifyAccessToken()` で検証し、通ったものだけ `getUser()` で最新のユーザー情報を取る。`/api/` は middleware の対象外なので、API 側の判定だけに頼る。middleware も `verifyAccessToken` を通るので同じ判定になる |
| PostgREST（テーブル・ビュー） | Cairn はデータの読み書きをすべて Route Handlers（Drizzle / service role）経由で行い、PostgREST を使っていない。そこで `public` のテーブル・ビューは `anon` / `authenticated` から権限を外して閉じる。あわせて、全テーブルで RLS を有効にする（ポリシーは書かない。権限が誤って戻っても0行しか見えない二重の守りになり、`postgres` / `service_role` は RLS を無視するのでサーバーには影響しない）。ビューには RLS がかからないので、権限を外すことで閉じる。今後作るテーブル・ビューにも権限が付かないよう、既定の権限（`ALTER DEFAULT PRIVILEGES`）からも外す |
| PostgREST（RPC） | `authenticated` が実行できる関数は `/rest/v1/rpc/<name>` から呼べる。`SECURITY DEFINER` の関数（`can_access_channel` などの権限判定や、Realtime への配信）は所有者の権限で動き、テーブルの権限や RLS を素通りする。関数の先頭で `client_id` 付きの呼び出しを拒否する（RLS ポリシーから呼ばれる関数があるため、実行権限を外すのではなく関数の中で判定する）|
| Storage | `storage.objects` の既存ポリシーは `authenticated` に許可を出しているので、外部アプリのトークンも通る。`(auth.jwt() ->> 'client_id') IS NULL` の `AS RESTRICTIVE` ポリシーを足す |
| Realtime | `realtime.messages` の認可ポリシーに同じ条件を足す |
| Supabase Auth の API | **未解決（本番で OAuth Server を有効にしない理由）**。ローカルで確かめた結果、外部アプリのトークンで `/auth/v1/user` の読み取り（スコープ外のメールアドレス・メタデータまで返る）、メタデータの変更、**パスワードの変更**ができた。ログイン直後のトークンは「最近ログインした」扱いになるため、`secure_password_change` では止まらない。メールアドレスの変更は `double_confirm_changes` で旧・新両方の確認待ちになる。§9 の6で拒否する方法を決めるまで、本番で OAuth Server を有効にしない |
| 同意画面 | 他サイトの iframe に埋め込ませない（`frame-ancestors 'none'` / `X-Frame-Options: DENY`）。埋め込まれると、透明な枠の上で「許可」を押させるクリックジャッキングで許可を出させられる |

- テーブル・ビューの権限の剥奪と RLS の有効化はマイグレーションで行う。今の権限の状態をマイグレーションに残し、ローカル・Preview・本番を同じにする
- 今後追加するテーブル・ビュー・関数も同じ状態を保つ必要がある。漏れを防ぐため、DB のカタログを見る確認テストを置く
  - `public` の全テーブルで RLS が有効であること
  - `anon` / `authenticated` が `public` のテーブル・ビューに権限を持たないこと
  - `authenticated` が実行できる `SECURITY DEFINER` の関数はすべて、`client_id` を拒否する判定を持つこと（拡張機能の関数は対象外）
  - `storage.objects` と `realtime.messages` に、`client_id` を拒否する RESTRICTIVE ポリシーがあること
- API 側は、`client_id` 付きのトークンを Bearer で送った場合と Cookie のセッションに入れて送った場合の両方で、`getAuthContext()` と `getAuthUser()` が 401 を返すことをテストで確かめる
- **代替案（要検証）**: Custom Access Token Hook で OAuth 発行時（`authentication_method` が `oauth_provider/authorization_code`）だけ `role` を権限のない専用ロールに書き換えれば、RPC・Storage・Realtime を1か所で塞げる可能性がある。Supabase の各サービスが書き換えた `role` をどう扱うかを検証してから採否を決める（§9）

## 6. Cairn 側で作るもの

1. **OAuth Server の有効化**
   - 本番: ダッシュボード「Authentication > OAuth Server」で有効化し、認可パスを `/oauth/consent` にする。同意画面の URL は Site URL + 認可パスになるので、Site URL が本番 Web の origin であることを確認する
   - ローカル: `supabase/config.toml` に `[auth.oauth_server]`（`enabled = true`、`authorization_url_path = "/oauth/consent"`、`allow_dynamic_registration = false`）
2. **同意画面 `/oauth/consent`**（Web のみ。モバイルアプリには作らない）
   - `supabase.auth.oauth.getAuthorizationDetails` / `approveAuthorization` / `denyAuthorization` を使う
   - 表示: アプリ名、要求されたスコープ（「名前とアイコン」「メールアドレス」など利用者の言葉で）、許可・拒否
   - middleware: 未ログイン時に `next` を付けてログインへ送る対象に `/oauth/consent` を足す（今は `/oauth/authorize` だけ）
   - 文言は i18next（`ja.ts` / `ko.ts`）
3. **封じ込み**（§5）
4. **連携中のアプリの一覧と取り消し**: `/settings/integrations` に、`getUserGrants()` の一覧と `revokeGrant(clientId)` を出す
5. **クライアントの登録**: Cairn の運営者がダッシュボードか Admin API で登録する。動的登録は使わない
   - 外部アプリはサーバーを持つ前提で、機密クライアント（client secret あり）にする
   - リダイレクト URI は完全一致で、環境（本番・Preview・ローカル）ごとに別クライアントにする
6. **ドキュメント**: 外部の開発者向けに、`/developers` に「Cairn でログイン」のページ（日英）を足す。ID トークンだけを使い、アクセストークンでは Cairn を呼べないことを明記する

## 7. 外部アプリ側の約束（公開ドキュメントに書く）

- フロー: 認可コード + PKCE。スコープは `openid` と必要なものだけ（`profile` / `email`）
- `state` を必ず使う。推測できない値を生成してログイン開始時のセッションに保存し、コールバックで一致を確かめる。一致しなければコードを交換しない（PKCE は認可コードの横取り対策で、認可レスポンスを開始したセッションに結び付ける `state` の代わりにはならない）
- 設定はディスカバリー（`/auth/v1/.well-known/openid-configuration`）から読む
- ID トークンは JWKS で署名を検証し、`iss` と `aud`（= client ID）を確かめて、`sub` を Cairn のユーザー ID として使う
- アクセストークン・リフレッシュトークンは保存しない。Cairn の API には使えない（§5 で拒否される）
- **ワークスペースの所属は ID トークンに含まれない**。特定のワークスペースのメンバーだけを入れたいアプリは、MCP（`list_members`）か Bot Web API（`users.info`）で `sub` が active メンバーかを確かめる
- ID トークンの `name` / `picture` は Supabase Auth のユーザーメタデータ由来で、Cairn のプロフィール（ワークスペースごとの表示名・アイコン）とは一致しない場合がある。表示名は Cairn のメンバー情報から取る

## 8. 検討して採らなかった案

| 案 | 採らない理由 |
|---|---|
| 既存の MCP 用 OAuth（`/api/oauth/*`）に `openid` と ID トークンを足す | ID トークンの署名鍵を自前で持つことになり、「独自 JWT・独自暗号を実装しない」方針に反する。鍵のローテーションも自前になる |
| 外部アプリに Cairn の DB（Supabase）へ直接つながせる | ワークスペースロール・`active_workspace_members` による認可を素通りし、service role の鍵を外に出すことになる |
| Auth0 などの外部 IdP を Cairn の前に置く | 既存の Supabase Auth のユーザーと二重管理になる。今回の規模に対して大きすぎる |

## 9. 未決事項

1. **封じ込みの方式**: §5 の「各層で `client_id` を拒否」と「Custom Access Token Hook で `role` を書き換える」のどちらにするか。前者はテーブル・ビューの権限の剥奪・RLS の有効化に加えて、`SECURITY DEFINER` の関数・Storage・Realtime に個別に手を入れる。後者は Supabase の PostgREST・Storage・Realtime が書き換えた `role` を受け入れるかの検証が先
2. **取り消し直後のアクセストークン**: `revokeGrant` で発行済みのアクセストークンが即座に無効になるか、有効期限（1時間）まで残るかがドキュメントから読み取れない。§5 の封じ込みがあれば Cairn 側の影響はないが、外部アプリのセッションの切り方に関わる
3. **ベータ機能への依存**: 仕様変更があった場合の追従方針
4. **同意画面の対象**: ゲストにも「Cairn でログイン」を許すか（ID トークンには所属もロールも出ないため、判断は外部アプリ側になる）
5. **`email` スコープ**: 利用者のメールアドレスを外部アプリに渡してよいか。最初の外部アプリは `email` なしで成り立つか確認する
6. **Supabase Auth の API への外部アプリのトークン（本番で有効にする前に必ず決める）**: 2026-11-03 にローカル（Supabase CLI 2.100.1、Auth v2.189.0）で確かめた結果は次のとおり。外部アプリは受け取ったアクセストークンだけで、利用者のパスワードを変えてアカウントを乗っ取れる
   - できた: `GET /auth/v1/user`（メールアドレス・メタデータまで返る）、`PUT /auth/v1/user` によるメタデータの変更とパスワードの変更（変更後のパスワードでログインでき、元のパスワードでは入れなくなった）
   - 確認待ちで止まった: メールアドレスの変更（`double_confirm_changes` により旧・新両方の確認が要る）
   - 試せなかった: TOTP の MFA 登録（ローカルでは TOTP の登録が無効）。本番の MFA 設定で確かめる
   - 拒否されたもの（Cairn 側の封じ込みが効いている）: Cairn の API（401）、PostgREST のテーブル・ビュー・権限判定の関数（42501）、Storage（RLS で拒否）。Realtime の権限判定は false
   - 拒否する方法の候補: Custom Access Token Hook で OAuth 発行時（`authentication_method` が `oauth_provider/authorization_code`）だけ `aud` などを書き換え、Auth の `/user` が受け付けない形にできるか。ID トークンには影響しないかもあわせて確かめる。ID トークンでも Auth の `/user` を呼べるかを確かめる（同じ鍵で署名されているため）。外部アプリに発行するアクセストークンの有効期限を短くできるかも確認する
   - ID トークンの `name` には、`email` スコープを許可していなくてもメールアドレスが入っていた（表示名を持たない利用者の場合）。外部アプリにメールアドレスを渡さない方針なら、これも塞ぐ必要がある
