# apps/web

Next.js 15 / React 19 / Tailwind CSS v3 / shadcn/ui。サーバー状態は TanStack Query、UI 状態は React state、テーマは `next-themes`、URL 状態は App Router のパスと `useSearchParams`。UI の実装・レビューは [`docs/frontend-guidelines.md`](../../docs/frontend-guidelines.md) と [`.interface-design/system.md`](../../.interface-design/system.md)。

## API

- 新規ルートは必ず `getAuthContext()` でユーザー・ワークスペースを取る（`Authorization: Bearer` 優先、Cookie フォールバック。Web も Expo も同じ Route Handlers を呼ぶ）。規約は [`docs/api-conventions.md`](../../docs/api-conventions.md)
- 例外はアプリ（Bot）向けの `/api/app-api/<method>` だけ。`verifyBotToken` で Bot トークンを検証し、スコープとチャンネル参加は `lib/apps/web-api` で判定する（`getAuthContext()` に置き換えない。[`docs/app-platform-design.md`](../../docs/app-platform-design.md) §6）
- 権限チェックは `src/lib/permissions.ts` の関数を使い、独自の判定を書かない。ワークスペース単位の操作は `requireWorkspaceOwner` / `requireWorkspaceAdmin` / `requireWorkspaceMember`、プロジェクト・チャンネル・ファイルなど参加者の guest も使うリソースは `requireProjectAccess` / `requireChannelAccess` / `canAccessFile`（`requireWorkspaceMember` にすると guest が全員弾かれる）。403 はロールを明示した日本語メッセージにし、フロントに生の 401/403 を出さない。UI は `useWorkspacePermissions()` で事前に disable・非表示にする
- 認可目的の membership 参照は `src/lib/access/membership.ts` を経由する。発言者・担当者など履歴上の行為者の表示 join だけは `workspace_members` を直接引き、非活性でも本人名義で残す（[`docs/user-deactivation-design.md`](../../docs/user-deactivation-design.md)）
- MCP（`/api/mcp`）の OAuth token は同一 request context 内だけで有効。通常 REST の資格情報にしない（[`docs/mcp-server-design.md`](../../docs/mcp-server-design.md)）

## 画面

- **UA でデバイス出し分け**: middleware が `x-device` をセットし、`app/(app)/layout.tsx` で PC / モバイルシェルを切り替える。レスポンシブ CSS は使わない
- **`.btn` などの部品クラスは `.app` 配下でしか効かない**（`globals.css` が `.app .btn` の子孫セレクタ）。シェルのルートは `app app-root` にし、全画面パネルや portal をその外に出さない（外れるとモバイルのプロジェクト詳細でボタンの見た目が崩れる）
- **認証後の既定画面は `/chats`**。数字ナビはチャット `1`、プロジェクト一覧・カレンダー・カンバン・マイタスク `2`〜`5`
- **プロジェクトビューは localStorage のみで永続化**（`STORAGE_KEYS.projects_view_pc` / `_mob`）。URL パラメータは使わない
- **設定は `/settings/[section]` の URL 駆動**。定義と本体は `src/components/app/pages/settings.tsx` に集約し PC / モバイルで共有する
- **表示文言は i18next**。キーは英語の UI 文（`t('Sign in with Google')`）。翻訳カタログは `packages/shared/src/i18n/ja.ts` と `ko.ts`（英語はキー原文）。`translate()` は呼び出しごとに `lng` を渡すので、サーバー側でインスタンスの言語は切り替えない。言語は `profiles.locale`（`ja` / `en` / `ko` / `system`）で、`system` は Accept-Language と `navigator.languages` を同じ順で解決する。URL にロケールを付けない。ワークスペースのプロジェクト呼び方は未設定（null）のときだけ訳し、保存済みの文字列はそのまま出す
- **メンション名のread時解決は `src/lib/chat/mention-name-map.ts` を共有し、同じワークスペースの所属履歴に限定する**。非活性メンバーの履歴表示は維持する。
- **`/chats` を変えるときは Expo のネイティブチャット（`apps/mobile/app/(app)/chats/`）にも同じ変更が要るか確認する**。アプリ利用者にも届く挙動（一覧・メッセージ・返信・メンション・添付・未読・Realtime）なら同じ変更で直し、判断を変更の説明に残す

## その他

- FEATURE_FLAGS は市場投入判断のためのもので、インフラの環境差には使わない
- AI 機能は Vercel AI SDK v4。チャット（`/ai`）のモデルは `workspaces.ai_chat_model`（`gpt-5` / `claude-sonnet-5-5` / `claude-opus-5-5`、owner が設定）で決まり、AI PMO Phase 2 の通知文は `claude-haiku-5-5` 固定、埋め込みは OpenAI `text-embedding-3-small`。選択中モデルのプロバイダーのキー（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`）が無ければ別プロバイダーへ逃がさず 503 を返す。AI PMO Phase 2 の判定だけ Vercel AI Gateway の `typesafe-ai/jev` を HTTP で直接呼ぶ（AI SDK v4 に Evaluation API がないため）
- **`/ai` のワークスペースのシステムプロンプト（`workspaces.ai_chat_system_prompt`）は、system prompt の「権限・安全規律」より前に区切りタグで囲んで入れ、規律より優先させない**。組み立ては `src/app/api/ai/conversations/[id]/messages/system-prompt.ts` に集約する（[`docs/10_ai_member_design.md`](../../docs/10_ai_member_design.md#ワークスペースのシステムプロンプト)）
- **Claude 5.5 系は既定以外の `temperature` / `topP` / `topK` / `thinking` と強制 `toolChoice` を 400 で拒否する**（Haiku の `generateObject` の強制ツールは対象外）。AI SDK v4 は `temperature` 未指定でも 0 を補って送るため、Claude は必ず `src/lib/ai/client.ts` の `chatLanguageModel()` / `nudgeCopyLanguageModel()` 経由で使う（`anthropic-compat-middleware.ts` が temperature 除去・空 thinking ブロックの補完・maxTokens 未指定時の上限 16000 の補完を行う）。新しい呼び出しで `temperature` を指定しない
- **アプリ基盤の外部仕様（受け付けるブロック・上限・Bot Web API のメソッドとエラー・インタラクションのペイロード）を変えたら、同じ変更で公開ドキュメント `src/app/developers/_content/` の日英両方も更新する**。外部の開発者はこのページだけを見てアプリを作る。ブロックの上限は `BLOCK_LIMITS` から引いているので数値の二重管理はしない
- **機能・UI 導線・権限を変えたら、同じ変更で `/ai` のプロダクトヘルプ `src/lib/ai/product-help.ts`（`PRODUCT_HELP_CONTEXT`）も更新する**。`/ai` が製品の使い方に答える唯一の情報源で、古いままだと利用者に誤った手順を案内する
