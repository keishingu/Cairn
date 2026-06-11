# 通知・未読設計書

> **ステータス**: 設計時スナップショット（作成: 2026-05-27）
> 通知・未読の**実装後の現行仕様は [`notification-design.md`](./notification-design.md) を参照**。本書は設計時の検討記録であり、矛盾する場合はそちらとコードを正とする。

---

## 1. 設計方針

### チャンネル = エンティティ

Cairn における基本設計思想は **「エンティティ = チャンネル」** の 1:1 対応。

| エンティティ | `channels.type` | 備考 |
|---|---|---|
| ワークスペース（野良チャット） | `workspace` | プロジェクトに属さない会話 |
| プロジェクト | `project` | プロジェクト作成時に自動生成 |
| マイルストーン（将来） | `milestone` | マイルストーン作成時に自動生成 |
| DM | `dm` | 1:1 または少人数 |

この設計により、未読・通知・Push 通知の仕組みを**全チャンネルで均一**に扱える。

### 未読管理の方式選定

「`channel_members` に `last_read_at` を追加する」案と「専用テーブルを別立て」する案を比較検討した結果、**`channel_read_states` テーブルを別立てする方式**を採用する。

理由：
- `channel_members` はメンバーシップ（誰が参加しているか）を表す。閲覧状態（どこまで読んだか）は別の関心事
- 更新頻度が異なる（メンバー参加は低頻度、既読更新は高頻度）
- `unread_mention_count` など、未読の粒度を将来拡張しやすい
- 行数は `channel_members` と変わらない（ユーザー × チャンネル数）ため、クエリ負荷は同等

---

## 2. DB スキーマ

### `channel_read_states`

```sql
create table channel_read_states (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles(id) on delete cascade,
  channel_id            uuid not null references channels(id) on delete cascade,
  last_read_at          timestamptz not null default now(),
  last_read_message_id  uuid references messages(id) on delete set null,
  unread_mention_count  integer not null default 0,
  updated_at            timestamptz not null default now(),

  unique(user_id, channel_id)
);

create index idx_channel_read_states_user on channel_read_states(user_id);
```

- `last_read_at` : チャンネルをアクセスした最終日時。未読カウントは `messages.created_at > last_read_at` で算出
- `last_read_message_id` : タイムスタンプのみだとクロックスキューで誤判定する可能性があるため、最後に読んだメッセージ ID も保持
- `unread_mention_count` : 未読のうち @メンションを含むもの。通常未読と異なる色のバッジに使用

### `notifications`

```sql
create type notification_type as enum (
  'mention',
  'task',
  'file',
  'status',
  'invite',
  'reaction',
  'ai'
);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type         notification_type not null,
  title        text not null,
  body         text not null,
  data         jsonb,                   -- 遷移先 URL・関連エンティティ ID など
  read_at      timestamptz,             -- null = 未読
  created_at   timestamptz not null default now()
);

create index idx_notifications_user_unread
  on notifications(user_id, created_at desc)
  where read_at is null;
```

### `channels` の将来拡張（マイルストーン対応時）

マイルストーン機能の追加タイミングで以下のカラムを追加する。現時点では実装しない。

```sql
-- 将来追加
alter table channels add column parent_channel_id uuid references channels(id) on delete cascade;
alter table channels add column milestone_id       uuid references milestones(id) on delete cascade;
-- channel_type enum に 'milestone' を追加
```

`channel_read_states` はチャンネル ID に対して動作するため、マイルストーンチャンネルが追加されても変更不要。

---

## 3. 通知生成フロー

通知は **Inngest ジョブ** が各イベントを受けて生成する。API ルートで直接 `INSERT` しない。

```
イベント発生（メッセージ送信・タスク更新 etc.）
  ↓
Inngest ジョブ（例: on-message-created）
  ↓
対象ユーザーを特定（メンション解析・チャンネルメンバー取得）
  ↓
notifications テーブルに INSERT
  ↓
（Push 対象の場合）NotificationService.sendPush()
```

---

## 4. 未読カウントのクエリ方針

チャンネル一覧取得時に未読数を JOIN で付与する。

```sql
select
  c.id,
  c.name,
  count(m.id) filter (where m.created_at > coalesce(rs.last_read_at, '-infinity')) as unread_count,
  coalesce(rs.unread_mention_count, 0) as unread_mention_count
from channels c
left join channel_read_states rs on rs.channel_id = c.id and rs.user_id = :userId
left join messages m on m.channel_id = c.id and m.deleted_at is null
where c.workspace_id = :workspaceId
group by c.id, rs.last_read_at, rs.unread_mention_count
```

---

## 5. Push 通知方針

### Web Push（Phase 1）

- Service Worker を `apps/web/public/sw.js` に追加
- `push_subscriptions` テーブルで Web Push の endpoint / keys を管理
- `NotificationService.sendPush()` の実装は `web-push` ライブラリを使用
- Inngest ジョブから呼び出す

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  device_type text not null,   -- 'web' | 'expo'
  endpoint    text not null,
  keys        jsonb,           -- Web Push の p256dh / auth
  expo_token  text,            -- Expo Push Token
  created_at  timestamptz not null default now(),

  unique(user_id, endpoint)
);
```

### Expo Push（Phase 2）

- `push_subscriptions.device_type = 'expo'` として同テーブルで管理
- Expo SDK の `registerForPushNotificationsAsync()` でトークン取得
- `NotificationService.sendPush()` は `device_type` によって web-push / Expo Push API を切り替える

---

## 6. 実装ロードマップ

| ステップ | 内容 | 依存 |
|---|---|---|
| 1 | `channel_read_states` + `notifications` テーブル追加、マイグレーション | なし |
| 2 | 通知生成 Inngest ジョブ（mention / task / file） | ステップ 1 |
| 3 | `PageNotifications` をモックから実データに切り替え | ステップ 2 |
| 4 | チャンネルサイドバーの未読バッジを実データに切り替え | ステップ 1 |
| 5 | `push_subscriptions` テーブル + Service Worker + Web Push 実装 | ステップ 2 |
| 6 | Expo アプリ（`apps/mobile/`）+ Expo Push 対応 | ステップ 5 |
| 7 | マイルストーン設計・実装（`channels` 拡張） | ステップ 1〜4 完了後 |
