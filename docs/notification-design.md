# 通知設計

> **ステータス**: 現行リファレンス（実装に追従して更新する）
> 設計時の検討記録は [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) を参照。

## メンション形式

チャット入力でピッカーから選択すると、メッセージ本文には **canonical な `<@id>` 形式**（表示名を含まない）で保存される。表示名は本文に焼き込まず、**read 時に最新ラベルへ解決**する（messages GET が `<@id|現在の表示名>` に hydrate し、クライアントはそれを `@表示名` として描画）。これにより、メンション後にユーザーや属性の名前を変更しても表示が追従する。

| 種類 | 保存トークン | 表示例 | 通知先の展開 |
| --- | --- | --- | --- |
| ユーザー | `<@userId>` | `@田中` | そのユーザー（active のみ） |
| 全員 | `<@all>` | `@all` | チャンネルにアクセスできる active メンバー（送信者除く） |
| プロジェクトメンバー | `<@project_members>` | `@project_members` | そのチャンネルの `project_members` のうち active（送信者除く）。プロジェクトチャンネルのピッカーにのみ出す |
| プロフィール属性 | `<@attr:{attributeId}>` | `@コーチ` | その属性が付いた active メンバー → アクセスフィルタ |

- 保存値は常に canonical に固定する。POST / PATCH（編集）は `canonicalizeMentions()` で `<@id|name>` → `<@id>` に正規化してから保存する（hydrate で一時的に埋め込んだ名前が再保存されても剥がす）。
- 旧データに残る `<@userId|displayName>` 形式も後方互換で受理する（解決時は最新名を優先し、解決できない退会ユーザーは埋め込み名 → `不明なメンバー`、削除済み属性は `不明な属性`）。
- 解決ロジックは `apps/web/src/lib/chat/mentions.ts`（`canonicalizeMentions` / `hydrateMentions` / `extractMentionIds` / `stripMentionsToText`）に集約。グループ展開は `mention-expand.ts`、read 時の名前マップは `mention-name-map.ts`。
- 手打ちの `@名前` はメンション通知の対象外（構造化トークンではないため）。ピッカー経由でのみトークン化する。
- 通知本文（`notifications.body`）は送信時点の最新名で解決したスナップショット（イベントの記録のため read 時の再解決はしない）。
- **非活性メンバーには通知しない**（宛先は常に `active_workspace_members`）。
- **guest** は `requireChannelAccess` と同じ範囲に限定する（通常 workspace は `channel_members`、project は `project_members`、private/DM は `channel_members`）。実装は `filterMentionRecipients`。
- DM 内の `@all` / `@project_members` / 属性メンションは展開しない（DM は参加者通知で早期 return）。Web ピッカーでも DM ではこれらの候補を出さない（個別ユーザー候補のみ）。

## シナリオ別の通知動作

| シナリオ | Push通知 | アプリ内通知（`notifications` テーブル） |
|---------|---------|----------------------------------------|
| チャンネル発言（ファイル添付あり） | なし | チャンネルメンバー全員に記録 |
| チャンネル発言（ユーザー / `@all` / `@project_members` / 属性メンション） | 展開後の到達可能な active メンバーへ送信 | 同左に記録（`type='mention'`） |
| DM 発言（メンション有無問わず） | 参加者全員へ送信 | 参加者全員に記録（`type='dm'`） |

- **閲覧中の Push**: DM・メンションの Push は 10 秒の猶予後に `channel_read_states` を再確認する。DM は対象メッセージを既読済みの受信者には送らない。メンションは閲覧中でも送り、既読済みなら Web のアプリアイコンバッジを更新しない（アプリ内通知とチャンネル未読は自動既読で解消される）
- 個別メンションは **チャンネルメンバーに限定しない**。チャンネルにアクセスできるワークスペースメンバーなら通知対象（チャンネル未参加の member 以上も可）。guest は上記のとおり到達可能な場合のみ
- DM は `check-dm` ステップで早期リターンするが、Push に加えてアプリ内通知（ベル）にも記録する。Push を逃しても後から回収できるようにするため
- Push の遷移先 URL は実ルート `/chats/{channelId}` に統一する（DM・メンション共通）
- チャンネルを既読にすると、そのチャンネルに紐づく `mention` / `dm` 通知（`data->>'channelId'` で判定）も既読化する。既読状態をチャンネルとベルで分裂させないため
- メッセージ作成と既読スナップショットはチャンネル行、メンション通知作成とチャンネル既読化は同じ `channel_read_states` 行をロックして、それぞれトランザクションを直列化する。メッセージの `created_at` はチャンネルロック取得後の時刻にし、既読位置とメンションの既読判定は DB のマイクロ秒精度を保ったまま比較する。既読時刻は既存値と取得した最新メッセージの新しい方を採用して単調増加させ、message ID は実際に開いた最新スナップショットを記録する。その時刻以前と削除済みメッセージ由来の通知だけを既読化した後、残った未読メンション通知行から `unread_mention_count` を再計算する。空チャンネルと未参加者の初期 read state は epoch を起点にし、ジョブの実行順にかかわらず未閲覧のメンションを未読として残す
- 未読カウントは自分の発言を除外する（`messages.sender_id != userId`）。チャンネル参加時には `channel_read_states` 行を作成し、参加時点を既読起点にする
- メンション配信が参加前のユーザーに作成した epoch 起点の合成 read state は、後からチャンネルへ参加した時点まで進める。実際の既読履歴がある state は保持する
- 実装: `apps/web/src/lib/inngest/functions.ts` の `onMessageCreated`、既読化は `apps/web/src/app/api/channels/[channelId]/read/route.ts`

> 通知・未読の全体的な再設計方針は [`docs/notification-ux-redesign.md`](notification-ux-redesign.md) を参照。上記は Phase 3（閲覧状態に応じた Push / バッジ制御）まで反映後の動作。配信は Supabase Realtime（Broadcast from Database）で行う（同 Phase 2）。Phase 4（チャンネル別通知設定・DND）以降は未実装。
