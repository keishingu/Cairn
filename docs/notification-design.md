# 通知設計

> **ステータス**: 現行リファレンス（実装に追従して更新する）
> 設計時の検討記録は [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) を参照。

## メンション形式

チャット入力でピッカーから選択すると `<@userId|displayName>` 形式でメッセージ本文に埋め込まれる。この構造化形式により、スペースを含む名前でも正確に userId を抽出できる。手打ちの `@名前` はメンション通知の対象外（表示上のハイライトはされる）。

## シナリオ別の通知動作

| シナリオ | Push通知 | アプリ内通知（`notifications` テーブル） |
|---------|---------|----------------------------------------|
| チャンネル発言（ファイル添付あり） | なし | チャンネルメンバー全員に記録 |
| チャンネル発言（`<@userId\|name>` メンション） | メンションされた WS メンバーへ送信 | メンションされた WS メンバーに記録 |
| DM 発言（メンション有無問わず） | 参加者全員へ送信 | 参加者全員に記録（`type='dm'`） |

- **閲覧中の Push 抑制**: DM・メンションの Push は 10 秒の猶予後に `channel_read_states` を再確認し、対象メッセージを既読済みの受信者には送らない（閲覧中なら自動既読が立つため鳴らない）。アプリ内通知・バッジは即時
- メンション通知は **チャンネルメンバーに限定しない**。ワークスペースメンバーであれば通知対象（チャンネル未参加でも可）
- DM は `check-dm` ステップで早期リターンするが、Push に加えてアプリ内通知（ベル）にも記録する。Push を逃しても後から回収できるようにするため
- Push の遷移先 URL は実ルート `/chats/{channelId}` に統一する（DM・メンション共通）
- チャンネルを既読にすると、そのチャンネルに紐づく `mention` / `dm` 通知（`data->>'channelId'` で判定）も既読化する。既読状態をチャンネルとベルで分裂させないため
- 未読カウントは自分の発言を除外する（`messages.sender_id != userId`）。チャンネル参加時には `channel_read_states` 行を作成し、参加時点を既読起点にする
- 実装: `apps/web/src/lib/inngest/functions.ts` の `onMessageCreated`、既読化は `apps/web/src/app/api/channels/[channelId]/read/route.ts`

> 通知・未読の全体的な再設計方針は [`docs/notification-ux-redesign.md`](notification-ux-redesign.md) を参照。上記は Phase 1（整合性修正）反映後の動作。
