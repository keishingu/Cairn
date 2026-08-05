# MCP サーバ設計・運用仕様（外部エージェント連携）

作成日: 2026-07-19

最終更新: 2026-08-05

ステータス: リモート MCP + PAT / OAuth 実装済み（stdio/npm 版は後続）

Cairn を MCP（Model Context Protocol）サーバとして公開し、Claude / Codex などの外部 AI
クライアントから会話・プロジェクト・タスク・ファイル本文を読み書きするための現行仕様。
戦略背景は [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) を参照。

## 1. 身元と責任範囲

MCP クライアントは、PAT を発行または OAuth 接続を認可した**人間本人の代理（on behalf of）**
として動作する。投稿・タスク作成・完了操作は本人の行為として保存され、本人の現在の Cairn
ロールと既存の workspace / project / channel / file 認可を超えられない。

OAuth 認可時に user と workspace を接続へ固定する。access token の利用時も
`active_workspace_members` を通じて active membership と現在の role を毎回再照合する。
inactive member と guest は利用できない。

## 2. 提供形態と登録手順

`GET` / `POST /api/mcp` で Streamable HTTP を提供する。`mcp-handler` の stateless Route
Handler を使い、2026-07-28 MCP と 2025-era Streamable HTTP client を同じ URL で扱う。

### Claude Web / Desktop

1. Claude の Settings → Connectors で custom connector を追加する。
2. `https://<your-cairn-host>/api/mcp` だけを入力する。Advanced settings の Client ID / Secret
   は入力しない。
3. Cairn のログイン画面でログインする。
4. 接続元名、workspace、`read` / `write` の操作内容を確認して許可する。

Claude の現行 callback `https://claude.ai/api/mcp/auth_callback` と、将来移行先として案内される
`https://claude.com/api/mcp/auth_callback` は DCR で完全な URI として登録される。

### Claude Code

```bash
claude mcp add --transport http cairn https://<your-cairn-host>/api/mcp
```

Claude Code 内で `/mcp` を開いて Cairn を選び、ブラウザの OAuth 認可を完了する。DCR は
localhost callback も受け付ける。PAT を使う場合は `--header "Authorization: Bearer ..."` でも
登録できるが、設定へ秘密を直接残さない OAuth を推奨する。

### Codex CLI / Desktop / IDE

`~/.codex/config.toml` または trusted project の `.codex/config.toml`:

```toml
[mcp_servers.cairn]
url = "https://<your-cairn-host>/api/mcp"
auth = "oauth"
```

続けて `codex mcp login cairn` を実行する。Codex CLI、Desktop、IDE extension は同じ MCP
設定を共有する。PAT を使う場合は次の構成も維持する。

```toml
[mcp_servers.cairn]
url = "https://<your-cairn-host>/api/mcp"
bearer_token_env_var = "CAIRN_TOKEN"
```

`CAIRN_TOKEN` には設定画面で一度だけ表示される `cairn_pat_...` を設定する。

## 3. PAT と OAuth の使い分け

| 方式  | 主な client                              | 資格情報の取得                        |
| ----- | ---------------------------------------- | ------------------------------------- |
| OAuth | Claude Web / Desktop、Claude Code、Codex | URL 登録後に Cairn へログインして認可 |
| PAT   | 固定 Bearer header を設定できる client   | `/settings/integrations` で手動発行   |

両方式とも workspace 固定、`read` / `write`（`write` は `read` を包含）、guest 不可、1 token
あたり毎分 120 MCP request である。MCP tool ごとの既存 read / write 判定と Route Handler の
認可を共用する。

PAT は既定 90 日・最長 365 日。DB には SHA-256 hash だけを保存し、平文は発行直後に一度だけ
表示する。失効、期限切れ、inactive membership、guest への変更は次の認証から即時反映する。

## 4. OAuth Authorization Server

Cairn が Supabase Auth session をログインに使いながら、MCP 専用 OAuth Authorization Server を
同一 origin で提供する。Supabase access / refresh token を MCP client へ渡さない。

| endpoint                                        | 用途                                   |
| ----------------------------------------------- | -------------------------------------- |
| `/.well-known/oauth-protected-resource`         | RFC 9728 Protected Resource Metadata   |
| `/.well-known/oauth-protected-resource/api/mcp` | RFC 9728 path-aware metadata URL       |
| `/.well-known/oauth-authorization-server`       | RFC 8414 Authorization Server Metadata |
| `/api/oauth/register`                           | RFC 7591 DCR                           |
| `/oauth/authorize`                              | ログイン・workspace / scope 同意       |
| `/api/oauth/token`                              | code exchange / refresh rotation       |
| `/api/oauth/connections`                        | 接続一覧                               |
| `/api/oauth/connections/[id]`                   | 本人による接続取り消し                 |

Claude が URL だけで接続できるよう DCR を実装する。DCR client は secret を持たない public client
で、`token_endpoint_auth_method=none` と PKCE S256 を組み合わせる。redirect URI は登録時に
HTTPS または loopback HTTP だけを許可し、認可・token exchange では登録値との完全一致を要求する。

現行 MCP 仕様に従い、authorization request と token request の両方で RFC 8707 `resource` を
必須にする。値は canonical MCP URL（`https://<host>/api/mcp`）と完全一致させ、access token
検証時にも connection の resource と照合する。

### token lifecycle

| credential         | lifetime | 保存方法・一度性                                                                 |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| authorization code | 5 分     | SHA-256 hash、PKCE challenge / redirect / client / resource に固定、一度だけ交換 |
| access token       | 1 時間   | SHA-256 hash、MCP resource と connection に固定                                  |
| refresh token      | 30 日    | SHA-256 hash、一回使用ごとに新 token へ rotation                                 |

使用済み refresh token が再利用された場合は、token family を個別管理する代わりに、その接続全体を
即時失効する。これは同じ connection の既存 access / refresh token を一括で無効化する最小境界である。
設定の「連携」で取り消した場合も connection を失効し、一覧から非表示にする。

## 5. OAuth セキュリティ境界

- OAuth access token は opaque random value とし、独自 JWT・独自暗号を実装しない。
- client secret は発行しない。authorization code、access token、refresh token は平文保存しない。
- authorization code flow は PKCE S256 と `state` を必須にする。認可応答には RFC 9207 `iss` を含める。
- 認可操作は Next.js Server Action の same-origin 検証と Supabase の SameSite session cookie を使い、
  POST CSRF を防ぐ。client / redirect / PKCE / resource は承認時に DB と再照合する。
- 未認証または無効 token の `/api/mcp` は 401 と RFC 9728 `WWW-Authenticate` の
  `resource_metadata` を返す。
- `/api/mcp` が OAuth token、active membership、role、scope、resource、rate limit を検証した後、
  同一 request の AsyncLocalStorage context に本人情報を渡す。内部 Route Handler は同一 raw token
  の context だけを受け付けるため、OAuth token を通常 REST API の代替資格情報にはできない。
- PAT の既存 prefix、検証、失効、rate limit、MCP 専用 context は変更せず併存する。

OAuth / MCP の基準は [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)、
[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)、[RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)、
[RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)、[RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)
とする。Claude client との互換性のため、2025-06-18 authorization discovery と DCR も維持する。

## 6. MCP tools

| tool              | scope | 対応 API                                  |
| ----------------- | ----- | ----------------------------------------- |
| `list_projects`   | read  | `GET /api/projects`                       |
| `get_project`     | read  | `GET /api/projects/[id]`                  |
| `list_files`      | read  | `GET /api/files` / project files API      |
| `read_file`       | read  | `GET /api/files/[id]/content`             |
| `list_my_tasks`   | read  | `GET /api/tasks?assignee=me`              |
| `create_task`     | write | `POST /api/tasks`                         |
| `complete_task`   | write | `PATCH /api/tasks/[id]`                   |
| `post_message`    | write | `POST /api/channels/[channelId]/messages` |
| `search_messages` | read  | `GET /api/search/messages?q=...`          |

MCP 層は薄い protocol 変換に徹し、各 tool は既存 Route Handler を呼ぶ。`read_file` は Storage の
元 binary ではなく、`canAccessFile` 適用後に `document_chunks` の抽出済み本文を最大 10 chunk ずつ
返す。

## 7. 後続候補

- stdio / npm package 版
- ファイル成果物の upload
- MCP Resources としての project 資料公開
- Claude が Client ID Metadata Documents を安定サポートした時点で DCR との併存・移行を検討

外部 MCP を agent profile として記録する構想は採用しない。Cairn 内部 AI の身元・承認 flow は
[`10_ai_member_design.md`](./10_ai_member_design.md) と [`ai-pmo-design.md`](./ai-pmo-design.md) で扱う。
