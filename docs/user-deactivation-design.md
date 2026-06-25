# ユーザー非活性化・退会設計（卒業生対応）

- **ステータス**: 設計時スナップショット（未実装）
- **作成**: 2026-06-22
- **関連**: [`CLAUDE.md`](../CLAUDE.md) の権限モデル、[`packages/db/src/schema/workspaces.ts`](../packages/db/src/schema/workspaces.ts)（`workspace_members`）

> 大原則: ドキュメントと実装が矛盾する場合、コードと CLAUDE.md を正とする。本書は実装前の設計合意であり、着手時に更新する。

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
  + status:        memberStatusEnum('status').notNull().default('active')
  + deactivatedAt: timestamp('deactivated_at', { withTimezone: true })          // 監査・表示用
  + deactivatedBy: uuid('deactivated_by').references(() => profiles.id)          // 任意・監査用
```

- `profiles`（＝認証ユーザー）には触れない。再活性化で同一性を保つため。
- マイグレーション: 既存行は `status='active'` 既定で無影響。`pnpm db:generate` → `supabase migration up`。

### マイグレーションは timestamp 方式に切り替える

現状のマイグレーションは `0000_initial.sql`〜`0034_*.sql` の**連番方式**（Drizzle Kit の既定 `prefix: 'index'`）。複数ブランチが並行して `pnpm db:generate` すると同じ次番号（例: `0035_*`）を取り合い、**マージ時に番号衝突・適用順序の不定**が起きる。本機能のマイグレーションを作るこのタイミングで **timestamp 方式へ切り替える**:

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

| # | 単位 | 単体での検証可能性 | 依存 |
|---|---|---|---|
| 1 | **スキーマ + マイグレーション（timestamp 方式へ切替）** | マイグレーション適用で `workspace_members.status` 追加、既存行は `active` 既定で挙動不変。`prefix: 'timestamp'` で新規分が timestamp 形式になることを確認 | なし |
| 2 | **サーバー側アクセス遮断** | `getWorkspaceRole` を active 限定化、`get-auth-context` で非活性除外。非活性メンバーシップが全 `require*` で 403 になることをテストで検証（実データはまだ無いが単体テストで確認可能） | #1 |
| 3 | **非活性化 / 再活性化 API** | `admin` 以上が `status` を切替できる。#2 と合わせ、非活性化したユーザーが当該 WS で 403、再活性化で復帰することを実地検証。最後の active owner は非活性化不可 | #1, #2 |
| 4 | **候補リスト・メンバー一覧の active 絞り込み** | メンバー一覧 API が `status` を返し、メンション/担当割当/DM 作成の候補が active のみになることを検証 | #1（実データは #3） |
| 5 | **UI（現役 / 卒業生分離・非活性化/再活性化ボタン・確認ダイアログ）** | 画面から非活性化→卒業生セクションへ移動、再活性化→現役へ復帰。`isAdmin` での出し分け | #3, #4 |
| 6 | **（フェーズ2）匿名化による消去請求対応** | §7。表示名置換・PII null 化・アバター削除で、非個人データを残しつつ再特定不可になることを検証。非活性化フェーズと独立 | #1（独立着手可） |

依存グラフ: `1 → 2 → 3 → {4 → 5}`、`6` は #1 の後に独立着手可。各 issue は親 issue（エピック）の子 issue として GitHub 上で依存を整理する。
