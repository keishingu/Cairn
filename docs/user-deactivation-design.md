# ユーザー非活性化・退会設計（卒業生対応）

- **ステータス**: 実装済み（§9 の #1〜#5 は [PR #328](https://github.com/keishingu/Cairn/pull/328) で develop にマージ済み。#6「匿名化による消去請求対応」は未着手）
- **作成**: 2026-06-22 / **実装完了**: 2026-07-09（PR #328 マージ）
- **関連**: [`CLAUDE.md`](../CLAUDE.md) の権限モデル、[`packages/db/src/schema/workspaces.ts`](../packages/db/src/schema/workspaces.ts)（`workspace_members`）、[`apps/web/src/lib/access/membership.ts`](../apps/web/src/lib/access/membership.ts)、[`apps/web/src/lib/access/lifecycle.ts`](../apps/web/src/lib/access/lifecycle.ts)

> 大原則: ドキュメントと実装が矛盾する場合、コードと CLAUDE.md を正とする。本書は §1〜§9 が設計時の記録、§10 が実装後の差分メモ。§6 の「権限モデル」節は CLAUDE.md にも要約が転記済み。

## 1. 背景・課題

Cairn は部活動でも利用される想定で、卒業生など「いったん抜けるが、いずれコーチとして戻る可能性がある」ユーザーが存在する。現状、ユーザーを外す導線（ワークスペースからの除名・退会・アカウント削除）は **API・UI ともに未実装**。

ユーザーの**物理削除はアプリ標準にしない**。理由は2つ:

1. **履歴の消滅（cascade）**: `profiles` を削除すると、`onDelete: 'cascade'` の外部キー経由で当該ユーザーの `messages`（発言）・`gallery_items`（写真）・`channel_members` / `project_members` / `workspace_members`（所属）・`notifications`・カレンダー連携が連鎖削除される。卒業生のチャット履歴や山行写真は**部の共有財産**であり、消すべきではない。
2. **restrict による削除失敗**: 一方 `files.uploadedBy` / `tasks.createdBy` / `tasks.assigneeId` / `projects.createdBy` / `workspaces.createdBy` などは cascade を持たない（既定の NO ACTION）。これらが残っていると物理削除自体が FK 制約で失敗する。無理に消せば履歴が壊れる。

→ 通常ライフサイクルは**非活性化（deactivate）**を主軸とし、本人の同一性と作成物を保持する。コーチ復帰時は**再活性化**で同一アイデンティティのまま戻れるようにする。

## 2. GDPR / 消去権の整理

「ヨーロッパ圏では物理削除が必須」という理解は不正確。GDPR 第17条「消去権（忘れられる権利）」は、**データ主体からの請求**等を契機に個人データを消去する義務を課すもので、全ユーザーの定期的な物理削除を求めるものではない。重要な点:

- **消去は行（レコード）の物理削除である必要はなく、「匿名化」で満たせる**。完全に匿名化され個人を再特定できないデータは GDPR の適用対象外になる。
- 保持義務（法令）・表現の自由などの**例外**がある。

→ 設計方針との整合: **通常運用＝非活性化**、**消去請求への対応＝匿名化パス**（PII をスクラブし、非個人データである活動記録は保持）。物理 DELETE は原則用いない。匿名化は本書フェーズ2（§7）として、非活性化フェーズと独立に追加できる。

## 3. データモデル

非活性化は **ワークスペース単位**で持つ。これにより「A 部では卒業生（非活性）・B 部では現役コーチ（活性）」のような多所属を自然に表現できる。

```text
packages/db/src/schema/enums.ts
  + memberStatusEnum = pgEnum('workspace_member_status', ['active', 'inactive'])

packages/db/src/schema/workspaces.ts  (workspace_members)
  + membershipStatus: memberStatusEnum('membership_status').notNull().default('active')
  + deactivatedAt: timestamp('deactivated_at', { withTimezone: true })          // 監査・表示用
  + deactivatedBy: uuid('deactivated_by').references(() => profiles.id)          // 任意・監査用
```

- `profiles`（＝認証ユーザー）には触れない。再活性化で同一性を保つため。
- マイグレーション: 既存の在席ステータス `workspace_members.status` と衝突しないよう、会員状態は `membership_status='active'` を既定にする。`pnpm db:generate` → `supabase migration up`。

### マイグレーションは timestamp 方式に切り替える（→ 切替済み）

> この切替は実施済み（`drizzle.config.ts` の `migrations.prefix = 'timestamp'`、CLAUDE.md にも記載）。以下は当時の判断の記録。

当時のマイグレーションは `0000_initial.sql`〜`0034_*.sql` の**連番方式**（Drizzle Kit の既定 `prefix: 'index'`）。複数ブランチが並行して `pnpm db:generate` すると同じ次番号（例: `0035_*`）を取り合い、**マージ時に番号衝突・適用順序の不定**が起きる。本機能のマイグレーションを作るこのタイミングで **timestamp 方式へ切り替える**:

```ts
// packages/db/drizzle.config.ts
export default defineConfig({
  // ...既存設定...
  migrations: { prefix: 'timestamp' },   // 0035_* ではなく 20260625030000_* 形式で生成
})
```

- 既存の連番マイグレーションはリネームしない（適用済みのため）。以降の新規分のみ timestamp 形式になる。
- 切り替え自体は本機能の最初のスキーマ issue（§9 の #1）に含める。CLAUDE.md のローカル開発手順にも一言追記する。


## 4. 認証・権限への影響（最重要）

非活性メンバーは「メンバーではない」と同等に扱い、**サーバー側で必ず遮断**する。UI ガードは補助に過ぎない（CLAUDE.md の権限方針に準拠）。

- **`apps/web/src/lib/permissions.ts`**
  - `getWorkspaceRole` を「`status='active'` の行のみロールを返す」よう変更する。非活性は `null` を返す。
  - これにより `requireWorkspaceOwner / Admin / Member`・`requireProjectAccess`・`requireChannelAccess` など**ロール参照系がすべて非活性を 403 で弾く**（一点変更で広く効く）。
- **`apps/web/src/lib/get-auth-context.ts`**
  - ワークスペース解決時に非活性メンバーシップを除外。非活性 WS は「未所属」として扱い、ログイン後の自動選択対象から外す。
- **Supabase Auth**: アカウント自体は生かし、対象 WS のアクセスのみ失わせる。全 WS で非活性なら実質利用不可となる。完全なログイン遮断が必要な要件が出た場合は別途検討。

## 5. 挙動マトリクス（非活性ユーザー）

| 領域 | 挙動 |
|---|---|
| 既存の発言・写真・ファイル・タスク | **保持・本人名義のまま表示**（履歴は変えない） |
| メンバー一覧 | 「卒業生（OB/OG）」として分離表示、または既定で非表示（トグルで表示） |
| メンション補完・タスク担当候補・DM 作成候補 | **active のみ**（非活性は除外） |
| 未読・通知 | 生成停止／カウント対象外 |
| ログイン / API | 当該 WS は 403（§4 の権限ヘルパー経由で自動的に） |
| 再活性化 | 管理者操作で `inactive → active`、所属・履歴はそのまま復帰 |

## 6. API・UI

### API
- **非活性化 / 再活性化**: `admin` 以上に限定。既存 `PATCH /api/workspaces/members/[userId]`（現状はロール変更）に `status` を許容する形へ拡張するか、専用 `PATCH /api/workspaces/members/[userId]/status` を新設する。
- **ガード**: 最後の active な `owner` は非活性化できない（既存の「最後の owner 降格不可」と同型のチェックを status にも適用）。
- **メンバー一覧 API**（`apps/web/src/app/api/workspaces/members/route.ts`）に `status` を含め、UI で現役 / 卒業生を分離。
- 候補リスト系（メンション・担当割当・DM 作成）は `status='active'` で絞る。

### UI
- メンバーページ: 「現役」「卒業生（OB/OG）」のセクション分け。非活性化 / 再活性化ボタンは `useWorkspacePermissions().isAdmin` で出し分け。
- 操作時は確認ダイアログ（卒業生化＝アクセス失効である旨を明示）。

## 7. フェーズ2: 匿名化による消去請求対応（将来）

GDPR 消去請求等が来た場合の対応。非活性化（§3 の `status`）とは独立に追加可能。

- `profiles` 行は**残したまま**、`displayName` を「退会したユーザー」等に置換、`bio` ほか PII を null 化、`icalToken` を失効。
- アバター等のストレージ実体は削除。
- 発言・タスク等の**非個人データは保持**（作成者表示は匿名化後の名義）。
- 物理 DELETE は、法的に行レベル削除が必須と判断される場合に限る（その場合も cascade / restrict の影響を個別に設計する）。

## 8. 決定が必要な点（オープン）

1. **最後の owner の非活性化禁止** — 採用想定（要確認）。
2. **再参加 vs 再活性化** — 同一メールで再 invite した場合、既存の非活性メンバーシップを `active` に戻す（同一性維持・推奨）か、新規行を作るか。マイグレーション/実装に影響。
3. **非活性中の本人ログイン体験** — 全 WS 非活性なら「所属ワークスペースがありません」を表示する想定でよいか。
4. **ゲストの非活性化** — ゲストにも同じ `status` を適用するか（招待リンク失効とは別概念）。
5. **匿名化フェーズの優先度** — §7 を最初のリリースに含めるか、後続にするか。

## 9. 実装単位（issue 分解）

develop にマージする前に**それ単体で機能・検証できる**粒度で分解する。各単位は独立した子 issue とし、依存順に積む。

| # | 単位 | 単体での検証可能性 | 依存 | 状態 |
|---|---|---|---|---|
| 1 | **スキーマ + マイグレーション（timestamp 方式へ切替）** | マイグレーション適用で `workspace_members.membership_status` 追加、既存行は `active` 既定で挙動不変 | なし | ✅ [#212](https://github.com/keishingu/Cairn/issues/212) |
| 2 | **サーバー側アクセス遮断** | `getWorkspaceRole` を active 限定化、`get-auth-context` で非活性除外 | #1 | ✅ [#213](https://github.com/keishingu/Cairn/issues/213)（[PR #328](https://github.com/keishingu/Cairn/pull/328)） |
| 3 | **非活性化 / 再活性化 API** | `admin` 以上が `status` を切替できる。最後の active owner は非活性化不可 | #1, #2 | ✅ [#214](https://github.com/keishingu/Cairn/issues/214)（PR #328） |
| 4 | **候補リスト・メンバー一覧の active 絞り込み** | メンバー一覧 API が `status` を返し、メンション/担当割当/DM 作成の候補が active のみになる | #1（実データは #3） | ✅ [#215](https://github.com/keishingu/Cairn/issues/215)（PR #328） |
| 5 | **UI（現役 / 卒業生分離・非活性化/再活性化ボタン・確認ダイアログ）** | 画面から非活性化→卒業生セクションへ移動、再活性化→現役へ復帰 | #3, #4 | ✅ [#216](https://github.com/keishingu/Cairn/issues/216)（PR #328） |
| 6 | **（フェーズ2）匿名化による消去請求対応** | §7。表示名置換・PII null 化・アバター削除で、非個人データを残しつつ再特定不可になることを検証 | #1（独立着手可） | 未着手（[#211](https://github.com/keishingu/Cairn/issues/211) エピックに残存） |

実装は #2〜#5 を分割 PR ではなく [PR #328](https://github.com/keishingu/Cairn/pull/328) 1 本にまとめ、§10 の Layer A/B/C 構成で行った。理由は §10 末尾「実装結果」を参照。

## 10. 実装からの学び — active membership の集約リファクタ（PR #245 を受けて）

- **ステータス**: 実装済み（[PR #328](https://github.com/keishingu/Cairn/pull/328) で develop にマージ）。以下は当時の設計提案。実装との差分は本節末尾「実装結果」を参照
- **関連**: [PR #245](https://github.com/keishingu/Cairn/pull/245)（fix/issue-213、クローズ済み・未マージ）、[PR #328](https://github.com/keishingu/Cairn/pull/328)（本設計の実装、develop にマージ済み）

§4 は「`getWorkspaceRole` を active 限定にすれば一点変更で広く効く」と見込んでいたが、PR #245 の実装では**ロール参照系を通らない read path が多数あった**ことが判明した。通知配信・ファイル一覧・カレンダー(iCal)・メンバー/DM 候補・Realtime RLS などが `workspace_members` を独自に join しており、それぞれに `membership_status = 'active'` を手で足す必要が生じた。結果、自動レビュー（Codex）が「ここでは active を絞っているが別の場所では絞っていない」という**同一クラスの指摘を約 40 箇所で繰り返す**状態になった。

指摘は 2 クラスに帰着する:

- **クラス1「active 絞り忘れ」**: `membership_status = 'active'` を各クエリで個別に足しており、13+ の TS 呼び出し箇所（`get-auth-context` / `permissions` / `notification-access`×4 / `auth/setup` / `calendar/ical` / `channels/members` / `projects/members`×3 / `dms` / `workspaces/list` / `workspaces/members`×3）と 3 つの SQL 関数に散在。read path を 1 つ足すたびに穴が開く。
- **クラス2「派生行の非整合」**: 非活性化は `workspace_members.membership_status` を倒すだけで、`project_members` / `channel_members` / `pinned_projects` / `notifications` / push subscription / auth cache / Realtime RLS が自動追随しない。read 毎・再有効化毎に「active 所属から派生を再導出」を手で覚える必要があり、本質的に脆い。

これは「横断的な不変条件を各所へ手で撒く」構造そのものが原因であり、以下の 3 層で発生源から断つ。

### Layer A — DB ビューで「active の定義」を 1 箇所に（クラス1）

「active membership」の定義を SQL ビューへ閉じ込め、全読み取りがそれを経由する。絞り忘れがクエリ構造上不可能になる。

```sql
CREATE VIEW active_workspace_members AS
  SELECT * FROM workspace_members WHERE membership_status = 'active';
```

```ts
// packages/db/src/schema/workspaces.ts
export const activeWorkspaceMembers = pgView('active_workspace_members').as((qb) =>
  qb.select().from(workspaceMembers).where(eq(workspaceMembers.membershipStatus, 'active')),
)
```

- `getWorkspaceRole` は `activeWorkspaceMembers` から select するだけで、`eq(..., 'active')` 述語が消える。
- 各所の `innerJoin(workspaceMembers, and(..., eq(membershipStatus, 'active')))` を `innerJoin(activeWorkspaceMembers, ...)` に置換。join した時点で inactive は構造的に除外される。
- Realtime の SQL 関数（`can_access_channel` 等）も `join active_workspace_members wm ...` に置換し、TS と SQL で「active」の定義を 1 つに一致させる。
- 将来 active の定義が変わっても（例: `deactivated_at IS NULL` を条件に足す、猶予期間を設ける）、ビュー定義 1 箇所を直すだけで全 read に波及する。

> **追記（[PR #286](https://github.com/keishingu/Cairn/pull/286#discussion_r3517918000) の Codex 指摘を反映）**: Next.js API・Realtime SQL 関数に加えて、**Supabase Storage の RLS ポリシーも同じ穴を抱えている**。`supabase/migrations/0007_fix_chat_attachments_rls.sql` の `chat_attachments_select` / `_insert` / `_delete` はいずれも `FROM workspace_members WHERE user_id = auth.uid()` を直接参照しており、`membership_status` を見ない。非活性化された後も Supabase セッションが有効なままなら、Next.js API を経由せず Storage に直接アクセスして旧ワークスペースの添付ファイルを読み書き・削除できてしまう。Layer A の対象は **TS の読み取り・Realtime SQL 関数・Storage RLS ポリシーの 3 種すべて**とし、これら Storage ポリシーも `active_workspace_members` ビュー参照（もしくは `membership_status = 'active'` 条件の追加）に揃える。

### Layer B — 認可を読む場所を 1 モジュールに集約（クラス1）

ビューで「絞り忘れ」は塞げるが、`permissions.ts` と `notification-access.ts` が role 解決・到達性判定を別々に再実装しており重複している。`workspace_members` / `project_members` / `channel_members` を**認可目的で読むのはこのモジュールだけ**という不変条件を作る。

```ts
// apps/web/src/lib/access/membership.ts（単一の入口）
export async function getWorkspaceRole(ws: string, user: string): Promise<WorkspaceRole | null>
export async function requireActiveMember(ws: string, user: string, min: WorkspaceRole): Promise<NextResponse | null>
export async function listActiveMemberIds(ws: string): Promise<string[]>
export async function filterActiveMemberIds(ws: string, ids: string[]): Promise<Set<string>>
export async function canAccessChannel(ws: string, user: string, channelId: string): Promise<boolean>
export async function canAccessProject(ws: string, user: string, projectId: string): Promise<boolean>
export async function canAccessFile(/* ... */): Promise<boolean>
```

- `notification-access.ts` の `fetchActiveChannelRecipients` / `fetchActiveMentionedMembers` / `fetchActiveGuestIds` を、内部で `activeWorkspaceMembers` ビュー join に統一。guest の project 到達判定も `canAccessProject` に寄せる。
- `/api/projects/[id]/members` / `/api/workspaces/dms` / `/api/workspaces/list` / `/api/channels/[channelId]/members` など、**認可判定・候補リスト**（メンション補完・DM作成候補・チャンネル参加者チェック等）として membership を読む箇所は、手書きの active join を `listActiveMemberIds` / `requireActiveMember` 呼び出しに置換。
- 「active を絞る」表面積が縮む。新規 read path はこの用途に限り必ずこのモジュールを通す、をレビュー規約にする。

**適用対象外**: `/api/workspaces/members`（管理者向けメンバー一覧 API）はこの集約の対象に**含めない**。§6 はこの API が `status` を返し、現役/卒業生（非活性）を分離表示した上で管理者が再活性化できることを要求している。active-only ヘルパーへ寄せると非活性ユーザーが API 境界で消え、再活性化の導線自体が失われる（Codex 指摘、[PR #286](https://github.com/keishingu/Cairn/pull/286#discussion_r3517190959)）。Layer B は「認可判定・候補リストの読み取り」専用とし、管理者向けの inactive-aware な一覧 API は既存のまま `workspace_members` を直接参照する（§6・§9-4 で別途 `status` 対応する）。

**適用対象外（その2）**: 「全読み取りを active view に寄せる」という一律ルールは、§5 の「既存の発言・写真・ファイル・タスクは本人名義のまま表示（履歴は変えない）」と衝突する（Codex 指摘、[PR #286](https://github.com/keishingu/Cairn/pull/286#discussion_r3517975000)）。`apps/web/src/app/api/channels/[channelId]/messages/route.ts` の発言者、`apps/web/src/app/api/files/route.ts` のアップロード者、`apps/web/src/app/api/tasks/route.ts` の担当者アバターなど、**既存コンテンツに紐づく行為者（historical actor）を装飾表示するための join** は `activeWorkspaceMembers` に置き換えてはならない。置き換えると非活性化後に卒業生の表示名・アバターが欠落する。Layer B が active view に寄せるのは「これから権限を判定する・これから宛先候補を絞る」read（authorization / candidate・recipient list）に限定し、既存コンテンツの行為者表示は今までどおり `workspace_members`（または `profiles` 単体）を無条件で参照する。

### Layer C — 非活性化を「派生までカスケードする状態遷移」に（クラス2の根治）

> **訂正（[PR #286](https://github.com/keishingu/Cairn/pull/286#discussion_r3517190961) の Codex 指摘を反映）**: 当初案は非活性化（deactivate）の時点で派生行を削除するとしていたが、これは §5 の「再活性化 → 所属・履歴はそのまま復帰」と矛盾する。管理者が単純に `inactive → active` を戻す**通常の再活性化**では、削除された `project_members` / `channel_members` / `pinned_projects` を復元する元データが無くなってしまう。PR #245 が実際に実装したのは「非活性化時」ではなく「**非活性メンバーを低権限で再招待（invite accept）した時点**」での掃除であり、これは招待のスコープを新しい権限で洗い替える操作であって、非活性化そのものの副作用ではない。設計を実挙動に合わせて訂正する。

PR #245 の個別対応は、再招待エンドポイント内で `project_members` / `channel_members` / `pinned_projects` / `notifications` を都度掃除している。これをエンドポイントから引き剥がし、状態遷移関数に集約する。**掃除は「再招待経由での復帰」パスに限定し、非活性化そのものや単純な再活性化では派生行に触れない。**

```ts
// apps/web/src/lib/access/lifecycle.ts

// 非活性化: membership_status を倒すだけ。§5 の「所属・履歴はそのまま復帰」を
// 満たすため、project_members / channel_members / pinned_projects には触れない。
export async function deactivateMembership(tx, ws: string, user: string) {
  // 1. workspace_members.membership_status = 'inactive'（deactivatedAt/deactivatedBy を記録）
  // 2. 未読・未配信 notifications の生成を止める（既存通知の削除はしない）
}

// 単純な再活性化（管理者が status を戻すだけ、招待を介さない）:
// 派生行は非活性化時に消していないので、そのまま所属・履歴が復帰する。
export async function reactivateMembership(tx, ws: string, user: string) {
  // membership_status = 'active' のみ。role・project_members・channel_members は不変。
}

// 再招待経由での復帰（招待でロール/スコープが変わるケース）:
// 新しい招待スコープを権威とするため、この経路でのみ旧派生行を掃除してから再付与する。
export async function reactivateViaInvite(tx, ws: string, user: string, role: WorkspaceRole, opts) {
  // 1. その ws 配下の既存 project_members / channel_members(private/DM) / pinned_projects / notifications を削除
  // 2. membership_status='active' + role を招待値で上書き（旧 owner/admin を復活させない）
  // 3. guest なら invite 対象 project だけ project_members に再付与
}
```

- 「非活性化は削除しない・再招待だけが洗い替える」という区別を関数の分割で保証する。これにより通常の再活性化は §5 の約束を機械的に満たし、再招待は §8-2 の再活性化ポリシー（同一性維持）と整合しつつ、低権限で再招待したのに旧 private channel/DM が復活する事故を防ぐ。
- 都度掃除ロジックがエンドポイントから消え、トランザクション境界も `reactivateViaInvite` へ集約される。
- Layer A のビュー guard（active membership のみ read 対象）は、非活性化中に派生行が残っていても漏れを防ぐ defense-in-depth として引き続き機能する。

### 適用順・PR 分割

1. **Layer A（ビュー）+ Layer B（ヘルパー集約）** を構造フィックスとして先行。ほぼ機械的置換で低リスク、クラス1 を発生源から消す。
2. **Layer C（ライフサイクル関数）** を続けて導入し、クラス2 の stale 派生行を根治。
3. これらは #245 とは別 PR に切る。#245 は chat 添付・message bookmarks・LP copy 等の無関係変更が相乗りしておりレビュー困難。「① deactivation アクセス制御 ② Realtime topic 変更 ③ 無関係機能」に分割する。

### テスト観点

- **ビュー**: 非活性化直後に各 read API（notifications / files / members / ical / dms）が即座に除外することを回帰化。Layer A で 1 ヘルパーに集約されるため、テストも集約できる。
- **ライフサイクル**: deactivate → 派生行が消えない（§5 の単純復帰を保証）こと / 単純 reactivate → 元の project_members・channel_members・pin がそのまま参照できること / reactivateViaInvite(guest) → invite 対象 project だけ復活し、旧 private channel・pin・notification が復活しないこと。
- **defense-in-depth**: 派生行を手で残した状態でも Layer A のビュー guard で read が漏れないこと。

### 実装結果（PR #328 との差分）

上記は設計時点のイメージであり、実装（[`apps/web/src/lib/access/membership.ts`](../apps/web/src/lib/access/membership.ts) / [`lifecycle.ts`](../apps/web/src/lib/access/lifecycle.ts)）は以下の点で異なる。コードと本節が矛盾する場合はコードを正とする。

- **Layer A/B は 1 PR にまとめた**: 「①アクセス制御 ②Realtime ③無関係機能」に分割する案だったが、実際は #245 とは別ブランチ（`feat/active-membership-access-control`）を develop から新規に切り、Layer A・B・C をまとめて 1 PR（#328）にした。理由は、Codex レビューが「ここは直したがそこは直していない」という横断的な指摘を繰り返す性質のため、部分適用のまま分割すると同じ指摘が別 PR で再発するため。
- **Layer B の関数一覧が縮小**: `canAccessChannel` / `canAccessProject` / `canAccessFile` は `access/membership.ts` に移設しなかった。既存の `requireChannelAccess` / `requireProjectAccess` / `canAccessFile`（`permissions.ts`）は `getWorkspaceRole` の active 限定化だけで間接的に非活性を弾けるため、そのまま残している。実際に追加したのは `getWorkspaceRole` / `requireActiveMember` / `requireWorkspaceOwner,Admin,Member` / `isActiveWorkspaceMember` / `listActiveMemberIds` / `filterActiveMemberIds` のみ。
- **`/api/workspaces/members` は既定 active-only に変更**: 当初案（§6, §10 Layer B 適用対象外）は「常に `status` を返し UI 側で分離」だったが、レビューで「非 admin にも service-role 解決済みメールを含む inactive 行が見える」指摘を受け、`status` クエリパラメータ省略時は active のみ、`status=all`（inactive を含む）は admin/owner 限定に変更した。管理画面用の一覧取得と、候補リスト用の active-only 取得を同一エンドポイントの query param で使い分ける。
- **Layer C は 3 関数に加えて不変条件のロックとチャンク整合性を持つ**:
  - `deactivateMembership` は独自にトランザクションを張り、対象行 + active owner 集合を `user_id` 昇順の 1 クエリでロックしてから判定する（対象行とowner集合を別クエリでロックすると、同時に別ownerをarchiveする2トランザクションがデッドロックし得るため統合）。
  - 非活性化と同時に `document_chunks`（AI 検索用チャンク、`source_type='member'`）を削除し、再活性化時は `member/upserted` イベントを再送して再インデックスする。これは設計時点になかった、AI 機能との整合性の指摘（Codex）を受けた追加。
  - `reactivateViaInvite` は role の上書きのみを担当し、旧 `project_members` / `channel_members` の掃除は呼び出し元の `apps/web/src/app/api/invite/[token]/accept/route.ts` が自分のトランザクション内で行う（招待 claim の重複防止ロックと同じ境界に含める必要があったため）。設計時の想定より関数の責務分割が1段階広い。
  - 既存 owner から新しい招待（admin 発行の member/guest 招待）で再活性化しても、既存ロールが `owner` の場合は上書きしない不変条件を追加（owner の活性状態・ロールは owner のみ変更できる、という既存ルールを招待経由でバイパスさせないため）。
