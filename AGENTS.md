# AGENTS.md

全作業に効く指示だけを置く。ディレクトリ固有の判断は各ディレクトリの `AGENTS.md`（`apps/web/` `apps/mobile/` `packages/db/`）に、詳細は [`docs/README.md`](docs/README.md) から辿る。`CLAUDE.md` は各階層とも `@AGENTS.md` の import のみ（Windows でシンボリックリンクが壊れるため）。**ドキュメントと実装が矛盾する場合はコードと AGENTS.md を正とする。**

## 全般

- ユーザーの指示が曖昧なら質問する
- 開発手順・アーキテクチャ・技術判断を変えたら README.md / 該当する AGENTS.md / docs を更新する。AGENTS.md には守らないと不具合や事故になる規約だけを1〜2行で書き、手順・経緯・機能仕様は docs へ置く
- **本リポジトリはパブリック**。非公開の他プロジェクト名・顧客名などの固有名詞をコード・ドキュメント・コミット・PR・issue に含めない（「別プロジェクト」等に言い換える）

## 構成と技術スタック

pnpm Workspace + Turborepo。`pnpm dev` / `build` / `typecheck` / `lint` / `test`

- `apps/web` Next.js 15（Web + API Route Handlers + リモート MCP）/ `apps/mobile` Expo / `apps/desktop` Electron（Web を表示）
- `packages/core` DB・フレームワーク非依存のドメインロジック / `packages/db` Drizzle スキーマ / `packages/shared` 共有型・Zod・FEATURE_FLAGS / `packages/config` tsconfig・ESLint
- Supabase（PostgreSQL + pgvector / Auth / Realtime / Storage）、Inngest、AI は OpenAI（**Claude は使用しない**）
- tsconfig の `extends` は相対パスで書く（Vitest の `tsconfck` が workspace 参照を解決できない）

## ローカル開発

手順は [README.md](README.md#ローカル開発環境)。DB 系コマンドはリポジトリルートで実行する。

- **ブランチ切り替え後は `supabase migration up --local --include-all`**。未適用だと API 500・Realtime 接続不能になり、原因に気づきにくい
- **通知・AI インデックスは Inngest 経由**。Inngest dev server を起動していないと通知がサイレントに生成されない

## 横断ルール

- **Realtime は Broadcast from Database のみ**（DB トリガー → `realtime.broadcast_changes()` → クライアントがクエリを invalidate して REST 再取得）。**postgres_changes は本プロジェクトでは動かないため使わない**。ポーリング・フォールバックも置かない
- **エラーを隠さない**: 取得できない・見つからないデータをサイレントに代替値へ fallback せず、エラーを表示する（`?? default` で誤ったデータを見せない）
- **権限はワークスペースロール（owner / admin / member / guest）だけで決める**。プロジェクトロールはシステム権限に影響させない。サーバー側チェックは常に必須で、UI ガードは補助
- **非活性メンバーは未所属と同等**。認可目的の membership 参照は `active_workspace_members` ビュー（Web は `apps/web/src/lib/access/membership.ts`）を必ず経由する。Storage RLS・Realtime 認可も同じ

## テスト

- vitest。テストは対象の隣に置き（`foo.ts` → `foo.test.ts`）、`describe` / `test` の説明文は日本語

## ブランチ・デプロイ

- **デフォルトブランチは `develop`**。`feat/` `fix/` `refactor/` 等を `develop` から切り、PR も `develop` 宛て。`main` は本番（`develop` → `main` の PR で反映）。どちらにも直接コミットしない
- merge で Vercel が自動デプロイし、`migrate.yml` が DB マイグレーションを自動適用する。詳細は [`docs/production-deployment.md`](docs/production-deployment.md)

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
