# チャンネル単位・本人限定のAI相談パネル設計

作成日: 2026-07-01
ステータス: 構想・議論段階（実装未着手）
提供形態: **Lab機能**（試験的機能。今後仕様が変わりうる）

チャットの各会話（チャンネル）を起点に、**本人だけに見えるAI相談**を右サイドバーで
その場で行えるようにするための設計方針。会話コンテキストを都度コピーして外部の
Claude / ChatGPT に貼り直す手間をなくすことを狙う。

---

## 1. 背景と目的

チャットのメッセージに対して、次のような相談を「その画面のまま」行いたい。

- 「これ、どうやって返信する？」（返信文の下書き）
- 「スケジュール引き直して」（提示された日程の再計算・整形）
- 「資料に反映させて」／「資料の下書きを作って」（ドキュメントの草案生成）

現状、AI は `/ai` タブのワークスペース全体アシスタント（`PageChat` ではなく
`components/app/pages/ai.tsx` の `PageAI`）に閉じており、

- **特定チャンネル／特定メッセージを起点にした相談動線がない**（毎回タブを移動し、
  コンテキストを手で貼る必要がある）
- **相談内容が本人だけに見える保証がない**（`GET /api/ai/conversations` は
  `created_by` で絞らずワークスペース全体を返している）

という課題がある。

そこで、**チャンネル単位・本人のみ閲覧のAI相談パネルを右サイドバーに追加し、
メッセージの「返信」列や「…」メニューから起点メッセージ付きで開ける**ようにする。

### `docs/10_ai_member_design.md` との棲み分け

| 観点 | `docs/10` AIメンバー | 本書 AI相談パネル |
|---|---|---|
| 関係 | チームの共有空間（多対多） | 本人と AI（1対自分・プライベート） |
| 発言の帰属 | `messages` 行としてチャンネルに公開 | `ai_messages` に保存し**本人のみ閲覧** |
| 主な役割 | メンバーとして催促・提案・可視化 | 下書き・要約・相談の壁打ち |
| 起動 | `@エージェント名` メンション | 右サイドバーのパネル / 「…」→「AIに相談」 |
| 実行権限 | Stage 2 以降で承認制の操作 | **相談・下書きのみ（実行しない）** |

両者は競合せず両立する。本書のパネルで固まった下書きを、将来 `docs/10` の承認カード
（Stage 2）に渡してチャンネルへの投稿・タスク化につなぐ、という接続を想定する。

---

## 2. スコープと非スコープ

### やること（v1）

- チャットの右サイドバーに「AI相談」パネルを追加（既存の `ChatDetailSidebar` と切替表示）
- メッセージの「…」メニューに「AIに相談」を追加し、**起点メッセージ付き**でパネルを開く
- 会話は**チャンネル単位**でスコープし（プロジェクト／全体／DM すべて対応）、
  **本人（`created_by`）だけが閲覧**できる
- 既存の `streamText` 基盤・RAG・Web検索をそのまま使ってテキストを生成し、
  出力を**チャット入力欄へ挿入 or コピー**して受け取る
- **Google カレンダー読み込みと同じ Lab機能**として提供（env 有無で有効化、
  Settings→連携 に Lab バッジ、ユーザー opt-in）

### やらないこと（v1では非スコープ）

- **DB の書き換え=実行系**（タスク起票・ステータス変更・日程の確定反映など）。
  → `docs/10` の Stage 2（承認カード経由）として将来接続する
- **ファイル／資料への書き込み=Office操作**（「資料に反映させて」の“反映”そのもの）。
  → v1 は「草案テキストの生成」までとし、ユーザーが自分で反映する
- **共有・他人閲覧**（チームで共有される相談ログ、他メンバーからの参照）

---

## 3. UX / 動線

### 3.1 右サイドバー「AI相談」パネル（PC）

- チャット右カラムを、既存 `ChatDetailSidebar`（「このプロジェクトについて」）と
  **タブ／トグルで切り替え**て「AI相談」パネルを表示する。開閉状態は `PageChat` が
  握っている `detailOpen` の隣に、表示中パネル種別（`'detail' | 'ai'`）の状態を追加する
- パネル中身は `PageAI` の `ChatView` に相当する軽量チャットUI（メッセージ列 + 入力欄 +
  サジェストチップ）。パネルヘッダーに flask + **「Lab」バッジ**を表示する
- チャットヘッダー右側（`AvatarStack`／検索／ベルの並び）に **sparkles ボタン**を追加し、
  起点なしでパネルを開けるようにする

### 3.2 起点メッセージ付きの相談（「…」メニュー）

- `chat-thread.tsx` の `ChatMessage` の `menuActions`（現状「リンクをコピー / コピー /
  編集 / 削除」）に **「AIに相談」** を追加する
- 選択すると、その**メッセージ本文を引用ブロックとして**パネルへ渡してパネルを開く。
  パネルは引用を先頭に表示し、サジェストチップ（例:「この内容にどう返信する？」
  「要点を3行で」「スケジュールを引き直して」）を提示する
- 受け渡しは、`PageChat` に持たせる「AI相談の起点」状態（`{ messageId, content }`）を
  `ChatMessage → ChatThread → PageChat` のコールバック（`onConsultAI` 等）で押し上げ、
  パネルに渡す。パネルは起点が変わったら新規会話 or コンテキスト差し替えを行う

### 3.3 出力の受け取り

- パネルの各アシスタント返信に「**入力欄に挿入**」「**コピー**」を置く
- 「入力欄に挿入」は `PageChat` 側のチャット入力ドラフト（`ChatInputBar` の `draft`）へ
  文字列を流し込む。既存の返信プレビュー（`replyTarget`）と同様、`PageChat`→`ChatThread`
  へドラフト初期値を渡す口を1つ用意する（未決事項 9 参照）

### 3.4 モバイル

- 第一段は **PC 優先**。モバイルは既存 `ChatInfoDrawer` に相当するドロワー、または
  全画面遷移で後続フェーズに実装する

---

## 4. データモデル

既存の `ai_conversations` / `ai_messages`（`packages/db/src/schema/ai.ts`）を再利用する。
`ai_conversations` は既に `project_id` / `created_by` を持つが **`channel_id` が無い**ため、
チャンネル単位スコープ用に追加する。

- `ai_conversations` に列を追加:
  - `channel_id uuid REFERENCES channels(id) ON DELETE CASCADE`（NULL 可。
    既存のワークスペース全体アシスタント会話は NULL のまま）
  - `project_id` は任意併記（プロジェクトチャンネルは両方埋める。全体チャンネル・DM は
    `channel_id` のみ）
- インデックス追加: `idx_ai_conversations_channel_creator (channel_id, created_by, created_at desc)`
  （本人 × チャンネルの会話一覧を新しい順で引くため）
- 手順: `packages/db/src/schema/ai.ts` を変更 → `pnpm db:generate` で
  `supabase/migrations/` に timestamp prefix の SQL を生成 → `supabase migration up`
  （`packages/db/drizzle.config.ts` の `migrations.prefix = 'timestamp'` に従う）

`ai_messages` は変更不要。引用した起点メッセージは、ユーザーメッセージ本文に含めるか、
`annotations` に `{ type: 'source-message', messageId, content }` として持たせる
（既存の `annotations`（`rag-sources`）と同じ仕組みに相乗り）。

---

## 5. API 設計

既存の 2 ルートを拡張する。認証は既存どおり `getAuthContext()`。

### 5.1 `apps/web/src/app/api/ai/conversations/route.ts`

- **`GET`**: クエリ `?channelId=` を受け取り、
  `where workspace_id = ctx.workspaceId AND created_by = ctx.userId AND channel_id = :channelId`
  で絞る。**`created_by` 絞りを必須化**し、本人限定を担保する
  - 既存 `/ai` タブ（ワークスペース全体アシスタント）は `channelId` 無しで呼ぶ。
    その場合は `channel_id IS NULL AND created_by = ctx.userId` を返す方針とし、
    「全メンバーの会話が見えていた現状」を creator 限定へ寄せる（`/ai` タブの一覧統合は
    未決事項 9）
- **`POST`**: body で `{ channelId?, projectId? }` を受け取り、`created_by = ctx.userId` と
  ともに保存。`channelId` 指定時は**チャンネル所属を確認**（`permissions.ts` の
  `channelMembers` 参照ヘルパー）してから作成する

### 5.2 `apps/web/src/app/api/ai/conversations/[id]/messages/route.ts`

- 会話所有チェックを `workspace_id` に加え **`created_by = ctx.userId`** でも行う
- 会話の `channel_id` があれば所属確認を行い、`project_id` を用いて RAG を
  そのプロジェクトに寄せる（`searchChunks` の `allowedProjectIds`）。ゲストは既存どおり
  `getGuestVisibleProjectIds` で制限する
- 起点メッセージ本文＋（任意で）直近メッセージを system prompt / context に注入する。
  system prompt には「あなたはこのチャンネルの文脈で本人の相談に答える。出力は本人にしか
  見えない下書きであり、勝手に投稿・実行はしない」旨を明記する
- `OPENAI_API_KEY` 未設定時は 503（既存踏襲）

---

## 6. Lab機能としての提供

`components/app/pages/settings.tsx` の Google カレンダー読み込み節（Lab）と同じ枠組みに
そろえる。

- **有効化条件**: `OPENAI_API_KEY` の有無で `configured` を判定（既存 AI ルートが
  未設定時 503 を返すのと整合）。判定は `/api/dev/status` 等の既存経路 or 専用 status を
  検討する
- **設定UI**: Settings→連携 に AI相談セクションを追加し、flask アイコン + **「Lab」バッジ**
  + 「試験的な機能のため、今後仕様が変更される場合があります。」注記を付ける
- **ユーザー opt-in**: トグルで、チャットの相談動線（サイドバーの sparkles ボタン・
  「…」→「AIに相談」）の表示可否を本人ごとに切り替える。既定は OFF（Lab のため）
- opt-in の保存先は**ユーザー設定（DB）を推奨**（デバイス跨ぎで一貫。将来サーバー側で
  機能ゲートしやすい）。簡易実装として localStorage も選択肢だが、複数端末で不一致に
  なるため非推奨。→ 未決事項 9

---

## 7. プライバシー・権限

- **本人限定の担保**: 一覧・取得・生成のすべてで `created_by = ctx.userId` を必須にする。
  さらに会話の `channel_id` に対する所属確認（`channelMembers`）を行い、退出済みチャンネルの
  会話を新規生成できないようにする
- **ゲスト**: RAG 参照は `getGuestVisibleProjectIds` で参加プロジェクトのチャンクに限定
  （既存の生成ルートの挙動を踏襲）
- **共有しない**: 相談ログは他メンバー・チームに一切露出しない。通知・未読・メンションの
  対象にもしない（`ai_messages` は `messages` とは別テーブルのため既存導線に乗らない）

---

## 8. 段階リリース

- **Phase 1（PC・v1）**: 右サイドバー「AI相談」パネル、起点なし/ありの相談、
  テキスト出力の「入力欄に挿入 / コピー」。Lab トグルでゲート
- **Phase 2**: モバイル動線、スケジュール引き直し等の構造化サジェスト（プロンプト整備）、
  `/ai` タブ一覧との整理
- **Phase 3**: `docs/10` Stage 2（承認カード）への接続。パネルで固めた下書きを
  チャンネル投稿・タスク化・日程反映へ、**人間の承認を挟んで**渡す

---

## 9. 未決事項

- **出力挿入の実装口**: `PageChat` → `ChatThread` → `ChatInputBar` の `draft` へ外部から
  文字列を注入する経路をどう1本化するか（`replyTarget` と同じ押し込み方にそろえるか）
- **opt-in の保存先**: ユーザー設定（DB）か localStorage か。推奨は DB
- **`/ai` タブとの統合**: ワークスペース全体アシスタント（`channel_id IS NULL`）と
  チャンネル相談を一覧上どう見せ分けるか。現状 `GET` が creator 非限定な点の是正範囲
- **コンテキストの広さ**: 起点メッセージ単体か、続くスレッド／直近N件まで含めるか
- **コスト上限**: 1相談あたり・1日あたりのトークン/回数上限、`gpt-4o` / `gpt-4o-mini` の
  使い分け

---

## 参照

- `docs/10_ai_member_design.md` — 共有チャンネルに住む AIメンバー設計（棲み分け先）
- `packages/db/src/schema/ai.ts` — `ai_conversations` / `ai_messages`
- `apps/web/src/app/api/ai/conversations/route.ts` — 会話一覧・作成
- `apps/web/src/app/api/ai/conversations/[id]/messages/route.ts` — メッセージ取得・生成（RAG）
- `apps/web/src/components/app/pages/chat.tsx` — 右サイドバー開閉・チャットヘッダー
- `apps/web/src/components/app/chat-thread.tsx` — メッセージの「…」メニュー（`menuActions`）
- `apps/web/src/components/app/pages/settings.tsx` — Lab機能（Google カレンダー読み込み）の実装パターン
- `apps/web/src/lib/permissions.ts` — チャンネル所属確認・ゲスト可視プロジェクト
