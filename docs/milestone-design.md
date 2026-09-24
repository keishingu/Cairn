# マイルストーン機能

> **ステータス**: 実装済み。本書は現行仕様・設計判断・残課題のリファレンス（初稿 2026-07-09、2026-09-24 に整理）。
> 本書と実装が乖離した場合はコードを正とする。

## 概要

マイルストーンはプロジェクト内のスケジュール上の区切り（開始・終了の日付と任意の時刻、完了状態）であり、同時にプロジェクト内の話題別チャットルーム（専用チャンネル）を持つ。タスク・ファイル・ギャラリーの親にはならない。

| 領域 | 実装範囲 | コード |
|---|---|---|
| DB | プロジェクト配下のマイルストーン（`start_date` / `end_date` / `start_time` / `end_time` はいずれも nullable、`completed`）。専用チャンネルは `channels.milestone_id`（unique）で 1:1 対応し、削除時に cascade | [milestones.ts](../packages/db/src/schema/milestones.ts)、[channels.ts](../packages/db/src/schema/channels.ts) |
| API | プロジェクト別の取得・作成・更新・削除、ワークスペース内の横断一覧。作成時はマイルストーンとチャンネルを同一 transaction で追加。読み取りはプロジェクトアクセス権、書き込みは member 以上。各ルートで `projects.workspaceId = ctx.workspaceId` を条件に含め越境を防ぐ | [一覧・作成](../apps/web/src/app/api/projects/[id]/milestones/route.ts)、[更新・削除](../apps/web/src/app/api/projects/[id]/milestones/[milestoneId]/route.ts)、[横断一覧](../apps/web/src/app/api/milestones/route.ts) |
| Web 管理 UI | 概要タブの一覧・作成・編集・完了切替・削除確認・チャット遷移、作成／編集モーダル。取得・更新は Domain Hook に集約 | [概要タブ](../apps/web/src/components/app/detail-panel/tabs/overview-tab.tsx)、[モーダル](../apps/web/src/components/app/pages/create-milestone-modal.tsx)、[use-project-milestones.ts](../apps/web/src/hooks/use-project-milestones.ts) |
| Web チャット | サイドバーはプロジェクト（General）直下にマイルストーンを階層表示し、完了分は折りたたむ。詳細パネルのチャットタブは General と未完了マイルストーンを切り替え | [チャットタブ](../apps/web/src/components/app/detail-panel/tabs/chat-tab.tsx) |
| カレンダー | PC・モバイル Web の全体カレンダーでプロジェクトバーの下にマイルストーンを表示。表示トグルは `STORAGE_KEYS.calendar_milestones_visible` | [projects-calendar.tsx](../apps/web/src/components/app/pages/projects-calendar.tsx) |
| Expo チャット | プロジェクトの下に未完了のマイルストーンを表示し、専用の `channelId` へ遷移 | [チャット一覧](<../apps/mobile/app/(app)/chats/index.tsx>) |

用語: 本書の「マイルストーンチャンネル」は `channels` の行であり、`messages.parent_message_id` で表すメッセージ返信スレッドとは別概念。ワークスペースチャンネル配下のスレッド（`channels.parent_channel_id`、1階層のみ）と同じ「親子チャンネル」モデルで、未読・通知・Realtime・検索は既存のチャンネル基盤で共通処理する。

## 設計判断

| 論点 | 判断 | 理由 |
|---|---|---|
| チャンネル種別 | `type='project'` のまま `channels.milestone_id` の有無で識別。`'milestone'` enum は新設しない（[`archive/07_notifications_and_unread.md`](./archive/07_notifications_and_unread.md) の記載より本書を正とする） | 権限・通知・RLS は General と同一であるべきで、`requireChannelAccess()`・`mention-access.ts`・`can_access_channel()` の `type='project'` 分岐をそのまま使える |
| General の解決 | プロジェクトのチャンネルを1件引く箇所は `milestone_id is null` を明示する（例: `PATCH /api/projects/[id]` のシステムメッセージ投稿） | 1プロジェクト複数チャンネルになり、先頭1件では General の保証がない |
| チャンネル表示名 | `channels.name` にタイトルを複製せず、API で `milestones` を JOIN（検索・ブックマークは `coalesce(milestones.title, projects.title, channels.name, 'DM')`） | リネーム時の同期漏れを構造的に防ぐ |
| ステータス | `completed` boolean のみ。遅延（`!completed && endDate < today`）等は UI で判断 | ステータス列の二重管理を避ける |
| 権限 | 作成・編集・完了切替・削除は `member` 以上、閲覧はプロジェクトアクセス準拠（ゲストは参加プロジェクトのみ） | ワークスペースロールのみで決める権限モデル（AGENTS.md）と「プロジェクト編集」相当に合わせる |
| 削除 | チャンネル・メッセージごと cascade 削除。確認ダイアログで会話消失を明示 | 会話を残したい場合は `completed: true` で対応する |
| タスク・ファイル・ギャラリー | マイルストーンに紐付けない | プロジェクトを唯一のコンテナとする方針 |
| カレンダー | 全体カレンダーへの重畳のみ。日付なしのマイルストーンは表示しない。プロジェクト内タイムラインは持たない | 軽量な区切りとして扱う |
| Realtime/RLS 認可 | `can_access_channel()` は公開 `type='project'` チャンネルでもゲストに `project_members` を要求する（`20260709115300_fix_can_access_channel_guest_projects.sql`） | API 側 `requireChannelAccess()` と一致させ、ゲストが参加外プロジェクトのチャンネルを購読できないようにする |
| 通知・AI | `notification_type` / `ai_scope` にマイルストーン専用値は追加しない | メンション・未読はチャンネル単位の既存機構で動き、会話もチャンネル単位で分離される |

## 残課題

2026-09-24 時点で Open の Issue。

- [#453](https://github.com/keishingu/Cairn/issues/453): 開始・終了の順序を共有スキーマで検証する。現状は日付・時刻の形式検証のみで、API に逆転した期間を送れる。
- [#455](https://github.com/keishingu/Cairn/issues/455): 同時編集の競合検出。現状の PATCH は更新バージョンを比較せず、他ユーザーの変更を上書きし得る。
- [#454](https://github.com/keishingu/Cairn/issues/454): チャンネル構成変更（マイルストーン・スレッドの作成等）の他クライアントへの Realtime 反映。作成者側のキャッシュ invalidate だけでは他クライアントの一覧に反映されない。

未採用の将来案: タスクへの任意のマイルストーン関連付け、マイルストーン単位の AI 要約・通知。
