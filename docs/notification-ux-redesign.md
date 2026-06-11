# 通知・未読・Push 再設計案

通知機能（Web / モバイル / デスクトップ）の不安定さ・UX 課題の調査結果と、Slack / Discord / Notion / Backlog / Google Calendar / TimeTree との比較に基づく再設計案。

関連: [`docs/07_notifications_and_unread.md`](07_notifications_and_unread.md)（現行設計）、[`docs/notification-design.md`](notification-design.md)（現行の通知マトリクス）

---

## 1. 現状の問題点（調査結果）

### 1-1. 「不安定さ」の正体 = 更新経路が3系統バラバラ

| データ | 更新方式 | 体感 |
|---|---|---|
| メッセージ本文 | 開いているチャンネルのみ 5 秒ポーリング | ほぼリアルタイム |
| 通知一覧・ベルバッジ | 30 秒ポーリング（`useNotifications`） | 最大 30 秒遅延 |
| サイドバー未読バッジ | **ポーリングなし**（マウント時・ウィンドウフォーカス時・チャンネル切替時のみ） | 放置すると更新されない |

同じ「未読」を表す UI が画面内で別々のタイミングで更新されるため、「数字が合わない」「消えない」「急に増える」という不安定な印象になる。

### 1-2. 未読カウントのロジック不整合

- **自分の発言が未読に数えられる**: 未読クエリ（`/api/workspaces/channels` ほか）が `sender_id != :userId` を除外していない。さらに Web は送信時に既読化しない（モバイルは `use-messages.ts` で送信後に既読化しており、プラットフォーム間で挙動が違う）
- **チャンネル表示中に届いたメッセージが既読にならない**: 既読化は `selectChannel`（クリック時）のみ。開いて読んでいるのにバッジが増え続ける
- **read state 行がないと全履歴が未読**: `coalesce(last_read_at, '-infinity')` のため、新規参加者には過去メッセージ全件分のバッジが出る
- **チャンネル既読とメンション通知既読が独立**: チャンネルを読んでもベルのメンション通知は未読のまま残る

### 1-3. 通知クリック/タップで遷移しない（全プラットフォーム）

- **Push の URL がルートと不一致**: DM Push は `/chat`、メンション Push は `/chat?channel=...` を送るが、実ルートは `/chats/[channelId]`（`functions.ts` vs `app/(app)/chats/`）
- **sw.js の `notificationclick`**: 既存ウィンドウがあると `client.focus()` するだけで **URL に遷移しない**（`navigate` も `postMessage` もしていない）
- **Expo**: `addNotificationResponseReceivedListener` が未実装。Push をタップしてもアプリが開くだけ
- **Web の通知パネル**: `data.channelId` / `messageId` を持っているのに、クリックは既読化のみで遷移しない

「通知が来たのにタップしても目的の場所に行けない」は、通知不信感の最大要因。

### 1-4. 通知ポリシーのノイズと欠落が同居

- ファイル添付でチャンネルメンバー**全員**にアプリ内通知 → ノイズ
- DM はアプリ内通知が記録されない（Push のみ）→ Push を逃すと永久に気づけない
- 閲覧中・アクティブ中でも Push が飛ぶ（プレゼンス連動なし）
- チャンネルミュート・通知レベル・DND（おやすみモード）が一切ない

### 1-5. 生成経路の信頼性

- 通知生成は Inngest 経由のみ。ローカルで Inngest dev server が起動していないと**通知が一切生成されず、エラーも見えない**（開発中の「動いたり動かなかったり」の主因と推定）
- `inngest.send()` 失敗時のリトライ・検知がない

### 1-6. その他

- `GET /api/notifications` に `workspace_id` フィルタがない（マルチワークスペース時に他 WS の通知が混ざる）
- 通知一覧は 50 件固定・ページングなし。`useUnreadNotificationCount` も 50 件上限の長さを数えているだけ
- PWA / Expo のアプリアイコンバッジ数が未同期（Web Badging API 未使用、Expo は `shouldSetBadge: true` だがサーバーが badge 数を送らない）

---

## 2. 他社アプリとの比較から得る設計原則

| アプリ | 通知の核となる考え方 |
|---|---|
| **Slack** | 既定の Push は「DM・メンション・キーワード」のみ。チャンネル発言はバッジ（太字）止まり。**プレゼンス連動**（デスクトップでアクティブならモバイルに送らない、閲覧中チャンネルは通知しない）。既読が全デバイス即時同期。バッジは「赤数字=メンション/DM」「太字=未読あり」の2段階 |
| **Discord** | サーバー → カテゴリ → チャンネルの通知レベル**継承+オーバーライド**。Inbox（メンション一覧）で見逃しを回収 |
| **Notion** | Inbox 中心主義。通知されるのは「自分に関係するもの」（メンション・コメント・割り当て）だけ。Push は控えめでメールダイジェスト併用 |
| **Backlog** | 課題更新時に**通知相手を明示選択**+担当者へ自動通知。メール併用で確実に届ける |
| **Google Calendar** | **時間ベースのリマインダー**（イベント X 分前）が主役。招待・変更・RSVP はイベント駆動。ユーザーがデフォルトリマインダーを設定 |
| **TimeTree** | 共有カレンダーの変更・コメントをフィードに集約。朝のデイリーサマリー通知（今日の予定） |

共通する原則:

1. **「自分宛て」と「環境ノイズ」を区別する** — メンション・DM・割り当ては通知、ただの発言・ファイルはバッジ止まり
2. **既読は全デバイスで即時同期し、閲覧中は通知しない**（プレゼンス連動）
3. **通知は必ずソースへのディープリンク**
4. **ユーザーが粒度を制御できる**（チャンネル別レベル・ミュート・DND）
5. **時間ベース通知（リマインダー）はイベント駆動通知と別系統**で設計する

---

## 3. あるべき設計

### 3-1. 3層モデル（役割の明確化）

| 層 | 役割 | データソース | 更新方式 |
|---|---|---|---|
| **バッジ（未読）** | 「チャンネルに新しいものがある」状態表示 | `channel_read_states` + messages | Realtime（Phase 2） |
| **インボックス（アプリ内通知）** | 自分宛てイベントの永続フィード。見逃し回収 | `notifications` | Realtime（Phase 2） |
| **Push** | 「今すぐ知るべき」ものだけ。プレゼンスで抑制 | Inngest → web-push / Expo | イベント駆動 |

### 3-2. イベント × 配信マトリクス（改訂）

| イベント | バッジ | インボックス | Push |
|---|---|---|---|
| チャンネル通常発言 | unread++ | なし | なし（チャンネル設定 `all` で有効化可） |
| @メンション | unread++ & mention++ | あり | あり（**閲覧中は抑制**） |
| DM | unread++ | **あり（現状なし → 追加）** | あり（閲覧中は抑制） |
| ファイル添付 | unread++ のみ | **廃止**（or チャンネル設定でオプトイン） | なし |
| タスク割り当て | — | あり | あり |
| タスク期日接近 | — | あり | リマインダー（時間ベース） |
| 予定の招待・変更 | — | あり | あり / リマインダー |

### 3-3. バッジ表現の統一（Slack 流の2段階）

- **数字バッジ（アクセント色）= メンション数 + DM 未読数** のみ
- 通常未読は **チャンネル名の太字（or ドット）** に格下げ。現状の「全未読が数字」は心理的ノイズが大きい
- ベルアイコンのバッジ = インボックス未読数
- PWA は `navigator.setAppBadge()`、Expo は Push payload の `badge` で、**アプリアイコンバッジ = メンション+DM+インボックス未読** に同期

---

## 4. 実装ロードマップ

### Phase 1: 信頼性・整合性の修正（最優先・既存構造のまま）— 実装済み

1. ✅ **Push URL を実ルートに修正**（`/chat` → `/chats/${channelId}`）— `lib/inngest/functions.ts`
2. ✅ **sw.js `notificationclick` で遷移**: 既存ウィンドウを `client.focus()` 後 `client.navigate(url)`、なければ `openWindow(url)`
3. ✅ **Expo に `addNotificationResponseReceivedListener` を追加**: `data.url` を該当トップレベルタブへマップ（個別チャンネルへのディープリンクは Phase 2）+ コールドスタート対応
4. ✅ **通知パネルのクリックで遷移**: `data.channelId` から `/chats/{channelId}` へ遷移（既読化と同時にパネルを閉じる）
5. ✅ **自分の発言を未読に数えない**: 未読クエリ 3 本に `sender_id != :userId` を追加。送信時の既読化は item 6 の自動既読でカバー
6. ✅ **閲覧中チャンネルの自動既読化**: `ChatThread` で最新メッセージ ID 変化時、`document.visibilityState === 'visible'` なら mark-read
7. ✅ **チャンネル参加時に read state 行を作成**（参加時点を起点）→ 新規参加者の全履歴未読を解消。メンバー追加・DM 作成の両方
8. ✅ **チャンネル既読時にメンション/DM 通知も既読化**（`notifications.data->>'channelId'` で連動）
9. ✅ **DM のインボックス通知を追加**（`notification_type` に `dm` を追加。Push を逃しても回収できる）
10. ◐ **Inngest 依存の可視化**: `inngest.send()` 失敗は warn ログ済み。ローカル開発で Inngest dev server が必要な旨を CLAUDE.md に明記。リトライ強化は今後
11. ✅ チャンネル一覧クエリに `refetchInterval: 15_000` を付与（Phase 2 で Realtime に置換）

付随修正: `GET /api/notifications` に `workspace_id` フィルタを追加（マルチ WS で他 WS の通知混入を防止）。

### Phase 2: 配信のリアルタイム化（Supabase Realtime へ移行）— スコープ改訂版

CLAUDE.md の方針「ポーリングで実装し、必要に応じて Supabase Realtime へ移行する」をここで発動する。
当初案では「メッセージ本文は 5 秒ポーリング据え置き」としていたが、**メッセージ本文（新着・編集・削除・リアクション）も含めて Realtime 化する**ようスコープを拡張した。

#### 配信方式: Broadcast from Database（postgres_changes からの変更）

当初は postgres_changes（WAL 購読）で実装したが、**本プロジェクトの Realtime サーバーは postgres_changes の購読要求を処理しない**ことが検証で判明した（join 応答に postgres_changes の確認が含まれず `realtime.subscription` に登録されない・Realtime ログでも Broadcast 用レプリケーションのみ起動・ダッシュボードにも有効化設定なし）。Supabase 公式も Broadcast を推奨方式としているため、**`realtime.broadcast_changes()` + DB トリガーの Broadcast from Database 方式**を採用する。

トピック設計（いずれも private channel）:

| トピック | 配信元トリガー | 用途 |
|---|---|---|
| `channel:{channelId}` | `messages` INSERT/UPDATE、`message_reactions` 全イベント | チャット本文・リアクションの更新シグナル |
| `user:{userId}` | `notifications` INSERT、`channel_read_states` INSERT/UPDATE | ベル・インボックス更新、既読のデバイス間同期 |

- メッセージの削除はソフトデリート（`deleted_at`）のため UPDATE トリガーで拾える
- `message_reactions` は行に `channel_id` がないため、トリガー内で親メッセージから引く

#### 設計原則: 「Realtime はシグナル、データは既存 API」

Broadcast ペイロード（`record`）から直接メッセージを組み立てて描画は**しない**。

- ペイロードは生の行データのみで、表示に必要な JOIN（送信者名・アバター・リアクション集計・添付ファイル）を再現できず、DTO 組み立てロジックが API と二重化する
- 代わりに **イベント受信 → 該当する TanStack Query を invalidate → 既存 REST API から再取得**という構成にする（ペイロードは `table` の判別のみに使用）
- 楽観的更新（送信・編集・削除・リアクション）は現行実装のまま変更しない
- **ポーリング（`refetchInterval`）は廃止し、配信経路を Realtime に一本化する**（理由は後述）

これにより、データの単一情報源は REST API のまま、配信レイテンシだけを 5〜30 秒 → 1 秒未満に短縮できる。

#### 認可設計

private channel の join は **`realtime.messages` への RLS（Realtime Authorization）**で認可する:

- `user:{userId}` トピック: `realtime.topic() = 'user:' || auth.uid()`
- `channel:{channelId}` トピック: `can_access_channel_topic()` → `can_access_channel()` で判定
  - 非プライベートチャンネル（workspace / project）は同一 WS メンバー全員、プライベート / DM は `channel_members` 所属者のみ
- 0033 で追加した public テーブル側の RLS SELECT ポリシーは、**Data API（PostgREST）経由の直接読み取りを防ぐ防御**としてそのまま残す（従来は RLS なし = publishable key で全行読めた）
- **API レイヤー（Drizzle）への影響はない**: テーブルオーナー（postgres ロール）接続は RLS をバイパスする
  - 本番反映時に `DATABASE_URL` のロールがテーブルオーナーであることを要確認

#### クライアント購読構成（Web）

アプリシェルに `RealtimeProvider` を 1 つ配置。**1 WebSocket** 上で `user:{me}` + 所属チャンネル分の `channel:{id}` トピックを購読する。チャンネル一覧クエリの結果に追従して join/leave を差分反映する。

| 受信イベント | 動作 |
|---|---|
| `channel:{id}` の `messages` | 該当チャンネルの messages クエリを invalidate + チャンネル一覧 3 種を invalidate（デバウンス 0.8s） |
| `channel:{id}` の `message_reactions` | 該当チャンネルの messages クエリを invalidate |
| `user:{me}` の `notifications` | notifications を invalidate + 一覧 invalidate（未参加チャンネル・新規 DM の活動を回収） |
| `user:{me}` の `channel_read_states` | チャンネル一覧 + notifications を invalidate → **他デバイス既読の即時同期** |

- 認証: 購読前に `supabase.realtime.setAuth(accessToken)`。トークンリフレッシュ時に再設定。チャンネルトピックの join は `user:{me}` の接続成功後に行う（認可前 join を防ぐ）
- **再接続時（`user:{me}` の再 SUBSCRIBED）に対象クエリを一括 invalidate**し、オフライン中の取りこぼしを回収する

#### ポーリングは廃止する（フォールバックも持たない）

当初案では「接続中は間隔を伸ばし、切断時は現行間隔に戻す」二重配信を検討したが、**ポーリング併存はやめ、配信経路を Realtime に一本化する**。

理由:

- 二重経路は「更新が 1 秒で届くときと 15〜60 秒かかるときがある」という非決定的な挙動になり、どちらの経路で届いたか追えずデバッグ困難（Phase 1 で解消した「経路ごとに更新タイミングが違う」問題の再生産）
- ポーリングが Realtime 側の設定ミス（RLS でイベントが落ちている等）を隠蔽し、障害に気づけない。CLAUDE.md の「サイレントに代替データへ fallback せず、エラーを見せる」方針にも反する

代わりに、接続障害は「隠す」のではなく「見せて回復する」:

1. **自動再接続 + キャッチアップ**: supabase-js の組み込み再接続（指数バックオフ + ハートビートによる死活検知）に任せ、再 SUBSCRIBED 時に対象クエリを一括 invalidate して切断中の取りこぼしを回収する
2. **フォーカス時リフェッチ**: TanStack Query の `refetchOnWindowFocus`（既定で有効）で、スリープ復帰・タブ復帰時の取りこぼしをタイマーなしで回収する
3. **切断の可視化**: 一定時間（例: 10 秒）再接続できない場合は「再接続中…」インジケータを表示する（Slack 方式）。ユーザーには「更新が止まっている」ではなく「接続が切れている」と見える
4. 既存の `refetchInterval`（messages 5s / notifications 30s / チャンネル一覧 15s）は Realtime 配線と同時に削除する

割り切り: Realtime サービス自体の長時間障害時は手動リロードに頼ることになるが、二重経路を常時抱えるコストよりも、障害を可視化して単一経路を信頼できる状態に保つことを優先する。

#### モバイルのスコープ

- WebView ベースの画面（通知・チャット詳細ほか）は Web の実装がそのまま効く
- ネイティブ画面（チャンネル一覧・タスク等）は当面ポーリング維持。supabase-js は React Native でも動作するため、必要になれば同じ「シグナル → invalidate」方式を移植する

#### やらないこと / 将来の選択肢

- WS ペイロードからのメッセージ直接描画（上記の理由で不採用）
- タイピングインジケータ・オンラインプレゼンス（Phase 3 以降で Realtime Presence を検討）
- postgres_changes 方式（本プロジェクトの Realtime サーバーが処理しないため不採用。0033 の publication 登録は 0034 で撤去済み）

#### 実装ステップ

1. ✅ RLS 有効化 + SELECT ポリシー（`0033_realtime_rls.sql`。Data API 防御として存続） + Broadcast トリガー・`realtime.messages` 認可ポリシー（`0034_realtime_broadcast.sql`）
2. ✅ `RealtimeProvider` + シグナル → invalidate 配線（`components/realtime/realtime-provider.tsx`。`(app)/layout.tsx` に 1 つ配置。`user:{me}` + 所属チャンネルトピックを購読）
3. ✅ 既存 `refetchInterval` の削除（messages/通知/チャンネル一覧）+ `refetchOnWindowFocus` 有効化 + 切断インジケータ（`realtime-indicator.tsx`）
4. ◔ 検証: 2 ブラウザ間で新着・編集・リアクション・DM・既読同期・切断/復帰（取りこぼし回収）を手動確認（0034 適用後の実環境）

> 本番反映時の注意: `DATABASE_URL` のロールが対象テーブルのオーナー（= RLS バイパス）であることを要確認。ローカル/標準 Supabase は `postgres` ロールのため問題ない。

### Phase 3: プレゼンス連動の Push 抑制

- まず低コスト版: **`last_read_at` が直近 N 秒（例: 30 秒）以内なら Push をスキップ**（Phase 1-6 の自動既読化と組み合わせると「閲覧中は通知しない」がほぼ実現する）
- 本格版: Supabase Realtime Presence で「表示中チャンネル」をトラックし、Inngest 側で送信前にチェック

### Phase 4: 通知設定（ユーザーコントロール）

```sql
create table notification_preferences (
  user_id      uuid not null references profiles(id) on delete cascade,
  channel_id   uuid references channels(id) on delete cascade,  -- null = グローバル既定
  level        text not null default 'mentions',  -- 'all' | 'mentions' | 'mute'
  push_enabled boolean not null default true,
  dnd_start    time,   -- DND 開始（グローバル行のみ使用）
  dnd_end      time,
  primary key (user_id, channel_id)
);
```

- Discord 流の「グローバル既定 + チャンネル別オーバーライド」継承構造
- Inngest の通知生成時に preferences を JOIN して対象を絞る
- UI: 設定ページ（グローバル・DND）+ チャンネルヘッダーからのミュート

### Phase 5: リマインダー系（カレンダー / タスク）

- Google Calendar / TimeTree 相当の**時間ベース通知**: タスク期日前・イベント開始前
- Inngest `step.sleepUntil` + `cancelOn`（対象の変更・削除イベントでキャンセル）で実装
- デイリーサマリー（今日の予定・期日タスク）は cron でオプトイン提供

### 付随する小修正（Phase 1〜2 のどこかで）

- `GET /api/notifications` に `workspace_id` フィルタ追加
- 通知一覧のカーソルページング + 未読数専用の `count` エンドポイント（50 件上限の length 数えを廃止）
- Web Badging API / Expo badge 数の同期

---

## 5. 採用判断が必要な点

| 論点 | 推奨 | 理由 |
|---|---|---|
| ファイル添付通知の扱い | 廃止（バッジのみ） | Slack/Discord/Notion いずれも添付だけでは通知しない。ノイズ源 |
| 通常未読バッジの表現 | 太字/ドットに格下げ、数字はメンション+DMのみ | Slack の2段階方式。数字の洪水を防ぐ |
| Realtime 移行の範囲 | notifications / read_states / messages INSERT 通知のみ（本文取得はポーリング維持） | 移行コストを抑えつつ「不安定さ」の主因を解消 |
| プレゼンス実装 | まず last_read_at ベースの簡易版 | Presence 基盤なしで Slack 的体験の 8 割を実現できる |
| メール通知 | 当面見送り | Push + インボックスの確実化が先。需要が出たら Notion 式ダイジェストを検討 |
