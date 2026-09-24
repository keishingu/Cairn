# 定期ジョブ（cron）+ アプリ内投票 設計書

作成日: 2026-06-25 / 最終更新: 2026-09-24
ステータス: 構想・設計段階（未実装。`polls` / `scheduled_jobs` 系テーブル・`messageType: 'poll'` はいずれも存在しない）

ユーザーが**自然言語で定義した定期アクション**を、**確実なスケジュール実行（cron）**で走らせる仕組み。初期の主ユースケースは「毎月の登山本部（下山連絡の電話当番）決めを、アプリ内投票でチャンネルに投げる」こと。

## 1. 位置づけ — AI PMO ハートビートとの違い

| | **定期ジョブ（本書・未実装）** | **AI PMO ハートビート（実装済み）** |
|---|---|---|
| 目的 | 正確なタイミングで確実に実行する定型ジョブ | 近似タイミングの自発的な気づき・監視 |
| 起動 | スケジュール（毎月15日 09:00 等）で**必ず**発火 | 一定間隔で起こされ、ルール / LLM が対応要否を判断 |
| 発言 | 期日が来たら実行（宣言的） | 高確信度の気づきだけ本人へ（沈黙がデフォルト） |
| 実行記録 | run を**必ず**残す（監査・冪等性） | `ai_nudges` の現在状態 + `ai_scan_states` |
| 設計書 | 本書 | [`ai-pmo-design.md`](./ai-pmo-design.md) |

両者は独立して併存させ、AI PMO の Inngest cron をユーザー定義ジョブの汎用基盤として流用しない。

### 用語

| 用語 | 意味 |
|---|---|
| **定期ジョブ** | 「いつ・どのチャンネルに・何を」を定義した cron ジョブ1件。ユーザーが自然言語で作る |
| **ディスパッチャ** | 期日が来たジョブを拾って発火させる Inngest cron |
| **スキル** | ジョブが発火時に呼ぶ内部ツール。第一弾は「アプリ内投票を作成する」 |
| **投票 (poll)** | アプリ内投票（Slack の投票相当）。外部の日程調整サービスは公式 API がなく規約・破損リスクがあるため自作する |
| **Bot 送信者** | ジョブの投稿主。認証ユーザーに紐づかない軽量 profile |

## 2. 主ユースケース（登山本部決め）

設定画面に次のように書くと:

```
毎月15日に、@山田さん @田中さん をメンションして、
来月の登山本部（その週の山行の下山連絡を電話で受け取る担当）を決める投票を
#登山本部 チャンネルに投稿して。選択肢は来月の各週。
```

毎月15日に Bot が `#登山本部` へ「7月の登山本部 担当決め @山田 @田中」と、来月の各週を選択肢にした投票カードを投稿する。投票はアプリ内で完結し、票数はリアルタイムに更新される。

## 3. 全体アーキテクチャ

```
[/settings/scheduled-jobs] 自然言語を入力 → 保存
   ▼
[POST /api/scheduled-jobs] gpt-5-mini で「保存時コンパイル」
   → schedule / channelId / mentionUserIds / actionSpec（rawInstruction も保持）
   ▼
[scheduled_jobs] nextRunAt を計算して保存
   ▼
[Inngest cron: scheduled-job-dispatcher]（例: 5分ごと）nextRunAt <= now の行に job/fire を送る
   ▼
[Inngest fn: on-scheduled-job-fire] 予約 → 選択肢解決 → 投票作成 → Bot 投稿 → message/created → 次回計算
   ▼
[#登山本部 に投票付きメッセージ] → 投票 → poll_votes の DB トリガで broadcast → 票数再取得
```

## 4. 自然言語をいつ解釈するか

**LLM に発火時刻の判定をさせない。**

| フェーズ | LLM | 内容 |
|---|---|---|
| 保存時コンパイル | gpt-5-mini を1回 | 自然言語 → `schedule` / `channelId` / `mentionUserIds` / `actionSpec`。曖昧さ（名前重複・チャンネル不在）はここでエラー |
| 発火判定 | 使わない | `nextRunAt <= now` の単純比較 |
| 発火時コンテンツ生成 | 必要時のみ gpt-5-mini | 決定論で出せない自由文だけ。選択肢の日付展開などは決定論 |

- **確実性**: LLM 判定に委ねると解釈ブレで実行漏れ・重複が起きる。比較なら必ず1回だけ走る
- **コスト**: 発火判定で LLM を回さない
- **プレビュー可能**: 保存時に構造が確定するので「次回 7/15 09:00 に実行」と確定表示できる
- **自然言語は捨てない**: `rawInstruction` を編集・表示の正として保持し、編集のたびに再コンパイルする

## 5. データモデル

### 5.1 定期ジョブ定義

```ts
scheduled_jobs {
  id, workspaceId → workspaces (cascade)
  senderId       → profiles   // Bot 送信者
  channelId      → channels   // コンパイルで解決済み
  createdBy      → profiles
  rawInstruction text         // 自然言語（編集・表示の正）
  schedule       jsonb        // 例: { "freq": "monthly", "byMonthday": 15, "atHour": 9, "atMinute": 0 }
  mentionUserIds uuid[]
  actionSpec     jsonb        // 下記
  timezone       text default 'Asia/Tokyo'
  enabled        boolean default true
  nextRunAt, lastRunAt, createdAt, updatedAt
}
```

`schedule` は cron / RRULE 互換を意識し、将来 weekly / daily 等へ拡張する。`actionSpec` の例:

```jsonc
{
  "type": "create_poll",
  "title": "{{nextMonth}}の登山本部 担当決め",
  "body": "下山連絡の電話当番です。担当できる週に投票してください。",
  "options": { "kind": "weeks_of_next_month" },  // 発火時に実日付へ展開
  "allowMultiple": false,
  "anonymous": false
}
```

### 5.2 実行ログ

```ts
scheduled_job_runs {
  id, jobId → scheduled_jobs (cascade)
  scheduledFor    timestamptz  // 担当する予定時刻。冪等キー
  firedAt
  status          text         // running | success | failed | skipped
  resultMessageId → messages
  error           text
  unique(jobId, scheduledFor)
}
```

**冪等性は「予約」で担保する**: 発火時にまず `(jobId, scheduledFor)` で `status='running'` 行を INSERT する。二重ディスパッチやリトライでも挿入に成功した1つだけが進み、競合側は skip する。「success 行を SELECT してから判断」する check-then-act は競合窓が残るため採らない。

### 5.3 投票

```ts
polls        { id, workspaceId (cascade), channelId, messageId → messages, createdBy,
               question, allowMultiple default false, anonymous default false, closesAt?, createdAt }
poll_options { id, pollId (cascade), label, position }
poll_votes   { id, pollId (cascade), optionId (cascade), userId, allowMultiple, createdAt }
```

- 同一選択肢への二重投票は `unique(pollId, optionId, userId)` で防ぐ
- 単一選択の1人1票は部分一意インデックス `(poll_id, user_id) WHERE allow_multiple = false` で DB に強制する。部分索引から `polls` を参照できないため `allowMultiple` を `poll_votes` へ非正規化する（`polls.allowMultiple` 変更時は追随）。単純な `unique(pollId, userId)` は複数選択を壊し、制約を省くと並行二重投票を許すため

## 6. 投票機能

定期ジョブとは独立に**単体で使える機能**として作る（手動でも立てられる）。定期ジョブは作成処理を呼ぶだけ。

- **メッセージ種別**: `message_type` enum（現状 `text` / `html` / `system`）に `poll` を追加する。`messages` に metadata カラムはないため、リンクは `polls.messageId` を正とし、クライアントは表示中メッセージの ID から投票を引く
- **API**: `POST /api/polls`（作成と同時に `poll` メッセージを投稿）、`POST /api/polls/[id]/vote`（単一選択は既存票の削除→挿入を1トランザクションで置換）、`GET /api/polls/[id]`（集計。anonymous でなければ投票者も）
- **集計の配信**: Broadcast from Database（[`notification-design.md`](./notification-design.md#realtime-配信)）
- **UI**: チャット内のインライン `PollCard`（選択肢 + 票数バー + 自分の投票状態）
- **権限**: 作成・投票はチャンネルにアクセスできるメンバー（`requireChannelAccess`）

## 7. 投票作成スキル

[`10_ai_member_design.md`](./10_ai_member_design.md) Stage 2 の「ツール呼び出しで `packages/core` のユースケースを実行」に乗せる。

- `packages/core` に `PollPort.createPoll(...)`（workspaceId / channelId / authorProfileId / question / options / allowMultiple / anonymous / closesAt → pollId / messageId）と、バリデーションを持つ `createPoll` ユースケースを置く。実装は `apps/web` で `POST /api/polls` と同じ内部関数を呼ぶ
- AI SDK の tool として `create_poll` を公開すれば、会話中の「投票立てて」にも使える。定期ジョブは LLM を介さず同じユースケースを直接呼ぶ
- 投票 → スキル → 定期ジョブの順に作り、定期ジョブを「既存スキルを cron で叩く薄い層」に保つ

## 8. 発火フロー（on-scheduled-job-fire）

各段を `step.run` で冪等に分割する。

1. **load**: 定義・Bot 送信者・チャンネルをロード。`enabled=false` なら skip
2. **reserve**: run を予約（§5.2）。投稿の**前**に置き、副作用の重複を防ぐ
3. **resolve-action**: `weeks_of_next_month` 等を timezone 基準で実日付に展開、テンプレ変数を置換（決定論）
4. **create-poll**: 本文先頭に `mentionUserIds` を canonical `<@userId>` 形式で付ける（`lib/chat/mentions.ts` 準拠）
5. **notify**: `message/created` を送り、既存の `on-message-created` にメンション通知・Push を任せる
6. **bookkeeping**: `lastRunAt` と次の `nextRunAt` を更新、run を `success` に
7. **失敗時**: run を `failed`（+ error）にし、作成者へアプリ内通知でエラーを知らせる（サイレントに fallback しない。投稿先に半端なメッセージを残さない）

メンションは**保存時**に userId へ固定し、発火時に名前で再解決しない（改名・同名で誤爆するため）。一意に解決できない名前は保存エラーにする。

## 9. 設定 UI（/settings/scheduled-jobs）

AGENTS.md の設定 URL 駆動に従い `SETTINGS_NAV_GROUPS` / `SettingsSectionContent` に追加する。

- **一覧**: rawInstruction の要約 / 次回実行 / on-off / 直近の実行結果
- **作成・編集**: 自然言語の入力欄 + 保存。保存時に確定内容をプレビューする（「次回 2026-07-15 09:00 (JST) に #登山本部 で @山田 @田中 をメンションし、来月の各週を選択肢にした投票を投稿します」）
- **コンパイル失敗時**: 「`@佐藤` に一致するメンバーが2人います」等、何が解決できなかったかを示して保存を止める
- **権限**: Bot として投稿するため、作成は対象チャンネルのメンバーである member 以上

## 10. スケジュールとタイムゾーン

- `timezone` はワークスペース既定（当面 `Asia/Tokyo`）。`nextRunAt` は UTC で保存し、計算時に timezone を考慮する
- ディスパッチャ間隔（例 5分）より細かい精度は保証しない

## 11. リスクと対策

| リスク | 対策 |
|---|---|
| 二重発火 | `scheduled_job_runs` の予約（§5.2） |
| メンションの誤爆 | 保存時に userId へ固定。曖昧な名前は保存エラー |
| 意図せぬチャンネルへの投稿・誤解釈 | 保存時プレビュー + on-off トグル |
| 票の改ざん・多重投票 | DB の一意制約 + サーバー側検証 |
| LLM コスト | 発火判定に LLM を使わず、生成も決定論優先 |

## 12. 未決事項

- テスト実行ボタンを設けるか。設けるなら本番チャンネルへ出すか dry-run プレビューに留めるか
- 「毎月31日」等、存在しない日付の扱い（月末クランプ案）
- 締切到達時に集計サマリを自動投稿するか
- 1ワークスペースあたりのジョブ上限・発言頻度上限
- 選択肢に「メンバー」を直接使う種別（`members_of_channel` 等）を初期から入れるか
- ジョブ作成権限を member 以上にするか admin に絞るか
- Bot 送信者 profile の RLS / 認証設計（[`10_ai_member_design.md`](./10_ai_member_design.md) と共通）
