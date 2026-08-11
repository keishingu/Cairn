# 通知設計

> **ステータス**: 現行リファレンス（実装に追従して更新する）
> 設計時の検討記録は [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) を参照。

## メンション形式

チャット入力でピッカーから選択すると、メッセージ本文には **canonical な `<@userId>` 形式**（表示名を含まない）で保存される。表示名は本文に焼き込まず、**read 時に最新のプロフィール名へ解決**する（messages GET が `<@userId|現在の表示名>` に hydrate し、クライアントはそれを `@表示名` として描画）。これにより、メンション後にユーザーが名前を変更しても表示名と実名の不一致が起きない。

- 保存値は常に canonical に固定する。POST / PATCH（編集）は `canonicalizeMentions()` で `<@userId|name>` → `<@userId>` に正規化してから保存する（hydrate で一時的に埋め込んだ名前が再保存されても剥がす）。
- 旧データに残る `<@userId|displayName>` 形式も後方互換で受理する（解決時は最新名を優先し、解決できない退会ユーザーは埋め込み名 → `不明なメンバー` の順でフォールバック）。
- 解決ロジックは `apps/web/src/lib/chat/mentions.ts`（`canonicalizeMentions` / `hydrateMentions` / `extractMentionIds` / `stripMentionsToText`）に集約。
- 手打ちの `@名前` はメンション通知の対象外（構造化トークンではないため）。
- 通知本文（`notifications.body`）は送信時点の最新名で解決したスナップショット（イベントの記録のため read 時の再解決はしない）。

## シナリオ別の通知動作

| シナリオ | Push通知 | アプリ内通知（`notifications` テーブル） |
|---------|---------|----------------------------------------|
| チャンネル発言（ファイル添付あり） | なし | チャンネルメンバー全員に記録 |
| チャンネル発言（`<@userId>` メンション） | メンションされた WS メンバーへ送信 | メンションされた WS メンバーに記録 |
| DM 発言（メンション有無問わず） | 参加者全員へ送信 | 参加者全員に記録（`type='dm'`） |

- **閲覧中の Push**: DM・メンションの Push は 10 秒の猶予後に `channel_read_states` を再確認する。DM は対象メッセージを既読済みの受信者には送らない。メンションは閲覧中でも送り、既読済みなら Web のアプリアイコンバッジを更新しない（アプリ内通知とチャンネル未読は自動既読で解消される）
- メンション通知は **チャンネルメンバーに限定しない**。ワークスペースメンバーであれば通知対象（チャンネル未参加でも可）
- DM は `check-dm` ステップで早期リターンするが、Push に加えてアプリ内通知（ベル）にも記録する。Push を逃しても後から回収できるようにするため
- Push の遷移先 URL は実ルート `/chats/{channelId}` に統一する（DM・メンション共通）
- チャンネルを既読にすると、そのチャンネルに紐づく `mention` / `dm` 通知（`data->>'channelId'` で判定）も既読化する。既読状態をチャンネルとベルで分裂させないため
- メンション通知作成とチャンネル既読化は、同じ `channel_read_states` 行をロックするトランザクションで直列化する。既読時刻は取得した最新メッセージの `created_at` に固定し、その時刻以前の通知だけを既読化した後、残った未読メンション通知行から `unread_mention_count` を再計算する。未参加者の初期 read state は対象メッセージ直前を起点にし、そのメンションを未読として残す
- 未読カウントは自分の発言を除外する（`messages.sender_id != userId`）。チャンネル参加時には `channel_read_states` 行を作成し、参加時点を既読起点にする
- 実装: `apps/web/src/lib/inngest/functions.ts` の `onMessageCreated`、既読化は `apps/web/src/app/api/channels/[channelId]/read/route.ts`

> 通知・未読の全体的な再設計方針は [`docs/notification-ux-redesign.md`](notification-ux-redesign.md) を参照。上記は Phase 3（閲覧状態に応じた Push / バッジ制御）まで反映後の動作。配信は Supabase Realtime（Broadcast from Database）で行う（同 Phase 2）。Phase 4（チャンネル別通知設定・DND）以降は未実装。
