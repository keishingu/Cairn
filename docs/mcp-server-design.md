# MCP サーバ設計・運用仕様（外部エージェント連携）

作成日: 2026-07-19

最終更新: 2026-08-04

ステータス: リモート MCP + PAT 実装済み（stdio/npm 版は後続）

Cairn を MCP（Model Context Protocol）サーバとして公開し、ChatGPT / Claude / Codex
などの外部 AI クライアントから会話・プロジェクト・タスクを読み書きするための現行仕様。
戦略背景は [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) を参照。

## 1. 身元と責任範囲

MCP クライアントは、PAT を発行した**人間本人の代理（on behalf of）**として動作する。
投稿・タスク作成・完了操作はトークン所有者本人の行為として保存され、本人の Cairn ロールと
既存のプロジェクト／チャンネル認可を超えられない。

Cairn 内部でタスク提案や PMO を行う AI は別機能であり、MCP の身元モデルには含めない。
MCP は外部クライアントが、本人に見える Cairn の会話やコンテンツを本人として参照・編集する
ための入口である。

## 2. 提供形態

初期リリースは Next.js の `POST /api/mcp` で提供するリモート MCP（Streamable HTTP）。
`mcp-handler` を用いた stateless な Route Handler とし、インストール不要で接続できる。

stdio / npm パッケージ版は後続フェーズとする。クライアント固有プラグインは作らず、同じ MCP
サーバを各クライアントから利用する。

Codex の設定例:

```toml
[mcp_servers.cairn]
url = "https://<your-cairn-host>/api/mcp"
bearer_token_env_var = "CAIRN_TOKEN"
```

`CAIRN_TOKEN` には設定画面で一度だけ表示される `cairn_pat_...` を設定する。

## 3. PAT

`/settings/integrations` の「MCP / APIトークン」から発行・一覧・失効を行う。

- DB には SHA-256 ハッシュだけを保存し、平文は発行直後に一度だけ表示する
- トークンは発行時のワークスペースに固定する。workspace ヘッダーや cookie では切り替えない
- `read` と `write` の2スコープ。`write` は `read` を包含する
- member 以上だけが発行でき、guest は発行・利用できない
- 既定90日、最長365日。無期限トークンは発行しない
- 失効、期限切れ、inactive membership、guest への変更は次の認証から即時反映する
- 1トークンあたり毎分120リクエストの固定窓レート制限を DB 上で原子的に適用する
- PAT は `/api/mcp` だけで受け付ける。ツールから内部的に呼ぶ Route Handler には検証済み MCP
  リクエストの実行コンテキストを引き継ぎ、同じ REST API を PAT で直接呼んでも受け付けない

`api_tokens` は RLS を有効化し、Supabase Data API の `anon` / `authenticated` から直接参照できない。
発行・失効は認証済み Next.js Route Handler 経由に限定する。

## 4. 初期ツール

| ツール            | スコープ | 対応 API                                  | 用途                            |
| ----------------- | -------- | ----------------------------------------- | ------------------------------- |
| `list_projects`   | read     | `GET /api/projects`                       | 見えるプロジェクト一覧          |
| `get_project`     | read     | `GET /api/projects/[id]`                  | プロジェクトと投稿先 channel ID |
| `list_my_tasks`   | read     | `GET /api/tasks?assignee=me`              | 自分の担当タスク                |
| `create_task`     | write    | `POST /api/tasks`                         | タスク作成                      |
| `complete_task`   | write    | `PATCH /api/tasks/[id]`                   | タスク完了                      |
| `post_message`    | write    | `POST /api/channels/[channelId]/messages` | メッセージ／外部URL投稿         |
| `search_messages` | read     | `GET /api/search/messages?q=...`          | 閲覧可能な会話検索              |

MVP の「成果物の投稿」はメッセージ本文と外部 URL まで。Cairn へのファイルアップロードは、
署名 URL と Storage 認可を別途設計してから追加する。

MCP 層は薄いプロトコル変換に徹し、各ツールは既存 Route Handler を呼ぶ。これにより通常 UI と
同じ workspace / project / channel 認可、入力検証、通知・タスク連携が適用される。

## 5. セキュリティ境界

| 論点                    | 対策                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| トークン漏洩            | ハッシュ保存、一度だけ表示、有効期限、即時失効                           |
| ワークスペース越境      | PAT の workspace 固定と API クエリの workspace 条件                      |
| 権限昇格                | active membership と role を認証ごとに再照合                             |
| read PAT の書き込み     | 書き込み Route Handler で `write` を要求し 403                           |
| 暴走                    | MCP リクエストへの DB 共有の毎分レート制限、通常データとして操作を可視化 |
| Data API 経由の秘密参照 | `api_tokens` の RLS と role grant 取り消し                               |

## 6. 後続候補

- stdio / npm パッケージ版
- ファイル成果物のアップロード
- MCP Resources としてのプロジェクト資料公開
- OAuth ベースの接続（PAT を設定できないクライアント需要が確認された場合）

外部 MCP を agent profile として記録する構想は現時点では採用しない。Cairn 内部 AI の身元・承認
フローは [`10_ai_member_design.md`](./10_ai_member_design.md) と [`ai-pmo-design.md`](./ai-pmo-design.md)
で別に扱う。
