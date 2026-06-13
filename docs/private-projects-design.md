# 非公開プロジェクト 設計ドキュメント

> ステータス: ドラフト（設計検討中・コードベース調査反映済み）
> 最終更新: 2026-06-13

## 1. 背景・目的

現状、Cairn のプロジェクトは「同じワークスペースのメンバーなら全員が一覧・中身を閲覧できる」設計になっている。プロジェクト単位のアクセス制御（`project_members`）は**書き込み権限の判定にのみ**使われており、読み取りはワークスペース境界しか効いていない。

ワークスペースが「チーム単位」ではなく「会社・組織単位」で使われ始めると、以下のような「特定メンバーにしか見せたくない」需要が発生する。

- 人事・評価・採用・査定など、見えてはいけない情報
- 経営 / 予算 / M&A など機密性の高い企画
- クライアントごとの情報分離（受託・代理店業態）
- まだ全社に見せたくない、温めている段階の企画

本ドキュメントは「非公開プロジェクト」を導入する際の影響範囲と段階的な実装方針を定義する。

## 2. 現状整理（調査結果）

### 2.1 プロジェクトのアクセス制御

- スキーマ `packages/db/src/schema/projects.ts` に `visibility` / `private` 相当のフィールドは**存在しない**。
- アクセス制御は2層のメンバーシップ。
  - **ワークスペースメンバー**（`workspace_members`, role: `owner | admin | member | guest`）
  - **プロジェクトメンバー**（`project_members`, role: `leader | subleader | member | reviewer | observer`）
- 読み取り系 API（プロジェクト一覧・タスク・ファイル・ギャラリー・チャンネル一覧など）はほぼ全て `WHERE workspace_id = ctx.workspaceId` **のみ**でフィルタしており、`project_members` による絞り込みをしていない。
- `project_members` は書き込み権限チェック（`apps/web/src/lib/permissions.ts` の `requireProjectManager` / `requireProjectLeader`）にのみ使用。
- 一覧 API が返す `isMember` フラグは UI 表示用で、サーバー側の読み取りフィルタには使われていない。

> **重要**: 非公開プロジェクトの導入は「フラグを足すだけ」ではなく、**読み取り経路に初めてプロジェクトメンバーシップフィルタを導入する**作業である。ここが設計の主戦場になる。

### 2.2 AI 検索 / RAG

- `packages/db/src/schema/embeddings.ts` の `document_chunks` は `workspace_id` 単位で、`project_id` を持たない。`source_type` は `file | project | member`。
- `apps/web/src/lib/ai/search-chunks.ts` の `searchChunks()` は `WHERE workspace_id = ...` のみでベクトル検索する。
- → 非公開を入れる場合、**`document_chunks` への `source_project_id` 追加 + 検索時のアクセス権フィルタ**が必須。最も漏洩しやすい経路。

### 2.3 Realtime（Broadcast from Database）

- Broadcast のペイロードは変更テーブル名（`table`）のみを読む signaling 方式で、本文・行データはペイロードに乗らない（`apps/web/src/components/realtime/realtime-provider.tsx`）。→ **本文の漏洩リスクは低い**。
- 配信認可は RLS（`supabase/migrations/0033_realtime_rls.sql` の `can_access_channel()`）で行われ、`is_private` チャンネルは既にチャンネルメンバー限定。プロジェクトチャンネルは現状 `is_private=false` で「ワークスペースメンバー全員」。
- → プロジェクトチャンネルの非公開化は、既存の `is_private` の仕組みにかなり乗れる。

### 2.4 通知・メンション

通知生成は Inngest 経由（`apps/web/src/lib/inngest/functions.ts`）。調査の結果、非公開化の前に塞ぐべき具体的なリーク経路が複数判明した。

- **メンション受信者がチャンネル/プロジェクトメンバーで絞られていない**。メンション対象は `workspace_members` から取得しており（`onMessageCreated` 内）、チャンネル参加の有無を問わない。→ 非公開プロジェクトのチャンネルでも、ワークスペースの誰でもメンションでき通知が飛ぶ。
- **タスク割り当て通知の本文にプロジェクト名が入る**: `body: "「${taskTitle}」- ${projectTitle}"`（`functions.ts` 付近）。Push・アプリ内通知の双方に乗るため、非公開プロジェクト名が割り当て先に露出する。
- **通知スキーマ** `packages/db/src/schema/notifications.ts` の `body` / `data` に機密文言が格納される。
- **プロジェクトチャンネルは常に `is_private=false` で作成される**（`apps/web/src/app/api/projects/route.ts`）。
- **メッセージ GET/POST にチャンネルアクセス権チェックがない**（`apps/web/src/app/api/channels/[channelId]/messages/route.ts`）。チャンネル ID を知っていれば読み書きできる。
- **`project_members` 追加時に `channel_members` へ自動登録していない**（`apps/web/src/app/api/projects/[id]/members/route.ts`）。チャンネルメンバー方式に倒す場合はここの整合が必要。
- **タスク作成にプロジェクトメンバーシップチェックがない**（`apps/web/src/app/api/tasks/route.ts`）。非メンバーがタスクを作成でき、§上記の通知リークに繋がる。

## 3. 設計方針

### 3.1 可視性モデル

プロジェクトに可視性レベルを1カラムで持たせる。MVP は最小の2値に絞る。

| visibility | 意味 | 閲覧できる人 |
| --- | --- | --- |
| `workspace`（デフォルト） | 従来どおり | ワークスペースメンバー全員 |
| `members` | 非公開 | `project_members` に登録されたユーザー + ワークスペース管理者（owner/admin） |

- 既存プロジェクトは全て `workspace` として移行する（後方互換）。
- **ワークスペース管理者（owner/admin）は非公開プロジェクトも閲覧可能**とする（管理・監査の都合）。この扱いはプロダクト判断が必要なため §6 に論点として記載。
- リンク共有・外部ゲスト招待などの細かい権限は MVP のスコープ外（将来拡張）。

### 3.2 アクセス判定の共通化

現状、読み取りフィルタが各 API ルートに散在している。非公開を入れる前提として、**プロジェクト閲覧可否の共通ヘルパー**を1か所に用意し、全リソースがこれを経由するようにする。

`apps/web/src/lib/permissions.ts` に追加:

```ts
// 単一プロジェクトの閲覧可否（403 を返すガード）
export async function requireProjectViewer(
  projectId: string,
  userId: string,
  workspaceId: string,
): Promise<NextResponse | null>

// 一覧フィルタ用: ユーザーが閲覧可能なプロジェクト visibility 条件を組み立てる
//   visibility = 'workspace'
//   OR (visibility = 'members' AND <user is project_member or workspace admin>)
export function visibleProjectsWhere(userId: string, isWorkspaceAdmin: boolean): SQL
```

- 単一リソース取得系（`/api/projects/[id]`, タスク詳細, ファイル, ギャラリー）は `requireProjectViewer` を通す。
- 一覧系（`/api/projects`, `/api/tasks`, `/api/gallery`, `/api/projects/channels`）は `visibleProjectsWhere` を `WHERE` に AND で足す。

### 3.3 AI 検索のフィルタ

1. `document_chunks` に `source_project_id uuid`（nullable）を追加。
   - `source_type = 'project'` の chunk は当該プロジェクト ID。
   - `source_type = 'file'` はファイルが属するプロジェクト ID（プロジェクト非紐付けファイルは NULL）。
   - `source_type = 'member'` はプロジェクト非依存なので NULL。
2. インデックスジョブ（`apps/web/src/lib/inngest/functions.ts` の各 `index*Chunks`）で `source_project_id` を書き込む。
3. `searchChunks()` のクエリに以下を AND:
   ```sql
   AND (
     source_project_id IS NULL
     OR source_project_id IN (<viewer がアクセス可能なプロジェクト ID>)
   )
   ```
4. 既存 chunk への遡及は管理者再インデックス（`/api/admin/reindex`）で対応。

### 3.4 Realtime / チャット

- プロジェクトチャンネルが非公開プロジェクトに属する場合、チャンネルを `is_private=true` 扱いにする（または `can_access_channel()` をプロジェクト visibility を見るよう拡張）。
- `can_access_channel()` の「公開チャンネルはワークスペースメンバー全員」分岐に、**プロジェクト visibility が `members` の場合は `project_members` を必須**とする条件を追加する。
- ペイロードは signaling 方式のため、本文漏洩の追加対策は不要。

### 3.5 通知・メンション

§2.4 のリーク経路を塞ぐ。

- **メンション受信者の絞り込み**: `onMessageCreated` のメンション解決を、ワークスペースメンバーではなく「当該チャンネル/プロジェクトを閲覧できるユーザー」に限定する。非公開プロジェクトのチャンネルでは `project_members`（+ 管理者）以外をメンション通知の対象から除外する。
- **タスク割り当て通知の本文**: 非公開プロジェクト由来の通知では本文にプロジェクト名/タスク名を出さない（例: 「新しいタスクが割り当てられました」に丸める）か、受信者が必ずメンバーであることを保証した上で出す。受信者は必ず `project_members` に含まれることを担保する。
- **タスク作成の認可**: タスク作成 API に `requireProjectViewer`(または write 用ガード) を追加し、非メンバーが非公開プロジェクトにタスクを作れない / 通知を発火できないようにする。
- 上記が効いていること（非メンバーが通知・Push のいずれからも非公開プロジェクトを観測できない）を必ずテストで担保する。

## 4. スキーマ変更

```ts
// packages/db/src/schema/enums.ts
export const projectVisibilityEnum = pgEnum('project_visibility', ['workspace', 'members'])

// packages/db/src/schema/projects.ts (projects テーブルに追加)
visibility: projectVisibilityEnum('visibility').notNull().default('workspace'),

// packages/db/src/schema/embeddings.ts (document_chunks に追加)
sourceProjectId: uuid('source_project_id'),
// index: idx_document_chunks_source_project on (workspace_id, source_project_id)
```

マイグレーションは `pnpm db:generate` → `supabase migration up`。

## 5. 段階的実装プラン

優先度は「漏洩リスクの高さ」で並べる。

> **前提**: 調査の結果、非公開化以前に既存のアクセス制御自体に穴がある（チャンネルメッセージ GET/POST に権限チェックなし、タスク作成にメンバーシップチェックなし、`project_members` 追加時に `channel_members` 未登録など）。Phase 0 でこれらを塞いでから可視性を載せる。非公開機能を入れても、これらの穴があれば回避される。

0. **前提のアクセス制御整備**:
   - メッセージ GET/POST にチャンネルアクセス権チェックを追加。
   - タスク作成にプロジェクト認可を追加。
   - チャンネルメンバー方式に倒す場合、`project_members` 追加時の `channel_members` 自動登録を実装。
   - これらは公開プロジェクトのままでも妥当な堅牢化であり、非公開機能の土台になる。
1. **基盤**: `visibility` カラム追加・migration・`Project` ドメイン型 / Zod スキーマ更新。全既存プロジェクトを `workspace` に。
2. **読み取りガードの共通化**: `requireProjectViewer` / `visibleProjectsWhere` を実装し、まず**全リソースを `workspace` 前提でリファクタ**（挙動を変えずに共通化）。
3. **プロジェクト読み取りに visibility 適用**: 一覧・詳細・タスク・ファイル・ギャラリー・チャンネル一覧に visibility フィルタを適用。
4. **AI 検索**: `source_project_id` 追加 + インデックスジョブ + `searchChunks` フィルタ + 再インデックス。
5. **Realtime / チャット**: `can_access_channel()` 拡張、プロジェクトチャンネルの非公開対応。
6. **通知・メンション**: 受信者・候補のフィルタ（§2.4 確定後）。
7. **UI**: プロジェクト作成/設定での可視性トグル、非公開バッジ表示。

各ステップで漏洩防止のテストを追加する（非メンバーが一覧・検索・通知・Realtime のいずれからも非公開プロジェクトを観測できないこと）。

## 6. 論点（プロダクト判断が必要）

- **ワークスペース管理者の扱い**: owner/admin は非公開プロジェクトも見えるべきか。監査の都合では Yes だが、人事・経営案件を「管理者にも隠したい」需要もあり得る。→ MVP は「管理者は見える」で進め、将来 `strict` モードを検討。
- **可視性の粒度**: MVP は2値で十分か。`workspace` / `members` の他に「特定ロール以上」のような中間が要るか。
- **既存の読み取りフィルタ欠落の扱い**: 現状タスク/ファイル等が「ワークスペース全員可視」なのは仕様か。非公開導入と同時に「公開プロジェクトでも非メンバーは閲覧のみ/不可」にするか否か（スコープ拡大に注意）。
- **アーカイブ済み非公開プロジェクト**の扱い。

## 7. 関連ファイル

| 用途 | パス |
| --- | --- |
| プロジェクトスキーマ | `packages/db/src/schema/projects.ts` |
| Embedding スキーマ | `packages/db/src/schema/embeddings.ts` |
| 権限ヘルパー | `apps/web/src/lib/permissions.ts` |
| プロジェクト API | `apps/web/src/app/api/projects/` |
| ベクトル検索 | `apps/web/src/lib/ai/search-chunks.ts` |
| インデックスジョブ | `apps/web/src/lib/inngest/functions.ts` |
| Realtime RLS | `supabase/migrations/0033_realtime_rls.sql` |
| Realtime Broadcast | `supabase/migrations/0034_realtime_broadcast.sql` |
| RealtimeProvider | `apps/web/src/components/realtime/realtime-provider.tsx` |
</content>
</invoke>
