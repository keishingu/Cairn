# AGENTS.md

AI エージェント共通の指示（`CLAUDE.md` は `@AGENTS.md` の import のみ。Windows でシンボリックリンクが壊れるため）。詳細は必要な作業のときだけ [`docs/README.md`](docs/README.md) から辿る。**ドキュメントと実装が矛盾する場合はコードと本ファイルを正とする。**

## 全般

- ユーザーの指示が曖昧なら質問する
- 開発手順・アーキテクチャ・技術判断を変えたら README.md / AGENTS.md / 該当 docs を更新する。本ファイルには全作業に効く規約と判断だけを1〜2行で書き、手順や詳細は docs へ置く
- **本リポジトリはパブリック**。非公開の他プロジェクト名・顧客名などの固有名詞をコード・ドキュメント・コミット・PR・issue に含めない（「別プロジェクト」等に言い換える）

## リポジトリ構成

pnpm Workspace + Turborepo のモノレポ。コマンド: `pnpm dev` / `build` / `typecheck` / `lint` / `test`

```
apps/web/          Next.js 15 (Web + API Route Handlers + リモート MCP)
apps/mobile/       Expo (WebView ラッパー + ネイティブチャット + Push)
apps/desktop/      Electron (Web 版を表示。pnpm desktop:dev / desktop:build:prod / desktop:build:dev)
packages/core/     DB・フレームワーク非依存のドメインロジック（現状は @cairn/core/billing）
packages/db/       Drizzle ORM スキーマ・クライアント (Supabase PostgreSQL)
packages/shared/   共有型 + Zod スキーマ + FEATURE_FLAGS
packages/config/   tsconfig / ESLint 共有設定
```

## 技術スタック

- Next.js 15 / React 19 / TypeScript / Tailwind CSS v3 / shadcn/ui。サーバー状態は TanStack Query、UI 状態は React state、テーマは `next-themes`、URL 状態は App Router のパスと `useSearchParams`
- Supabase（PostgreSQL + pgvector / Auth / Realtime / Storage）+ Drizzle ORM。Write / Read DB は分離しない
- 非同期ジョブは Inngest。AI は Vercel AI SDK + OpenAI（gpt-5 / gpt-5-mini）。**Claude は使用しない**。AI PMO Phase 2 の判定だけ Vercel AI Gateway の `typesafe-ai/jev` を `/v1/evaluate` へ HTTP 直呼び（AI SDK v4 に Evaluation API がないため）
- **Realtime は Broadcast from Database のみ**（DB トリガー + `realtime.broadcast_changes()` → `RealtimeProvider` がクエリを invalidate → REST 再取得）。**postgres_changes は本プロジェクトでは動かないため使わない**。ポーリングやフォールバックも置かない
- tsconfig の `extends` は相対パス（`../../packages/config/tsconfig/base.json`）。Vitest の `tsconfck` が workspace パッケージ参照を解決できないため

## ローカル開発

手順は [README.md](README.md#ローカル開発環境)。起動は `supabase start` → `cp apps/web/.env.local.example apps/web/.env.local` → `supabase migration up --local --include-all` → `pnpm dev`（DB 系コマンドはリポジトリルートで実行）。

- スキーマは `packages/db/src/schema/` が正。`pnpm --filter @cairn/db db:generate` で `supabase/migrations/` に SQL を生成する。**ファイル名は timestamp を残し、ランダムな形容詞名を変更内容が分かる英語 snake_case に直す**（例: `20260804115423_add_api_tokens.sql`）
- **ブランチ切り替え後は `supabase migration up --local --include-all`**。未適用だと enum 不一致や Realtime 認可ポリシー欠如で API 500・Realtime 接続不能になり、原因に気づきにくい
- `supabase db reset --local` はデータを破棄する。破棄してよい環境（CI・初回検証）以外で使わない
- **通知・AI インデックスは Inngest 経由**。Inngest dev server を起動していないとメンション・DM・ファイル通知がサイレントに生成されない

## 決定済みの技術判断

- **API 認証は Bearer（Supabase JWT）**: Web も Expo も同じ Route Handlers を呼ぶ。新規ルートは必ず `getAuthContext()`（Authorization 優先、Cookie フォールバック）を使う。規約は [`docs/api-conventions.md`](docs/api-conventions.md)
- **UA でデバイス出し分け**: middleware が `x-device` をセットし、`app/(app)/layout.tsx` で PC / モバイルシェルを切り替える。レスポンシブ CSS は使わない
- **認証後の既定画面は `/chats`**: サイド先頭・モバイル左端タブ・ログイン後・PWA / Electron / Expo 起動先をチャットに統一。数字ナビはチャット `1`、プロジェクト一覧・カレンダー・カンバン・マイタスク `2`〜`5`
- **プロジェクトビュー（一覧 / カレンダー / カンバン）は localStorage のみで永続化**（`STORAGE_KEYS.projects_view_pc` / `_mob`）。URL パラメータは使わない
- **設定は `/settings/[section]` の URL 駆動**。定義と本体は `apps/web/src/components/app/pages/settings.tsx`（`SETTINGS_NAV_GROUPS` / `SettingsSectionContent`）に集約し PC / モバイルで共有。`?tab=` は廃止
- **ファイル一覧は `files.project_id` 別の折りたたみ表示**（未所属は「プロジェクトなし」）。保存フィルター `saved_file_filters` はユーザー × ワークスペース単位で共有しない。`storage_path` を表示上の分類に使わない
- **FEATURE_FLAGS**（`packages/shared/src/config/feature-flags.ts`）を Web・API・Expo で共有。DM と AI PMO は全環境で有効、AI PMO の実配信はワークスペース設定で段階公開。Feature Flag は市場投入判断に使い、インフラの環境差には使わない
- **PostHog は production 限定**（`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` がある場合だけ初期化。認証後 Supabase user ID で `identify`、サインアウトで `reset`）
- **認証メールは Supabase Auth が生成し Resend SMTP で配送**。アプリに送信ロジックを実装しない。[`docs/resend-email-provider.md`](docs/resend-email-provider.md)
- **外部 AI 連携はリモート MCP（`/api/mcp`）+ workspace 固定 PAT / OAuth**。本人代理・guest 不可・`read` / `write` scope。OAuth token は `/api/mcp` の request context 内だけで有効で、通常 REST の資格情報にしない。[`docs/mcp-server-design.md`](docs/mcp-server-design.md)
- **モバイル（Expo）**: チャット以外は WebView。WebView 認証はワンタイムトークンハンドオフで、**ネイティブの refresh_token を WebView に渡して `setSession()` するのは禁止**（rotation 衝突でセッションが失効する）。ネイティブの送信は必ずオフラインキューを経由する。その他のヘッダー所有・ワークスペース/テーマ共有・EAS・OAuth などは [`docs/mobile-app.md`](docs/mobile-app.md)

## 権限モデル

- **権限はワークスペースロールのみで決定する**。プロジェクトロールは業務上の役割で、システム権限に影響させない（表示名・色・順序は `project_roles`、新コードは `project_members.role_id` を優先）
- `owner`: WS 設定 + admin の全権限 / `admin`: メンバー管理・招待、プロジェクト作成・削除、ゲスト招待 + member / `member`: プロジェクト編集・メンバー追加削除・日常操作 / `guest`: 参加プロジェクトのみ
- サーバー側チェックは常に必須。ヘルパーは `apps/web/src/lib/permissions.ts`（`requireWorkspaceOwner` / `Admin` / `Member`）。403 はロールを明示した日本語メッセージにし、フロントに生の 401/403 を出さない。UI は `useWorkspacePermissions()` で事前に disable・非表示にする
- **非活性メンバー（`membership_status = 'inactive'`）は未所属と同等**。**認可目的の membership 参照は `apps/web/src/lib/access/membership.ts` と `active_workspace_members` ビューを必ず経由する**（Storage RLS・Realtime の `can_access_channel` も同ビュー）。発言者・担当者など履歴上の行為者の表示 join だけは `workspace_members` を直接引く。[`docs/user-deactivation-design.md`](docs/user-deactivation-design.md)

## エラー表示

- 明示的な指示がない限り、取得できない・見つからないデータをサイレントに代替値へ fallback せず、エラーを表示する（`?? default` で誤ったデータを見せない）

## `/chats` とアプリ版

Web の `/chats` を変えるときは、Expo のネイティブチャット（`apps/mobile/app/(app)/chats/`）にも同じ変更が要るか確認する。会話一覧・メッセージ・返信・メンション・添付・未読・Realtime などアプリ利用者にも届く挙動なら同じ変更で直す。Web のシェルやキーボードショートカットだけなら触らない。判断は変更の説明に残す。

## テスト

- vitest。テストは対象ファイルの隣に置き（`foo.ts` → `foo.test.ts`）、`describe` / `test` の説明文は日本語
- `packages/db` のテストは DB 接続が必要なため原則書かない

## ブランチ・デプロイ

- **デフォルトブランチは `develop`**。`feat/` `fix/` `refactor/` 等のブランチを `develop` から切り、PR も `develop` 宛て。`main` は本番で、`develop` → `main` の PR で反映する（どちらにも直接コミットしない）
- Vercel の Git 連携で `develop` → `develop.oss-cairn.com`、`main` → `oss-cairn.com` に自動デプロイ
- **DB マイグレーションは merge 時に `migrate.yml` が自動適用**するが、Vercel デプロイとの順序は保証されない。**マイグレーションは後方互換を基本とし、破壊的変更（カラム削除・リネーム等）は2段階リリース**にする
- 詳細（Secret を GitHub Environment に置く理由、dry-run、リリース手順）は [`docs/production-deployment.md`](docs/production-deployment.md)

## コミットメッセージ

- Conventional Commits のプレフィックス（`feat:` `fix:` `chore:` `docs:` 等）+ 日本語の体言止めの件名
- 何を変えたかより**なぜ**変えたかを書く。変更ファイルや実装方法は繰り返さない。推奨: `fix: XXXXのため、ZZZZを修正`
- AI エージェントがコミットする場合は `Co-Authored-By: <エージェント名> <noreply メール>` トレーラーを付ける

## GitHub レビュー指摘への返信

- 「妥当な指摘のため、対応しました」のような汎用文で済ませず、問題になる理由・影響と修正内容を1文で具体的に書く
- 対応 commit は「コミットメッセージ + commit リンク」の Markdown リンクで示す
- AI エージェントは末尾に署名する（例: `— 🤖 Claude (Claude Code)` / `— 🤖 Codex`）

## ユーザーの許可と自動承認レビュー

- 明示的な依頼・許可は意味で判断し、定型句や完全一致を要求しない
- 許可済みの操作が自動承認レビューで拒否されたら、ユーザーの許可不足と混同せず拒否理由を説明する。新しい判断材料がなければ再試行せず、別手段で回避もせず、ユーザーの返信を待つ

## 作業別の参照先

- UI 実装・レビュー: [`docs/frontend-guidelines.md`](docs/frontend-guidelines.md)、[`.interface-design/system.md`](.interface-design/system.md)
- 通知・未読・Push・Realtime: [`docs/notification-design.md`](docs/notification-design.md)
- その他の文書と信頼度: [`docs/README.md`](docs/README.md)
