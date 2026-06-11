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

### Phase 1: 信頼性・整合性の修正（最優先・既存構造のまま）

1. **Push URL を実ルートに修正**（`/chat` → `/chats/${channelId}`）
2. **sw.js `notificationclick` で遷移**: 既存ウィンドウは `client.navigate(url)`（不可なら `postMessage` でクライアント側ルーティング）、なければ `openWindow(url)`
3. **Expo に `addNotificationResponseReceivedListener` を追加**し、`data.url` で `router.push`
4. **通知パネルのクリックで遷移**: `data.channelId` / `messageId` から該当メッセージへジャンプ（既読化と同時）
5. **自分の発言を未読に数えない**: 未読クエリに `sender_id != :userId` を追加 + Web も送信成功時に既読化（モバイルと挙動統一）
6. **閲覧中チャンネルの自動既読化**: メッセージ到着時、`document.visibilityState === 'visible'` かつ表示中なら mark-read（デバウンス付き）
7. **チャンネル参加時に read state 行を作成**（`joined_at` 起点）→ 新規参加者の全履歴未読を解消
8. **チャンネル既読時にメンション通知も既読化**（`notifications.data->>'channelId'` で連動）
9. **DM のインボックス通知を追加**（Push を逃しても回収できる）
10. **Inngest 依存の可視化**: `inngest.send()` 失敗時のエラーログ+リトライ。ローカル開発手順に Inngest dev server 起動を明記（README / CLAUDE.md）
11. 暫定: チャンネル一覧クエリに `refetchInterval: 15_000` を付与（Phase 2 で Realtime に置換）

### Phase 2: 配信のリアルタイム化（Supabase Realtime へ移行）

CLAUDE.md の方針「ポーリングで実装し、必要に応じて Supabase Realtime へ移行する」をここで発動する。

- `notifications` の INSERT を postgres_changes で購読 → インボックス・ベルバッジ即時更新
- `channel_read_states` の UPDATE を購読 → **他デバイスで既読にしたら即バッジ消去**（Slack 的な既読同期）
- `messages` の INSERT 購読でチャンネル一覧の unread を invalidate（メッセージ本文の 5 秒ポーリングは当面据え置き可）
- ポーリングは Realtime 切断時のフォールバックとして 30–60 秒で残す

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
