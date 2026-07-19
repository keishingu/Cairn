# MCP サーバ設計書（外部エージェント連携）

作成日: 2026-07-19
ステータス: 設計段階（実装未着手）

Cairn を MCP（Model Context Protocol）サーバとして公開し、Claude / Codex / ChatGPT などの外部 AI エージェントから「タスクの取得・成果物の投稿・完了報告」を行えるようにするための実装設計。

戦略背景は [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) の「MCP サーバーとしての座取り（合意）」を参照。本書はそれを実装に落とすための設計である。

---

## 1. 方針

### Codex 専用プラグインは作らない

Codex CLI は `~/.codex/config.toml` の `[mcp_servers.*]` で MCP クライアントとして動作する（stdio / Streamable HTTP 両対応）。Claude Code / Claude Desktop / ChatGPT コネクタも同様に MCP クライアントである。したがって **MCP サーバを1本作れば全エージェントをカバーでき、クライアントごとの個別開発は不要**。

### 実行は作らない、報告に来させる

[`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) の合意どおり、スライド作成等の実行系 AI は自前で作らない。公開するのは「タスクの取得・成果物の投稿・完了報告」に絞り、Cairn は**エージェントが報告しに来る場所**（人と AI の混成チームの調整・記録レイヤー)に徹する。

### 既存 API 資産に乗る

Cairn の API はすべて Bearer トークン認証の Next.js Route Handlers であり（[`api-conventions.md`](./api-conventions.md)）、Expo と同じ口を外部エージェントも叩ける。認可は `getAuthContext()` → `membership.ts` / `permissions.ts` に集約済みのため、**MCP 経由の操作も既存 API を通す限り権限・非活性メンバー遮断が横断的に効く**。MCP サーバは薄いプロトコル変換層に徹し、業務ロジックを持たない。

---

## 2. 全体アーキテクチャ

段階的に2形態を提供する。

### Phase 1 — stdio サーバ（npm パッケージ）

```
Claude / Codex (MCPクライアント)
  │ stdio (JSON-RPC)
  ▼
@cairn/mcp (packages/mcp, npx で配布)
  │ HTTPS + Authorization: Bearer <PAT>
  ▼
既存 Next.js Route Handlers (/api/*)
```

- `@modelcontextprotocol/sdk` を使った薄いラッパー。中身は既存 REST API を PAT 付きで呼ぶ HTTP クライアントのみ
- 接続先 URL とトークンは環境変数（`CAIRN_URL` / `CAIRN_TOKEN`）で受け取る
- Web アプリ側の変更が PAT 機構（§3）以外ほぼゼロで済む

ユーザー側の設定例（Codex）:

```toml
# ~/.codex/config.toml
[mcp_servers.cairn]
command = "npx"
args = ["-y", "@cairn/mcp"]
env = { CAIRN_TOKEN = "cairn_pat_..." }
```

Claude Code は `claude mcp add cairn -e CAIRN_TOKEN=... -- npx -y @cairn/mcp` で同等。

### Phase 2 — リモート MCP（Streamable HTTP）

- `apps/web` に `/api/mcp` ルートを追加（Vercel の `mcp-handler` が Next.js Route Handler にそのまま載る）
- インストール不要で URL を貼るだけになり、ChatGPT のコネクタからも接続可能になる
- 認証はまず `Authorization` ヘッダに PAT。MCP 標準の OAuth 2.1 + Dynamic Client Registration への対応は、Supabase Auth を第三者向け認可サーバに仕立てるコストが大きいため、需要が確認できてから検討する

Phase 1 と 2 でツール定義を共有できるよう、ツールのスキーマ・ハンドラは `packages/mcp` に置き、`/api/mcp` からも import する構成にする。

---

## 3. PAT（Personal Access Token）機構 — 最重要の新規開発

現在の認証は Supabase の短命アクセストークン（refresh 前提）か Cookie のみで、MCP クライアントの設定ファイルに書ける長命な資格情報が存在しない。これが現状の最大のギャップ。

### DB スキーマ（`packages/db/src/schema/` に追加）

```
api_tokens
  id            uuid PK
  user_id       uuid → profiles.id
  workspace_id  uuid → workspaces.id   -- トークンはワークスペースに固定
  name          text                   -- 用途ラベル（例「Codex 用」）
  token_hash    text                   -- SHA-256。平文は発行時に一度だけ表示
  token_prefix  text                   -- 先頭数文字（一覧表示・識別用）
  scope         text                   -- 'read' | 'write'
  last_used_at  timestamptz
  expires_at    timestamptz            -- デフォルト90日
  revoked_at    timestamptz
  created_at    timestamptz
```

- トークン形式は `cairn_pat_<random 32bytes base62>`。プレフィックスで secret scanning に引っかけやすくする
- **ワークスペース固定にする理由**: 現状 Bearer のみのリクエストは `getAuthContext()` が「最初の active membership」にフォールバックする。複数 WS 所属ユーザーのトークンが意図しない WS に落ちる事故を防ぐため、発行時に WS を選ばせて紐付ける

### 認証パスの拡張（`get-auth-context.ts`）

- `Authorization: Bearer cairn_pat_...` の場合は PAT 検証パスへ分岐（プレフィックスで判別。Supabase JWT 検証とは独立）
- 検証内容: ハッシュ照合 → `revoked_at` / `expires_at` チェック → **トークンの `workspace_id` で active membership を再照合**（非活性化されたユーザーのトークンはここで 403 になる。[`user-deactivation-design.md`](./user-deactivation-design.md) の遮断原則を PAT にも適用）
- `scope: 'read'` のトークンで書き込み系 API を叩いた場合は 403
- `last_used_at` は書き込み頻度を抑えるため数分単位で間引いて更新する

### 発行 UI

- `/settings/integrations` に「アクセストークン」セクションを追加（発行・一覧・失効。平文は発行直後に一度だけ表示）
- 発行できるのは member 以上。guest には発行させない（ゲストの API アクセス範囲設計が別途必要になるため、初期スコープから除外）

---

## 4. ツール設計

### 初期セット（Phase 1）

「タスクの取得・成果物の投稿・完了報告」のループが回る最小構成に絞る。

| ツール | 種別 | 対応する既存 API |
|---|---|---|
| `list_projects` | read | `GET /api/projects` |
| `get_project` | read | `GET /api/projects/[id]` |
| `list_my_tasks` | read | `GET /api/tasks`（自分が担当のもの） |
| `create_task` | write | `POST /api/tasks` |
| `complete_task` | write | `PATCH /api/tasks/[id]` |
| `post_message` | write | `POST /api/channels/[channelId]/messages` |
| `search_messages` | read | `GET /api/search/messages` |

- 入力スキーマは `packages/shared` の Zod スキーマ（`createProjectSchema` 等）を流用する。MCP TypeScript SDK はツール入力を Zod で定義するため相性が良い
- ツールの説明文（description）は英語で書く（クライアント側 LLM の理解精度優先）。エラーメッセージは API の日本語メッセージをそのまま透過する

### 第2弾以降の候補

- ファイル添付（成果物アップロード）: Supabase Storage の署名 URL 発行 API を挟む必要があるため初期スコープ外
- マイルストーン参照（[`milestone-design.md`](./milestone-design.md) 実装後）
- MCP Resources としてのプロジェクト概要・AGENTS.md の公開

---

## 5. エージェントの身元と行動規律

### 当面: ユーザー本人として行動（on behalf of）

PAT はユーザーの身元で発行されるため、外部エージェントの投稿・タスク操作は**トークン所有者本人の行為**として記録される。責任の所在が明確で、既存の権限モデル・履歴表示をそのまま使える。

- 投稿メッセージに「エージェント経由」であることを示すメタデータ（例: `messages` にクライアント識別のカラム追加、または本文への機械的なフッタ付与）を付けるかは初期リリースで判断する。少なくとも PAT 経由の書き込みであることはサーバ側で判別可能にしておく（監査ログ・`last_used_at`）

### 将来: agent profile への接続

[`10_ai_member_design.md`](./10_ai_member_design.md) の agent 用 profile（`kind: 'agent'` 相当）が実装されたら、PAT を agent profile に紐付けて発行するモードを追加し、外部エージェントが独立した身元（エージェントバッジ付き）で発言できるようにする。同ドキュメントの設計原則をそのまま適用する:

- すべての行動を可視化（AI の操作はチャンネルに残る）
- 不可逆な操作は承認制（`ai_pending_actions` 実装後、write ツールを承認フローに接続する選択肢）

---

## 6. セキュリティ

| 論点 | 対策 |
|---|---|
| トークン漏洩 | ハッシュ保存・プレフィックスによる secret scanning 対応・有効期限デフォルト90日・設定画面から即時失効 |
| 権限昇格 | PAT は発行者のロールを超えない。認可は既存 `getAuthContext()` → `permissions.ts` を必ず通す |
| 非活性化ユーザーの残存トークン | 認証のたびに `active_workspace_members` で再照合（§3）。非活性化と同時に全 PAT が実質無効化される |
| スコープ超過 | `read` / `write` の2段階。read トークンでの write 系 API は 403 |
| 乱用・暴走エージェント | Route Handler 側のレートリミット（Phase 2 のリモート化までに導入）。書き込みはすべて通常のメッセージ・タスクとして可視化されるため、人間が気づける |

---

## 7. 実装フェーズ

| フェーズ | 内容 | 依存 |
|---|---|---|
| 1a | PAT 機構（`api_tokens` テーブル + `getAuthContext()` 拡張 + `/settings/integrations` UI） | なし |
| 1b | `packages/mcp`（stdio サーバ、初期ツール7個、npm 公開） | 1a |
| 2 | `/api/mcp`（Streamable HTTP）+ レートリミット | 1b |
| 3 | agent profile 紐付け PAT・承認フロー接続 | [`10_ai_member_design.md`](./10_ai_member_design.md) Stage 2 相当の実装 |

1a + 1b が完了した時点で、Claude / Codex から「タスクを取って → 作業して → 完了報告がプロジェクトチャンネルに届く」デモが動く（= [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) の座取りの最小実証）。

---

## 8. 未決事項

- 投稿メッセージへの「エージェント経由」表示の要否と実装方式（カラム追加 / 本文フッタ / 当面なし）
- PAT の有効期限ポリシー（無期限を許すか。初期はデフォルト90日・最長1年を想定）
- guest ロールへの PAT 発行可否（初期は不可。外部協力者のエージェント利用ニーズが出たら再検討）
- npm パッケージ名（`@cairn/mcp` はスコープ取得が必要。取れない場合の代替名）
- Phase 2 の OAuth 2.1 対応（ChatGPT コネクタ等が PAT ヘッダ方式で足りるかを見てから判断）
