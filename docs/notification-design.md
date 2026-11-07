# 通知設計

> **ステータス**: 現行リファレンス（実装に追従して更新する）
> 設計時の検討記録は [`07_notifications_and_unread.md`](./archive/07_notifications_and_unread.md) を参照。

## メンション形式

チャット入力でピッカーから選択すると、メッセージ本文には **canonical な `<@id>` 形式**（表示名を含まない）で保存される。表示名は本文に焼き込まず、**read 時に最新ラベルへ解決**する（messages GET が `<@id|現在の表示名>` に hydrate し、クライアントはそれを `@表示名` として描画）。これにより、メンション後にユーザーや属性の名前を変更しても表示が追従する。

| 種類 | 保存トークン | 表示例 | 通知先の展開 |
| --- | --- | --- | --- |
| ユーザー | `<@userId>` | `@田中` | そのユーザー（active のみ） |
| 全員 | `<@all>` | `@all` | チャンネルにアクセスできる active メンバー（送信者除く） |
| プロジェクトメンバー | `<@project_members>` | `@project_members` | そのチャンネルの `project_members` のうち active（送信者除く）。プロジェクトチャンネルのピッカーにのみ出す |
| プロフィール属性 | `<@attr:{attributeId}>` | `@コーチ` | その属性が付いた active メンバー → アクセスフィルタ |
| プロジェクトの役割 | `<@role:{projectRoleId}>` | `@レビュワー` | そのチャンネルのプロジェクトでその役割を持つ active メンバー → アクセスフィルタ。プロジェクトに紐づかないチャンネルでは誰にも展開しない（候補にも出さない） |

- 保存値は常に canonical に固定する。POST / PATCH（編集）は `canonicalizeMentions()` で `<@id|name>` → `<@id>` に正規化してから保存する（hydrate で一時的に埋め込んだ名前が再保存されても剥がす）。
- 旧データに残る `<@userId|displayName>` 形式も後方互換で受理する（解決時は最新名を優先し、解決できない退会ユーザーは埋め込み名 → `不明なメンバー`、削除済み属性は `不明な属性`）。
- ユーザー名のread時解決は同じワークスペースの `workspace_members` 所属履歴に限定し、非活性メンバーの名前は維持する。所属履歴のないIDから別ワークスペースの最新グローバル名は取得しない。メッセージ取得・検索・通知プレビュー・プロジェクト一覧・AIのメッセージ調査は共有の名前マップを使う。
- 解決ロジックは `apps/web/src/lib/chat/mentions.ts`（`canonicalizeMentions` / `hydrateMentions` / `extractMentionIds` / `stripMentionsToText`）に集約。グループ展開は `mention-expand.ts`、read 時の名前マップは `mention-name-map.ts`。
- 手打ちの `@名前` はメンション通知の対象外（構造化トークンではないため）。ピッカー経由でのみトークン化する。
- 通知本文（`notifications.body`）は送信時点の最新名で解決したスナップショット（イベントの記録のため read 時の再解決はしない）。
- **非活性メンバーには通知しない**（宛先は常に `active_workspace_members`）。
- **guest** は `requireChannelAccess` と同じ範囲に限定する（通常 workspace は `channel_members`、project は `project_members`、private/DM は `channel_members`）。実装は `filterMentionRecipients`。
- DM 内の `@all` / `@project_members` / 属性メンションは展開しない（DM は参加者通知で早期 return）。Web ピッカーでも DM ではこれらの候補を出さない（個別ユーザー候補のみ）。
- **返信**（`messages.parent_message_id`）は、メンションがなくても返信元メッセージの投稿者へ `mention` 種別で通知する（タイトルは「◯◯ があなたのメッセージに返信しました」）。宛先はメンションと同じく active・アクセス可能・ブロックなしに絞り、送信者自身・削除済みの返信元・DM（参加者通知で足りる）は対象外。返信元がメンションもされている場合はメンションの文言で1件だけ通知し、未読メンション数にも1件として数える。

## シナリオ別の通知動作

| シナリオ | Push通知 | アプリ内通知（`notifications` テーブル） |
|---------|---------|----------------------------------------|
| チャンネル発言（ファイル添付あり） | なし | チャンネルメンバー全員に記録 |
| チャンネル発言（ユーザー / `@all` / `@project_members` / 属性メンション） | 展開後の到達可能な active メンバーへ送信 | 同左に記録（`type='mention'`） |
| DM 発言（メンション有無問わず） | 参加者全員へ送信 | 参加者全員に記録（`type='dm'`） |

- **閲覧中の Push**: DM・メンションの Push は 10 秒の猶予後に `channel_read_states` を再確認する。DM は対象メッセージを既読済みの受信者には送らない。メンションは閲覧中でも送り、既読済みなら Web・Expo のアプリアイコンバッジを更新しない（アプリ内通知とチャンネル未読は自動既読で解消される）
- 個別メンションは **チャンネルメンバーに限定しない**。チャンネルにアクセスできるワークスペースメンバーなら通知対象（チャンネル未参加の member 以上も可）。guest は上記のとおり到達可能な場合のみ
- DM は `check-dm` ステップで早期リターンするが、Push に加えてアプリ内通知（ベル）にも記録する。Push を逃しても後から回収できるようにするため
- Push の遷移先 URL は実ルート `/chats/{channelId}` に統一する（DM・メンション共通）
- チャンネルを既読にすると、そのチャンネルに紐づく `mention` / `dm` 通知（`data->>'channelId'` で判定）も既読化する。既読状態をチャンネルとベルで分裂させないため
- メッセージ作成と既読スナップショットはチャンネル行、メンション通知作成とチャンネル既読化は同じ `channel_read_states` 行をロックして、それぞれトランザクションを直列化する。メッセージの `created_at` はチャンネルロック取得後の時刻にし、既読位置とメンションの既読判定は DB のマイクロ秒精度を保ったまま比較する。既読時刻は既存値と取得した最新メッセージの新しい方を採用して単調増加させ、message ID は実際に開いた最新スナップショットを記録する。その時刻以前と削除済みメッセージ由来の通知だけを既読化した後、残った未読メンション通知行から `unread_mention_count` を再計算する。空チャンネルと未参加者の初期 read state は epoch を起点にし、ジョブの実行順にかかわらず未閲覧のメンションを未読として残す
- 未読カウントは自分の発言を除外する（`messages.sender_id != userId`）。チャンネル参加時には `channel_read_states` 行を作成し、参加時点を既読起点にする
- メンション配信が参加前のユーザーに作成した epoch 起点の合成 read state は、後からチャンネルへ参加した時点まで進める。実際の既読履歴がある state は保持する
- 実装: `apps/web/src/lib/inngest/functions.ts` の `onMessageCreated`、既読化は `apps/web/src/app/api/channels/[channelId]/read/route.ts`

- 閲覧中 Push の判定（`classifyPushRecipients`）も同じファイル。10 秒猶予（`PUSH_GRACE_PERIOD`、Inngest `step.sleep`）後に既読を `last_read_at >= created_at` または `last_read_message_id` 一致で判定し、猶予中に削除されたメッセージの Push も送らない。タスク割り当て Push は対象外
- 未実装: チャンネル別通知レベル・ミュート・DND、時間ベースのリマインダー、ファイル添付通知の廃止（バッジのみ化）。構想は [`archive/notification-ux-redesign.md`](./archive/notification-ux-redesign.md)

## チャット一覧の未読表示

- **件数バッジは自分宛てだけ**: チャンネル・スレッド・プロジェクトは未読メンション数（`unread_mention_count`）、DM は未読数をバッジにする。メンションのない新着は名前の太字（800）と一段明るい文字色だけで示す（通常は標準の太さ）。全新着に件数を出すと、急ぎでない会話まで開いて消したくなるため
- Web のサイドバーと Expo のチャットタブの合計バッジも同じ基準で数える。判定は `packages/shared/src/chat-unread-display.ts` の `chatUnreadDisplay` に集約し、Web と Expo で揃える

## アプリアイコンのバッジ

- **数字はワークスペースを問わない未読のアプリ内通知の数**（`apps/web/src/lib/notifications/badge.ts` の `getUnreadNotificationCount`。非活性ワークスペースの通知は既読にできないため除く）。チャットの未読は混ぜない
- Push の送信時に同じ集計を Web Push の `badgeCount` と Expo Push の `badge` に載せる（`apps/web/src/lib/push/send.ts`）。Web・Expo のどちらかの購読があれば集計し、VAPID が未設定でも Expo には載せる。集計に失敗したら載せずに通知本体だけを送る。`updateAppBadge: false` ならどちらにも載せない
- 前面では `GET /api/notifications/badge-count` の値へ追従する。Web は `AppBadgeSync`、Expo は `useAppBadgeSync`（[`mobile-app.md`](./mobile-app.md#アプリアイコンのバッジ)）。取得に失敗したら 0 にせず今の数字を据え置く

## Realtime 配信

**Broadcast from Database**（DB トリガー + `realtime.broadcast_changes()`）で配信する。本プロジェクトの Realtime サーバーは postgres_changes の購読要求を処理しないため使わない（0033 の publication 登録は 0034 で撤去済み）。

### トピック（いずれも private channel）

| トピック | 配信元テーブル | 用途 |
|---|---|---|
| `channel:{channelId}` | `messages` INSERT/UPDATE、`message_reactions`、`message_blocks`、`tasks` | 表示中のチャットの本文・リアクション・カード・タスクの印の更新シグナル |
| `user:{userId}` | `notifications`、`ai_nudges`、`channel_read_states`、`channel_members`、`channels`、`app_views`、チャンネル活動（`messages` / `tasks`） | ベル・AI nudge 更新、既読のデバイス間同期、非公開チャンネルの参加・離脱、画面外チャンネルの未読・一覧・タスク |

- 削除はソフトデリート（`deleted_at`）なので UPDATE で拾う。`message_reactions` は `channel_id` を持たないためトリガー内で親メッセージから引く
- トリガーは `supabase/migrations/0034_realtime_broadcast.sql` ほか後続マイグレーションで追加

### user トピックへのチャンネル活動の配信

常時購読を `user:{me}` + 表示中のチャットに絞るため（#173。チャンネルごとに購読すると購読数がチャンネル総数に比例し、Realtime の1接続あたりのチャンネル数上限に当たる）、画面外のチャンネルの変化は user トピックで知らせる（`20261105120000_realtime_user_topic_channel_activity.sql`）。

- 対象は `messages` の INSERT と、`channel_id`（スレッドへの移動）・`deleted_at` が変わった UPDATE、`tasks` の INSERT / UPDATE / DELETE。移動は移動元・移動先の両方の閲覧者へ送る。編集・リアクションは表示中のチャットにしか影響しないので channel トピックだけ
- ペイロードは `{ table, operation, channel_ids }` だけで本文・行データを載せない（`realtime.send`、private）。受信側は REST で再取得する
- 宛先は `channel_realtime_recipients()` で送信時点の権限から決める。`can_access_channel()` を全ユーザーについて展開した同じ条件で、**どちらかを変えたら両方を揃える**。`channel_ids` も宛先ごとに見られるものだけに絞る（非公開スレッドへの移動で、移動先に参加していない人へ移動先の ID を出さない）
- 行ごとではなく文ごと（遷移テーブル）に配信する。一括移動・並べ替えでも1文につき宛先1人1件
- 新しい関数は anon / authenticated から実行できない（`REVOKE ALL FROM PUBLIC` とロックダウンの既定権限）。クライアントは他人の `user:` トピックへ join も送信もできない
- 負荷: DB への書き込み（`realtime.messages`）は「文 × 宛先人数」件。代わりに join・再接続はチャンネル数ではなく「1 + 表示中のチャット数」になる
- 既存の `channel:{id}` 配信はそのまま残す（全チャンネルを購読している旧クライアントの互換）。**適用順序はサーバー（migration）が先、クライアントが後**。逆だと画面外の未読が更新されない

#### 宛先判定の同等性の確かめ方

`can_access_channel()` か `channel_realtime_recipients()` を変えたら、全チャンネル × 全ユーザーで両者が一致することを確かめる。データを変えないよう、トランザクション内で変更後の migration を当てて実行し ROLLBACK する（共有 DB で `migration up` しない）。

```sql
begin;
\i supabase/migrations/<変更した migration>.sql
do $$
declare c record; u record; n int := 0;
begin
  for c in select id from channels loop
    for u in select id from profiles loop
      perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
      if public.can_access_channel(c.id) is distinct from
         exists (select 1 from public.channel_realtime_recipients(c.id) r where r = u.id) then
        n := n + 1;
        raise warning 'mismatch channel=% user=%', c.id, u.id;
      end if;
    end loop;
  end loop;
  if n > 0 then raise exception '% mismatches', n; end if;
end $$;
rollback;
```

既存データに owner / member / guest・非活性メンバー・公開 / 非公開 / DM / 参加外プロジェクトが揃っていなければ、同じトランザクション内で fixture を作ってから実行する。配信内容は、同じトランザクション内でメッセージやタスクを書き込み、`realtime.messages` の `topic like 'user:%'` の行（宛先・`channel_ids`・本文が載っていないこと）を確かめる。

### 認可

private channel の join は `realtime.messages` の RLS（Realtime Authorization）で判定する。

- `user:{userId}`: `realtime.topic() = 'user:' || auth.uid()`
- `channel:{channelId}`: `can_access_channel_topic()` → `can_access_channel()`（非プライベートは同一 WS の active メンバー、guest は所属チャンネル / プロジェクトのみ。プライベート / DM は `channel_members`。membership は `active_workspace_members` 経由）
- public テーブル側の RLS SELECT ポリシー（0033）は Data API（PostgREST）経由の直接読み取りを防ぐ防御として残す
- API（Drizzle）はテーブルオーナー接続で RLS をバイパスする。`DATABASE_URL` のロールがテーブルオーナーであることが前提

### 「Realtime はシグナル、データは既存 API」

ペイロード（`record`）から直接描画しない。表示に必要な JOIN（送信者名・アバター・リアクション集計・添付）を再現できず DTO 組み立てが API と二重化するため。ペイロードは `table` の判別だけに使い、**受信 → 該当 TanStack Query を invalidate → REST で再取得**する。楽観的更新はそのまま。

Web は `apps/web/src/components/realtime/realtime-provider.tsx` を `app/(app)/layout.tsx` に 1 つ置き、1 WebSocket で `user:{me}` + 表示中のチャットの `channel:{id}` だけを購読する。チャットを表示するコンポーネント（`ChatThread`）が `useRealtimeChannel(channelId)` で登録し、表示をやめてから 5 秒後に leave する（行き来での join / leave の繰り返しを避ける）。leave したチャンネルのメッセージは古い扱い（`refetchType: 'none'`）にし、次に開いたときに取り直す。登録の数え方と通知の振り分けは `packages/shared/src/realtime-channel-activity.ts` で Web と Expo が共有する。

| 受信 | 動作 |
|---|---|
| `channel:{id}` の `messages` | messages・channel-files を invalidate |
| `channel:{id}` の `message_reactions` / `message_blocks` / `tasks` | messages を invalidate |
| `channel:{id}` の SUBSCRIBED | messages・channel-files を invalidate（表示開始から JOIN までの取りこぼし） |
| `user:{me}` の `messages`（`channel_ids`） | チャンネル一覧（デバウンス 0.8s）+ JOIN 済みでないチャンネルの messages・channel-files |
| `user:{me}` の `tasks`（`channel_ids`） | tasks（デバウンス）+ JOIN 済みでないチャンネルの messages（タスク化の印） |
| `user:{me}` の `notifications` | notifications + チャンネル一覧（未参加チャンネル・新規 DM の活動を回収） |
| `user:{me}` の `channel_read_states` | チャンネル一覧 + notifications（他デバイス既読の即時同期） |
| `user:{me}` の `channel_members` / `ai_nudges` | チャンネル一覧 / ai-nudges |

- 購読前に `supabase.realtime.setAuth(accessToken)` を **await** する（未完了で join すると認可エラー）。トークン更新時も再設定。`channel:{id}` の join は `user:{me}` の SUBSCRIBED 後
- `user:{me}` の（再）SUBSCRIBED 時に対象クエリを一括 invalidate して切断中の取りこぼしを回収する
- Expo のネイティブチャットも同じトピックと方式（`apps/mobile/components/realtime-provider.tsx`。チャット画面が `useRealtimeChannel` で登録）。前面復帰時に一覧・通知・タスク・表示中のチャットを取り直す。WebView 画面は Web の実装がそのまま効く
- 権限取消後: 宛先は送信時点で決まるため user トピックは即座に止まる。表示中のチャットの `channel:{id}` は join 時の認可なので、Realtime が JWT 更新で再評価するまで（最大で JWT の有効期間）届き得る

### ポーリングは置かない

`refetchInterval` によるフォールバックは持たない。二重経路は「1 秒で届くときと数十秒かかるときがある」非決定的な挙動になり、Realtime 側の設定ミス（RLS でイベントが落ちる等）も隠蔽するため。障害は隠さず見せて回復する。

- supabase-js の自動再接続 + 再 SUBSCRIBED 時の一括 invalidate
- TanStack Query の `refetchOnWindowFocus` でスリープ・タブ復帰時を回収
- 10 秒再接続できなければ「再接続中…」インジケータ（`realtime-indicator.tsx`）を出す
- 割り切り: Realtime 自体の長時間障害時は手動リロードに頼る

不採用: WS ペイロードからの直接描画、postgres_changes。タイピング・プレゼンス（Realtime Presence）は未実装。
