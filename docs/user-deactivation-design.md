# ユーザー非活性化・退会設計（卒業生対応）

- **ステータス**: 実装済み。非活性化は [PR #328](https://github.com/keishingu/Cairn/pull/328)、本人操作のアカウント削除は [Issue #469](https://github.com/keishingu/Cairn/issues/469)。本書と実装が矛盾する場合はコードと AGENTS.md を正とする
- **コード**: [`membership.ts`](../apps/web/src/lib/access/membership.ts)（認可目的の membership 参照の入口）、[`lifecycle.ts`](../apps/web/src/lib/access/lifecycle.ts)（状態遷移）、[`account-deletion.ts`](../apps/web/src/lib/account-deletion.ts)、[`workspaces.ts`](../packages/db/src/schema/workspaces.ts)（`workspace_members` / `active_workspace_members` ビュー）

## 1. 背景: 物理削除をアプリ標準にしない

部活動では卒業生など「いったん抜けるが、コーチとして戻る可能性がある」ユーザーがいる。ユーザーの物理削除を標準にしない理由:

1. **履歴の消滅**: `profiles` 削除は cascade で `messages`・`gallery_items`・所属・通知などを連鎖削除する。卒業生の発言や写真は部の共有財産。
2. **FK による削除失敗**: `files.uploadedBy` / `tasks.createdBy` / `projects.createdBy` などは cascade を持たず、物理削除自体が失敗する。

→ 通常ライフサイクルは**ワークスペース単位の非活性化**とし、同一アイデンティティのまま再活性化で戻れるようにする。

## 2. GDPR / 消去権

GDPR 第17条の消去権はデータ主体の請求を契機とする義務で、全ユーザーの定期的な物理削除は求めない。消去は**匿名化**でも満たせる（再特定不能なデータは適用対象外）。→ 通常運用は非活性化、本人の削除請求は「投稿コンテンツの削除 + 共同作業構造の匿名化」で対応する（§5）。

## 3. データモデルと認可

- `workspace_members.membership_status`（`workspace_member_status` enum: `active` / `inactive`、既定 `active`）+ `deactivated_at` / `deactivated_by`。在席ステータス `workspace_members.status` とは別列。`profiles` には触れない。
- ワークスペース単位なので「A 部では卒業生、B 部では現役コーチ」を表現できる。ゲストにも同じ status が適用される。
- **非活性は未所属と同等**。「active」の定義は `active_workspace_members` ビュー1箇所に閉じ、TS の認可・候補リスト、Realtime の `can_access_channel` 等の SQL 関数、Storage RLS がすべてこれを経由する。各クエリに `membership_status = 'active'` を手で足す方式は、read path を足すたびに穴が開くため採らない（レビューで同種の指摘が約 40 箇所繰り返された経緯による）。
- 認可目的の membership 参照は `membership.ts`（`getWorkspaceRole` / `requireActiveMember` / `requireWorkspaceOwner,Admin,Member` / `isActiveWorkspaceMember` / `listActiveMemberIds` / `filterActiveMemberIds`）を通す。`permissions.ts` の `requireProjectAccess` / `requireChannelAccess` 等は `getWorkspaceRole` の active 限定で間接的に非活性を弾く。`get-auth-context` も active のみからワークスペースを解決する。
- **例外**: 既存コンテンツの行為者（発言者・アップロード者・担当者）の表示 join は `workspace_members` / `profiles` を直接引く。active ビューに寄せると卒業生の名前・アバターが消えるため。

## 4. 挙動マトリクス（非活性ユーザー）

| 領域 | 挙動 |
|---|---|
| 既存の発言・写真・ファイル・タスク | 保持し、本人名義のまま表示 |
| 当該 WS へのアクセス（API・Realtime・Storage） | 403 / 拒否 |
| メンション補完・担当候補・DM 作成候補・通知受信者 | active のみ |
| AI 検索チャンク（`source_type='member'`） | 非活性化時に削除し、再活性化時に `member/upserted` で再インデックス |
| メンバー一覧 `GET /api/workspaces/members` | 既定は active のみ。`?status=all`（inactive 含む）は admin/owner 限定（非 admin にメールを含む inactive 行を見せないため） |
| Supabase Auth | アカウントは生かし、対象 WS のアクセスだけ失わせる |

## 5. ロールと操作

| 操作 | 権限 / 実装 | 備考 |
|---|---|---|
| 非活性化・再活性化 | admin 以上。`PATCH /api/workspaces/members/[userId]` に `status` を渡す | 最後の active owner は非活性化不可。owner の状態・ロールは owner のみ変更可 |
| 非活性化（`deactivateMembership`） | `membership_status` を倒すだけで `project_members` / `channel_members` / `pinned_projects` は残す | 単純な再活性化で所属・履歴がそのまま戻るようにするため。対象行と active owner 集合は `user_id` 昇順の1クエリでロック（別々にロックするとデッドロックし得る） |
| 単純な再活性化（`reactivateMembership`） | `membership_status = 'active'` のみ | ロール・派生行は不変 |
| 再招待での復帰（`reactivateViaInvite`） | 同一メンバーシップを `active` に戻し、ロールを招待値で上書き。旧 `project_members` / `channel_members` の掃除は [`invite/[token]/accept/route.ts`](../apps/web/src/app/api/invite/[token]/accept/route.ts) が同一トランザクション内で行う | 低権限で再招待したのに旧 private channel・DM・旧ロールが復活する事故を防ぐ。既存ロールが owner の場合は上書きしない |
| UI | メンバーページで現役 / 卒業生を分離し、admin 以上にボタンを表示。確認ダイアログでアクセス失効を明示 | |

## 6. 本人操作のアカウント削除

App Store のアカウント削除要件と本人の削除請求に対応する、全ワークスペース横断の不可逆操作。

- `DELETE /api/me/account`（[route](../apps/web/src/app/api/me/account/route.ts)）は認証済み本人のみ、確認文字「削除」を要求する。
- 最後の active owner であるワークスペースがあれば、owner 移譲まで拒否する。
- 本人のメッセージ本文・写真・添付・ギャラリーコメント・個人の AI 会話・個人設定・連携・通知を削除する。Storage 削除対象は `storage_deletion_jobs`（outbox）に保存し、送信失敗時も cron から再送する。
- `profiles` 行は残し、表示名を「退会済みユーザー」に置換して bio 等の PII を消去する。プロジェクト・タスク等は匿名名義で保持する。
- 全 membership 削除後に Stripe 顧客と Supabase Auth ユーザーを削除する。途中失敗しても残った Auth セッションから再試行できる順序にする。
- Expo は認証済み WebView の同じ設定画面から削除し、成功時の bridge message でネイティブ側セッションも破棄する。

## 7. 未決事項

- 全 WS で非活性になったユーザーのログイン後体験（「所属ワークスペースがありません」等の専用表示にするか）。
