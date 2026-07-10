# マイルストーン機能 実装設計

> **ステータス**: 実装前の確定設計（作成: 2026-07-09）
> 元となる設計ドラフト（基本思想）と、現実装との差分分析、実装計画をまとめる。
> 実装後に本書と実装が乖離した場合はコードを正とする。

---

## 1. 設計ドラフトの要旨（確定事項）

- **プロジェクトが唯一の大きなコンテナ**。ファイル・ギャラリー・タスク・チャット・カレンダー・マイルストーンはすべてプロジェクトに紐付く構成要素
- マイルストーンは**タスク・ファイル・ギャラリーの親にはならない**
- マイルストーンの役割は2つ:
  1. プロジェクト内のスケジュール上の区切り（開始日・終了日を持つ）
  2. チャット内で会話を分ける**話題別チャットルーム**（マイルストーン作成時に専用スレッドが自動生成される）
- ステータスは `completed: true / false` のみ。開始前・進行中・遅延は日付と完了状態から UI 側で判断する
- 初期のデータ構造: `id / project_id / title / description / start_date / end_date / completed / created_at / updated_at`

### 用語の整理

ドラフトの「スレッド」は Slack の返信スレッドではなく、**プロジェクト内の話題別チャットルーム = チャンネル**を指す。現実装の `messages.parent_message_id`（メッセージへの返信）とは別概念であり、本機能では `channels` テーブルの行としてマイルストーンスレッドを表現する。以降、本書では「マイルストーンチャンネル」と呼ぶ。

---

## 2. 現実装との適合点（そのまま活きる部分）

設計ドラフトは現実装のアーキテクチャと親和性が高い。以下は**変更なしで機能する**。

| 領域 | 現実装 | 適合理由 |
|---|---|---|
| チャンネル基盤 | `channels` は `project_id` + `name`（nullable）を持ち、スキーマ上は1プロジェクト複数チャンネルを既に許容 | マイルストーンチャンネル = `channels` の追加行として表現できる |
| 未読管理 | `channel_read_states` はチャンネルID単位で汎用動作 | マイルストーンチャンネルも自動で未読・メンションバッジが機能する（[`07_notifications_and_unread.md`](./07_notifications_and_unread.md) でも明記済み） |
| Realtime | topic は `channel:{id}`、認可は `can_access_channel()`（migration 0033/0034） | 新チャンネルのメッセージ配信は既存トリガーがそのまま動く（※認可関数にはゲスト制限の既存ギャップがあり Phase 1 で修正する。§3.9） |
| メンション通知 | Inngest ジョブがチャンネル単位で受信者を解決（`mention-access.ts`） | `type='project'` チャンネルとして扱えば挙動は General と同一 |
| タスク | `tasks.project_id` のみ（マイルストーン参照なし） | ドラフトの「Task belongs to Project」と完全一致。**変更ゼロ** |
| ファイル・ギャラリー | `files.project_id` / `gallery_items` はプロジェクト直下 | 同上。**変更ゼロ** |
| 日付の持ち方 | `projects.start_date / end_date` が `date` 型（`YYYY-MM-DD`）の前例 | マイルストーンも同じ型・同じフォーマット関数（`formatChannelPeriod` 等）を再利用できる |

また、「エンティティ = チャンネル」の 1:1 対応という基本思想は [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) §1 に明文化されており、マイルストーンは当初から将来拡張として予定されていた（`channels.milestone_id` 追加案が記載済み）。本ドラフトはその路線の具体化である。

---

## 3. 現実装との乖離・ギャップ

### 3.1 「1プロジェクト = 1チャンネル」前提のコードが存在する（最重要）

スキーマは複数チャンネルを許容するが、**アプリケーションコードは全域で 1:1 を前提にしている**。マイルストーンチャンネルを DB に追加した瞬間に以下が壊れるため、**DB/API 変更とチャット UI 対応は同一リリースで行う必要がある**。

| 箇所 | 現状 | 問題 |
|---|---|---|
| `apps/web/src/lib/chat/client.ts` の `findProjectChannelById()` | `channels.find(c => c.projectId === projectId)` で先頭1件を返す | 複数チャンネル時に General を選ぶ保証がない。プロジェクト詳細のチャットタブ（`detail-panel/tabs/chat-tab.tsx`）が誤ったスレッドを表示しうる |
| `GET /api/projects/channels` | プロジェクト JOIN で全プロジェクトチャンネルを返す（1行=1プロジェクト前提の DTO） | マイルストーンチャンネルも行として返るが、`channelName` は `coalesce(name, 'general')`、区別情報（milestoneId）がない |
| `chat-channel-list.tsx`（PC/モバイル Web のサイドバー） | 1プロジェクト=1行のフラット表示。ラベルは `projectTitle` | 複数チャンネルが同名の行として並んでしまう。階層表示（プロジェクト → General + マイルストーン）が必要 |
| `apps/mobile/app/(app)/chats/index.tsx`（Expo ネイティブ） | 同じ API をフラット表示し、タップで `/projects/[id]` に遷移 | 同上 + 遷移先でどのスレッドを開くかの情報がない |
| `PATCH /api/projects/[id]` のシステムメッセージ投稿（`route.ts:195-199`） | `where(projectId, type='project') limit 1` の first-row lookup でプロジェクト更新の system メッセージを投稿 | 複数チャンネル時は並び順が不定なため、プロジェクト名・期間・ステータス変更の通知が**任意のマイルストーンチャンネルに投稿されうる**。`milestone_id is null`（General）指定が必要 |
| チャンネル表示名を `projects.title` から導出している参照箇所 | チャット画面ヘッダー（`chat.tsx:463` の `currentChannel?.projectTitle`）、メッセージ検索（`search/messages/route.ts:57`）とブックマーク（`me/bookmarks/route.ts:59`）の `coalesce(projects.title, channels.name, 'DM')` | マイルストーンスレッドの会話・検索結果・ブックマークがすべて**親プロジェクト名で表示**されてしまう。マイルストーンタイトルを優先する導出への修正が必要（§6.7） |

### 3.2 channel_type の扱い — `'milestone'` 新設ではなく `'project'` 流用とする

[`07_notifications_and_unread.md`](./07_notifications_and_unread.md) には `channel_type` enum への `'milestone'` 追加案が記載されているが、**本実装では追加せず、`type = 'project'` のまま `channels.milestone_id` の有無で識別する**。

理由:

- マイルストーンチャンネルの権限・通知・RLS の挙動は General チャンネルと**完全に同一であるべき**（同じプロジェクトの会話であるため）
- `type === 'project'` を条件分岐に使う箇所が多く、`'milestone'` を新設するとすべてに同じ分岐を複製することになる:
  - `permissions.ts` の `requireChannelAccess()` / `canAccessViaAnyChannel()`（ゲストのプロジェクトメンバーシップ判定）
  - `lib/chat/mention-access.ts`（メンション通知の受信者フィルタ）
  - `can_access_channel()` SQL 関数（migration 0033、RLS と Realtime 認可の両方が依存。enum 変更 + 関数更新の migration が必要になる）
- `'project'` 流用なら **enum 変更も権限コードの変更も一切不要**で、API 側のゲスト制限・メンションフィルタがそのまま正しく動く（Realtime/RLS 側の `can_access_channel()` にはゲスト制限の既存ギャップがあり、type の選択にかかわらず修正が必要。§3.9）

`07_notifications_and_unread.md` は設計時スナップショットであり、この点は本書の判断を正とする。同ドキュメント記載の `parent_channel_id` も追加しない（`project_id` で General と辿れるため冗長）。

### 3.3 マイルストーンの実体が存在しない（完全新規）

`milestones` テーブル・API・UI・Zod スキーマのすべてが新規実装。既存の類似実装（`tasks` / `gallery` の CRUD、`projects` の日付編集）をパターンとして流用する。

### 3.4 「プロジェクトトップ」への表示先

ドラフトの表示イメージ「プロジェクトトップに Milestones リスト」に対し、現実装のプロジェクト詳細は `/projects?open={id}` のディテールパネル（`detail-panel/project-panel.tsx`、タブ: 概要 / チャット / ファイル / タスク / メンバー / ギャラリー）。

→ **概要タブ（`overview-tab.tsx`）にマイルストーンセクションを追加する**。タブは増やさない（マイルストーンは一覧+チェックだけの軽い要素であり、概要でプロジェクトの全体像と一緒に見えるべき）。

### 3.5 カレンダー / タイムライン表示

現実装のカレンダービュー（`projects-calendar.tsx`）は**ワークスペース横断のプロジェクト一覧ビュー**（+ Google Calendar イベント）であり、プロジェクト内のタイムライン表示は存在しない。

→ **既存の全体カレンダー（`projects-calendar.tsx`）にマイルストーンバーを重畳する方式で初期スコープに含める**（ユーザー判断 2026-07-09。Phase 3）。プロジェクトバーの下に、そのプロジェクトのマイルストーンをインデント付きの細いバーで表示し、Google Calendar イベントと同様に表示トグルを設ける。プロジェクト詳細内のガントチャート風タイムライン新設は将来検討（Phase 5）。

### 3.6 権限（ドラフト未定義 → 本書で確定）

ドラフトには権限の記載がない。CLAUDE.md の権限モデル（ワークスペースロールのみで決定）に従い:

| 操作 | 権限 | 根拠 |
|---|---|---|
| 閲覧 | プロジェクトにアクセスできる全員（ゲストは参加プロジェクトのみ） | プロジェクト詳細の閲覧と同じ |
| 作成・編集・完了切替 | `member` 以上（ゲスト不可） | 「プロジェクト編集」相当。`PATCH /api/projects/[id]` が `requireWorkspaceMember` である前例に合わせる |
| 削除 | `member` 以上 + 確認ダイアログ必須 | タスク削除と同格。ただし会話が消えるため UI で明示警告する（§3.7） |

マイルストーンチャンネル自体のアクセス制御は `type='project'` の既存ロジック（ゲストは `project_members` 必須）がそのまま適用される。

### 3.7 削除時の会話の扱い

`channels.milestone_id` に `on delete cascade` を張るため、**マイルストーン削除 = チャンネルと全メッセージの削除**となる。

- 削除確認ダイアログで「スレッドの会話もすべて削除される」ことを明示する（`confirm-dialog.tsx` を利用）
- 「終わったが会話は残したい」ケースは `completed: true` で対応する（完了スレッドはサイドバーで折りたたむ。§5.3）

### 3.8 その他（初期スコープでは変更不要と確認済みの領域)

| 領域 | 判断 |
|---|---|
| AI（`ai_scope` enum は workspace / project のみ） | 変更不要。「高所順応について決まったことをまとめて」はチャンネル単位で会話が分離されることで自然に実現可能。マイルストーン専用スコープは将来検討 |
| 通知タイプ（`notification_type` enum） | `'milestone'` は追加しない。メンション・チャット通知は既存のチャンネル機構で自動的に機能する |
| Inngest | マイルストーン専用ジョブは初期不要。AI インデックス（`project/upserted`）への組込みは将来検討 |
| Realtime のマイルストーン一覧ライブ更新 | 初期スコープ外。作成・更新は mutation 後の invalidate で自ユーザーには即時反映される（ワークスペースチャンネル作成と同じ既存挙動） |

### 3.9 Realtime/RLS 認可のゲスト制限ギャップ（既存バグ。Phase 1 で修正する）

`can_access_channel()`（migration 0033。messages 等の RLS SELECT と Realtime の `channel:{id}` topic 認可の両方が依存）は、公開 `type='project'` チャンネルを**同一ワークスペースの全メンバーに許可しており、ゲストの `project_members` 制限を適用していない**。API 側の `requireChannelAccess()` は「ゲストは参加プロジェクトのみ」を強制するが、RLS/Realtime 側にはこの判定がなく、チャンネル ID を知っているゲストが参加外プロジェクトのチャンネルを Realtime 購読・RLS 経由で閲覧できる。

これはマイルストーン以前からある既存ギャップだが、マイルストーンチャンネルの追加で「ゲストが ID を知りうるプロジェクトチャンネル」が増えるため、**Phase 1 の migration で `can_access_channel()` を修正して塞ぐ**。修正方針:

```sql
-- 公開チャンネルの分岐に、ゲストのプロジェクトメンバーシップ条件を追加する
(
  c.is_private = false
  and c.type in ('workspace', 'project')
  and exists (
    select 1 from workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id = coalesce(
        c.workspace_id,
        (select p.workspace_id from projects p where p.id = c.project_id)
      )
      -- guest は type='project' の場合のみ project_members を必須にする
      -- （公開 workspace チャンネルへのゲストアクセスは requireChannelAccess と同様に許可）
      and (
        wm.role <> 'guest'
        or c.type <> 'project'
        or exists (
          select 1 from project_members pm
          where pm.project_id = c.project_id and pm.user_id = auth.uid()
        )
      )
  )
)
```

これにより RLS/Realtime の挙動が API 側の `requireChannelAccess()` / `canAccessViaAnyChannel()` と一致する。

---

## 4. DB 設計

### 4.1 `milestones` テーブル（新規: `packages/db/src/schema/milestones.ts`）

```ts
export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    completed: boolean('completed').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_milestones_project').on(t.projectId, t.startDate)],
)
```

- `start_date` / `end_date` は **nullable**（日付未定のマイルストーンを許容。`projects` と同じ方針）
- 並び順は `start_date asc nulls last, created_at asc`。専用の `sort_order` は初期は持たない（必要になったら追加）
- ドラフトのフィールド構成に `created_by` を追加（既存テーブルの慣例に合わせる）

### 4.2 `channels` への列追加

```ts
milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'cascade' }),
// unique index: 1マイルストーン = 1チャンネル
```

- `milestone_id is not null` がマイルストーンチャンネルの識別子（`type` は `'project'` のまま。§3.2）
- **`channels.name` にはマイルストーンタイトルを複製しない**。表示名は API 側で `milestones` を JOIN して返す（リネーム時の同期漏れを構造的に防ぐ）
- migration は `pnpm db:generate`（timestamp prefix）→ `supabase migration up`

---

## 5. API 設計

[`api-conventions.md`](./api-conventions.md) に従う。バリデーションは `packages/shared/src/schemas/` に追加。

### 5.1 Zod スキーマ（`@cairn/shared`）

```ts
export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
})

export const patchMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  completed: z.boolean().optional(),
}).refine(
  data => Object.values(data).some(value => value !== undefined),
  { message: 'At least one field is required' },
)
```

### 5.2 ルート（ギャラリーのネストパターン `projects/[id]/gallery/[itemId]` に合わせる）

| メソッド / パス | 権限 | 動作 |
|---|---|---|
| `GET /api/projects/[id]/milestones` | `requireProjectAccess` + ワークスペース所属検証（下記） | 一覧（`start_date asc nulls last, created_at asc`）。`channelId` を含む DTO を返す |
| `POST /api/projects/[id]/milestones` | `requireWorkspaceMember` + ワークスペース所属検証 | **トランザクションで** `milestones` INSERT + 対応 `channels` INSERT（`type='project'`, `project_id`, `milestone_id`, `workspace_id`） |
| `PATCH /api/projects/[id]/milestones/[milestoneId]` | 同上 | 部分更新 + `updated_at` 更新。`milestoneId` が当該プロジェクトに属することを検証 |
| `DELETE /api/projects/[id]/milestones/[milestoneId]` | 同上 | 削除（チャンネル・メッセージは FK cascade） |

**ワークスペース所属検証（必須）**: `requireProjectAccess()` は member 以上のロールに対しては `projects.workspaceId` を検証せず即座に許可する（越境チェックは guest 分岐にしかない）。そのため権限ヘルパーだけに頼らず、**各ルートで必ず `projects.workspaceId = ctx.workspaceId` を条件に含めてプロジェクトを取得・更新する**（既存の gallery / files ルートと同じパターン）。これを怠ると、別ワークスペースのプロジェクト ID を渡した member による越境作成・閲覧が通り、POST では `channels.workspace_id = ctx.workspaceId` と `projects.workspaceId` が食い違う不整合データが生まれる。`route.test.ts` に越境ケース（別ワークスペースの projectId で 403/404）を必ず含める。

```ts
export interface MilestoneDto {
  id: string
  projectId: string
  title: string
  description: string | null
  startDate: string | null
  endDate: string | null
  completed: boolean
  channelId: string
}
```

### 5.3 `GET /api/projects/channels` の拡張

DTO に識別情報を追加し、並び順を「プロジェクト → General 先頭 → マイルストーン（start_date 順）」にする:

```ts
export interface ProjectChannelDto {
  // 既存フィールドはそのまま
  channelId: string
  channelName: string        // General は 'general'、マイルストーンは milestone タイトル（JOIN で解決）
  projectId: string
  projectTitle: string
  startDate: string | null   // マイルストーン行は milestone の期間を返す
  endDate: string | null
  archived: boolean
  unreadCount: number
  unreadMentionCount: number
  // 追加
  milestoneId: string | null       // null = General
  milestoneCompleted: boolean | null
}
```

未読・メンション集計クエリはチャンネルID単位のため**変更不要**（行が増えるだけ）。

### 5.4 全体カレンダー用の一覧取得（Phase 3）

カレンダー重畳（§6.8）用に、ワークスペース内の可視プロジェクト横断でマイルストーンを返すエンドポイントを追加する:

| メソッド / パス | 権限 | 動作 |
|---|---|---|
| `GET /api/milestones` | 認証済み全員 | ワークスペース内の可視プロジェクト（ゲストは参加プロジェクトのみ）のマイルストーン一覧。`/api/projects` GET と同じゲストフィルタを適用し、`MilestoneDto + projectTitle` を返す |

---

## 6. UI 設計

[`frontend-guidelines.md`](./frontend-guidelines.md) の Domain Hook パターンに従う。

### 6.1 Domain Hook（新規: `hooks/use-project-milestones.ts`）

`use-project-tasks.ts` をパターンとして、`useQuery` + create / patch / delete mutation。mutation 成功時は milestones クエリと `chatQueryKeys.projectChannels` の両方を invalidate する（チャンネル一覧に反映するため）。

### 6.2 チャットサイドバー（`chat-channel-list.tsx`）— Phase 1 で必須

- プロジェクトセクションを階層表示にする:
  - プロジェクト行（現行どおり `# プロジェクト名` + 期間 + 未読バッジ）= General チャンネル
  - その直下にインデント付きでマイルストーンスレッド行（タイトル + 期間 + 未読バッジ）
- `completed: true` のスレッドは「アーカイブ済みプロジェクト」と同様に折りたたみ（`ChatSidebarCollapsibleSection` を流用）
- モバイル Web シェルも同一コンポーネントのため同時に対応される

### 6.3 General チャンネル解決の修正 — Phase 1 で必須（クライアント・サーバー両方）

- クライアント: `findProjectChannelById()`（`lib/chat/client.ts`）を `milestoneId === null`（General）を明示的に選ぶ実装に修正。全呼び出し箇所（プロジェクト詳細のチャットタブ等）を確認
- サーバー: `PATCH /api/projects/[id]` のシステムメッセージ投稿（`route.ts:195-199`）のチャンネル lookup に `isNull(channels.milestoneId)` を追加（§3.1 の表参照。このルートはクライアントヘルパーを経由しないため個別修正が必要）
- 上記以外に「プロジェクトのチャンネルを1件取得する」箇所がないか、`channels.projectId` の参照を横串で確認する（なお `DELETE /api/projects/[id]` のファイル収集は全チャンネル横断が正しい挙動のため変更しない）

### 6.4 概要タブ（`detail-panel/tabs/overview-tab.tsx`）

マイルストーンセクションを追加:

- チェックボックス（completed 切替）+ タイトル + 期間（`formatChannelPeriod` を流用）
- 行クリックで該当スレッドのチャットへ（チャットタブ切替 or `/chats/[channelId]` 遷移。チャット画面のルートは `/chats/[channelId]` 形式で、`PageChat` が pathname からチャンネル ID を読む。`?channel=` クエリ形式のルートは存在しない）
- 追加ボタン（`member` 以上のみ表示。`useWorkspacePermissions()` でガード）
- 遅延表示: `!completed && endDate < today` の行は期間を警告色にする（ステータスカラムは持たない、というドラフト方針の UI 解釈）

### 6.5 プロジェクト詳細のチャットタブ（`detail-panel/tabs/chat-tab.tsx`）

ヘッダーにスレッド切替（General + マイルストーンのドロップダウン or タブ）を追加。初期表示は General。

### 6.6 モバイル（Expo ネイティブ: `apps/mobile/app/(app)/chats/index.tsx`）

現状のネイティブチャット一覧は `/api/projects/channels` の全行を表示し、タップで `router.push('/projects/[id]')`（channelId 指定なし = General 固定）に遷移する。Phase 1 で API がマイルストーン行を返すようになると、**タップしても該当スレッドに到達できない行**が並んでしまう。

- **Phase 1**: ネイティブ一覧では `milestoneId === null`（General）のみ表示するフィルタを入れる（到達できない行を見せない）
- **Phase 4**: 階層表示 + マイルストーン行タップで該当スレッドを開く遷移（channelId をルートパラメータで引き渡す）を実装し、フィルタを外す

### 6.7 チャンネル表示名の参照箇所の修正 — Phase 1 で必須

チャンネルの表示名を `projects.title` から導出している箇所がサイドバー以外にもあり、放置するとマイルストーンスレッドの会話・検索結果・ブックマークが親プロジェクト名で表示される:

- **チャット画面ヘッダー・入力プレースホルダ**（`pages/chat.tsx:463`）: `currentChannel?.projectTitle` を `currentChannel.milestoneId ? currentChannel.channelName : currentChannel.projectTitle` に変更（拡張後の DTO の `channelName` がマイルストーンタイトルを持つ。§5.3）。マイルストーンスレッドでは「プロジェクト名 / マイルストーン名」の併記も可
- **メッセージ検索**（`api/search/messages/route.ts:57`）と**ブックマーク**（`api/me/bookmarks/route.ts:59`）: `coalesce(projects.title, channels.name, 'DM')` に `milestones` の leftJoin（`channels.milestone_id`）を追加し、`coalesce(milestones.title, projects.title, channels.name, 'DM')` にする
- 上記以外に取りこぼしがないか、`projectTitle` / `projects.title` をチャンネル表示名として使う箇所を横串で確認する

### 6.8 全体カレンダーへの重畳（`projects-calendar.tsx`）— Phase 3

- データ取得は `GET /api/milestones`（§5.4）。Google Calendar イベント（`GcalEventDto`）と同様の追加レイヤーとして扱う
- プロジェクトバーの直下に、そのプロジェクトのマイルストーンを**インデント付きの細いバー**で表示（`title` + 期間。`completed` はグレーアウト）
- 日付なし（`start_date` / `end_date` とも null）のマイルストーンはカレンダーに表示しない
- 表示密度対策として、Gcal イベントの表示トグルと同様に「マイルストーン表示」の ON/OFF トグルを設ける（設定は localStorage、`STORAGE_KEYS` に追加）
- モバイルカレンダー（`projects-calendar.mobile` 系）も同一データで対応

---

## 7. 実装フェーズ

### Phase 1: DB + API + チャット導線（同一 PR で行う — §3.1 の理由により分割不可）

1. `packages/db`: `milestones` テーブル + `channels.milestone_id` + migration 生成
2. migration: `can_access_channel()` のゲスト制限修正（§3.9。Drizzle 生成 SQL とは別に手書き migration を追加する）
3. `packages/shared`: `createMilestoneSchema` / `patchMilestoneSchema` + テスト
4. API: milestones CRUD（POST でチャンネル同時作成）+ `GET /api/projects/channels` 拡張 + `route.test.ts`（権限・ゲスト制限・プロジェクト越境を含む）
5. General チャンネル解決の修正（クライアント `findProjectChannelById()` + サーバー `PATCH /api/projects/[id]` のシステムメッセージ投稿。§6.3）+ テスト
6. チャットサイドバーの階層表示（PC / モバイル Web）
7. Expo ネイティブチャット一覧に General のみ表示するフィルタを追加（§6.6。到達できないマイルストーン行を隠す暫定措置）
8. チャンネル表示名の参照箇所の修正（§6.7。チャット画面ヘッダー・メッセージ検索・ブックマークの `projects.title` 優先の導出にマイルストーンタイトルを組み込む）

### Phase 2: マイルストーン管理 UI

1. `use-project-milestones.ts`（Domain Hook）
2. 概要タブのマイルストーンセクション（一覧・作成・編集・完了切替・削除+確認ダイアログ）
3. チャットタブのスレッド切替

### Phase 3: カレンダー重畳

1. `GET /api/milestones`（ワークスペース横断一覧。§5.4）
2. `projects-calendar.tsx` へのマイルストーンバー重畳 + 表示トグル（§6.8。PC / モバイル Web）

### Phase 4: モバイル（Expo）

1. ネイティブチャット一覧の階層表示と遷移先スレッド指定

### Phase 5（将来・スコープ外）

- プロジェクト詳細内のガントチャート風タイムライン表示
- タスクへの任意のマイルストーン関連付け（`tasks.milestone_id` nullable — ドラフトでも「将来的に考えられる」扱い）
- マイルストーン単位の AI 要約ショートカット・AI インデックス
- `notification_type: 'milestone'`（作成・完了の通知）
- マイルストーン一覧の Realtime ライブ更新

---

## 8. 確定した設計判断のまとめ

以下の判断は 2026-07-09 にユーザー確認済み（channel_type / 削除時の扱い / カレンダー / UI 配置）。

| 論点 | 判断 |
|---|---|
| チャンネル種別 | `type='project'` のまま `channels.milestone_id` で識別（`'milestone'` enum は新設しない）。`07_notifications_and_unread.md` の記載よりこちらを正とする |
| チャンネル表示名 | `channels.name` に複製せず、API でマイルストーンを JOIN して返す |
| ステータス | `completed` boolean のみ。遅延等は UI 判断（ドラフトどおり） |
| 権限 | 作成・編集・削除は `member` 以上、閲覧はプロジェクトアクセス準拠（ゲストは参加プロジェクトのみ） |
| 削除 | チャンネル・メッセージごと cascade 削除。確認ダイアログで会話消失を明示 |
| タスク・ファイル・ギャラリー | マイルストーンに紐付けない（ドラフトどおり。既存スキーマ変更ゼロ） |
| カレンダー表示 | 全体カレンダー（`projects-calendar.tsx`）へのマイルストーンバー重畳を初期スコープに含める（Phase 3。ユーザー判断 2026-07-09）。プロジェクト内タイムライン新設は将来 |
| Realtime/RLS 認可 | `can_access_channel()` のゲスト制限ギャップ（既存バグ）を Phase 1 の migration で修正し、API 側の挙動と一致させる（§3.9） |
