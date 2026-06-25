# 定期ジョブ（cron）+ アプリ内投票 設計書

作成日: 2026-06-25
ステータス: 構想・設計段階（実装未着手）

ユーザーが**自然言語で定義した定期アクション**を、**確実なスケジュール実行（cron）**で走らせる仕組みの設計。
初期の主ユースケースは「毎月の登山本部（下山連絡の電話当番）決めを、アプリ内投票でチャンネルに投げる」こと。

> **改名の経緯（2026-06-25）**: 当初この機能を「ハートビート」と名付けたが、OpenClaw の
> [cron vs heartbeat ガイド](https://docs.openclaw.ai/automation/cron-vs-heartbeat) に照らすと誤りだった。
> 「毎月15日に必ず投票を投げる」のような**正確なタイミング・確実な実行・独立したジョブ**は **cron** の領分で、
> heartbeat（近似タイミングで“何か対応が要るときだけ静かに喋る”監視）とは別物。本書は cron として再定義する。
> 旧ファイル名 `heartbeat-design.md` は本ファイルに統合した。

---

## 1. 用語と位置づけ — cron と heartbeat の違い

OpenClaw の整理（[cron vs heartbeat](https://docs.openclaw.ai/automation/cron-vs-heartbeat)）に沿って、2つを明確に分ける。

| | **cron（本書）** | **heartbeat（別物・将来）** |
|---|---|---|
| 目的 | 正確なタイミングで確実に実行する定型ジョブ | 近似タイミングの自発的な気づき・監視 |
| 起動 | スケジュール（毎月15日 09:00 等）で**必ず**発火 | 一定間隔で起こされ、LLM が「今やるべきか」を毎回判断 |
| 発言 | 期日が来たら実行する（宣言的） | 何か対応が要るときだけ喋る（沈黙がデフォルト） |
| 実行記録 | run を**必ず**残す（監査・冪等性） | 記録を残さない |
| Cairn での担当 | **本書の定期ジョブ** | [`10_ai_member_design.md`](./10_ai_member_design.md) Stage 3「心拍」（計画書の催促等） |

→ 登山本部決めは「正確なタイミング・確実な実行」なので **cron**。Stage 3 の heartbeat（異常検知して催促）とは独立して併存する。

### 本書の用語

| 用語 | 意味 |
|---|---|
| **定期ジョブ (scheduled job)** | 「いつ・どのチャンネルに・何を」を定義した cron ジョブ1件。ユーザーが自然言語で作る |
| **ディスパッチャ** | 期日が来たジョブを拾って発火させる Inngest cron |
| **スキル (skill)** | ジョブが発火時に呼び出す内部ツール。第一弾は「アプリ内投票を作成する」スキル |
| **投票 (poll)** | 自作のアプリ内投票機能（Slack の投票ライク）。外部サービスには依存しない |
| **Bot 送信者** | ジョブの投稿主。認証ユーザーに紐づかない軽量 profile（フル AI メンバー基盤は待たない） |

---

## 2. 主ユースケース（登山本部決め）

設定画面のテキスト欄に、ユーザーが次のように書く:

```
毎月15日に、@山田さん @田中さん をメンションして、
来月の登山本部（その週の山行の下山連絡を電話で受け取る担当）を決める投票を
#登山本部 チャンネルに投稿して。選択肢は来月の各週。
```

これを保存すると、毎月15日に Bot が `#登山本部` で次のような投稿を行う:

> 🏔️ **7月の登山本部 担当決め** @山田 @田中
> 下山連絡の電話当番です。担当できる週に投票してください。
> 投票カード:
> - [ ] 7/1の週   0票
> - [ ] 7/7の週   0票
> - [ ] 7/14の週  0票
> - [ ] 7/21の週  0票
> - [ ] 7/28の週  0票

投票はアプリ内で完結し、票数はリアルタイムに集計・表示される（外部の「調整さん」等は使わない）。

> **設計判断（2026-06-25）**: 当初は外部サービス「調整さん」のリンク生成を想定したが、調整さんには
> イベント作成の公式 API が無く、非公式フォーム送信は規約グレー・サイレント破損リスクがある。
> Slack の投票相当の機能を**アプリ内に自作**する方針に変更した。これにより外部 API・規約・破損リスクが
> 消え、票・未読・通知の既存基盤（メッセージ/Realtime）に乗せられる。

---

## 3. 全体アーキテクチャ

```
[設定画面 /settings/scheduled-jobs]
   │  自然言語を入力 → 保存
   ▼
[POST /api/scheduled-jobs]
   │  LLM(gpt-4o-mini)で「保存時コンパイル」
   │   → schedule(cron 構造化) / channelId / mentionUserIds / actionSpec / messageTemplate
   │   → 元の自然言語文も rawInstruction として保持（編集・表示の正）
   ▼
[scheduled_jobs テーブル]  nextRunAt を計算して保存
   ▲                                  │
   │ 編集で再コンパイル                  │  scan due rows
   │                                   ▼
                          [Inngest cron: scheduled-job-dispatcher]（例: 5分ごと）
                                       │  nextRunAt <= now の行を拾う
                                       │  各行に job/fire イベントを送る
                                       ▼
                          [Inngest fn: on-scheduled-job-fire]
                                       │ 1. 定義をロード
                                       │ 2. run を予約（冪等）
                                       │ 3. actionSpec を解決（来月の各週 → 選択肢を生成）
                                       │ 4. スキル実行（投票を作成）= poll 行を作成
                                       │ 5. Bot 送信者として messages に投稿
                                       │ 6. message/created を送る（既存の通知経路に乗る）
                                       │ 7. nextRunAt を再計算、scheduled_job_runs に記録
                                       ▼
                          [#登山本部 に投票付きメッセージが出現]
                                       │ メンバーが投票
                                       ▼
                          [poll_votes]→ DBトリガで realtime.broadcast_changes()
                                       → RealtimeProvider が invalidate → 票数再取得
```

---

## 4. 自然言語をいつ解釈するか（cron として）

OpenClaw の heartbeat は「発火ごとに LLM がタスク表を読んで“今やるべきか”を判断」する近似スケジュールだが、
本書は **cron**＝確実なスケジュール実行なので、**LLM に時刻判定をさせない**。代わりに次の役割分担にする。

| フェーズ | 担当 | LLM | 内容 |
|---|---|---|---|
| **保存時コンパイル** | 設定保存・編集 | gpt-4o-mini を1回 | 自然言語 → `schedule`（cron 構造化）/ `channelId` / `mentionUserIds` / `actionSpec`。曖昧さ（名前重複・チャンネル不在）はここで検出してエラー表示 |
| **発火判定** | ディスパッチャ cron | **使わない** | `nextRunAt <= now` の単純比較。決定論的・安価・確実 |
| **発火時コンテンツ生成** | on-scheduled-job-fire | 必要時のみ gpt-4o(-mini) | 動的な本文・選択肢の生成（例「来月の各週」→ 実際の日付）。決定論で出せる部分は LLM を使わない |

この分担が cron 的に正しい理由:

- **確実性**: 発火を LLM 判定に委ねると、解釈ブレで実行漏れ・重複が起きる。cron 比較なら必ず・1回だけ走る。
- **コスト**: [`10_ai_member_design.md`](./10_ai_member_design.md) でも「巡回 × ワークスペース数」の LLM コストがリスク。発火判定で LLM を回さない。
- **プレビュー可能**: 保存時に構造が確定するので、設定画面で「次回 7/15 09:00 に実行」と確定表示できる。

**自然言語は捨てない**: `rawInstruction` を正として保持し、設定画面ではユーザーが書いた文をそのまま見せて編集させる。
編集のたびに再コンパイルし、`schedule` 等を更新する。

> 「**設定の表現は自然言語、スケジュールの実体は cron**」。入力の手触りは自然言語、実行は cron に落として安く・確実にする。

---

## 5. データモデル

### 5.1 定期ジョブ定義

```ts
// packages/db/src/schema/scheduled-jobs.ts（新規）
scheduled_jobs {
  id            uuid pk
  workspaceId   uuid → workspaces (cascade)
  senderId      uuid → profiles          // 投稿主（Bot 送信者の profile）
  channelId     uuid → channels          // 投稿先（コンパイルで解決済み）
  createdBy     uuid → profiles
  rawInstruction text                     // ユーザーが書いた自然言語（編集・表示の正）
  schedule      jsonb                     // cron 構造化スケジュール（後述）
  mentionUserIds uuid[]                   // 解決済みメンション対象
  actionSpec    jsonb                     // 実行アクション定義（後述）
  timezone      text  default 'Asia/Tokyo'
  enabled       boolean default true
  nextRunAt     timestamptz               // 次回発火予定（ディスパッチャが参照）
  lastRunAt     timestamptz
  createdAt / updatedAt
}
```

`schedule`（jsonb）の例:
```jsonc
{ "freq": "monthly", "byMonthday": 15, "atHour": 9, "atMinute": 0 }
// 将来: weekly / daily / "everyNthWeekday" 等に拡張。内部表現は cron / RRULE 互換を意識する
```

`actionSpec`（jsonb）の例:
```jsonc
{
  "type": "create_poll",
  "title": "{{nextMonth}}の登山本部 担当決め",
  "body": "下山連絡の電話当番です。担当できる週に投票してください。",
  "options": { "kind": "weeks_of_next_month" },   // 動的。発火時に実日付へ展開
  "allowMultiple": false,
  "anonymous": false
}
```

### 5.2 実行ログ

```ts
scheduled_job_runs {
  id            uuid pk
  jobId         uuid → scheduled_jobs (cascade)
  scheduledFor  timestamptz   // この run が担当する「予定時刻」。冪等キー
  firedAt       timestamptz
  status        text   // 'running' | 'success' | 'failed' | 'skipped'
  resultMessageId uuid → messages   // 投稿したメッセージ（あれば）
  error         text
  // unique(jobId, scheduledFor) で予定時刻ごとに run を1行に固定する
}
```
- **冪等性は「予約」で担保する（check-then-act にしない）**。発火時はまず `scheduled_job_runs` に
  `(jobId, scheduledFor)` で **`status='running'` 行を INSERT して run を予約**する。
  `unique(jobId, scheduledFor)` があるため、二重ディスパッチや Inngest リトライで同じ予定が複数流れても
  **挿入に成功した1つだけが先へ進み、競合した側は即 skip** する。「success 行があるか先に SELECT して判断」する方式は、
  両者が SELECT を通過してから INSERT する競合窓が残るため採らない。

### 5.3 投票（アプリ内ポール）

```ts
polls {
  id            uuid pk
  workspaceId   uuid → workspaces (cascade)
  channelId     uuid → channels
  messageId     uuid → messages     // 投票カードを描画するメッセージ
  createdBy     uuid → profiles      // Bot or 人間
  question      text
  allowMultiple boolean default false
  anonymous     boolean default false
  closesAt      timestamptz          // 任意。締切
  createdAt
}

poll_options {
  id        uuid pk
  pollId    uuid → polls (cascade)
  label     text
  position  int
}

poll_votes {
  id            uuid pk
  pollId        uuid → polls (cascade)
  optionId      uuid → poll_options (cascade)
  userId        uuid → profiles
  allowMultiple boolean   // polls.allowMultiple を非正規化（部分インデックスから参照するため）
  createdAt
  // (A) 同一選択肢への二重投票防止: unique(pollId, optionId, userId) を常に張る
  // (B) 単一選択の1人1票: 部分一意インデックス
  //     CREATE UNIQUE INDEX ON poll_votes (poll_id, user_id) WHERE allow_multiple = false;
  //     allowMultiple=true の行はこの索引の対象外なので複数選択を妨げない
}
```

**単一選択の一意性**: `allowMultiple` は `polls` 側にあり `poll_votes` の部分索引から直接は参照できないため、**作成時に `poll_votes.allowMultiple` へ非正規化**し、上記 (B) の部分一意インデックスで DB レベルに強制する（`polls.allowMultiple` 変更時は対象投票の `poll_votes` も更新）。
投票 API（`POST /api/polls/[id]/vote`）は単一選択時、既存票の削除→挿入を**1トランザクション**で行い（置換）、競合は (B) の制約で弾く。これにより「単純な `unique(pollId, userId)` が複数選択を壊す」「制約を省くと並行二重投票を許す」のどちらも回避する。

---

## 6. 投票（アプリ内ポール）機能の設計

定期ジョブとは独立に**単体で使える機能**として作る（手動でも投票を立てられる）。定期ジョブはその作成 API を呼ぶだけ。

- **メッセージ種別**: `messages.messageType` に `'poll'` を追加（既存は `'text' | 'html' | 'system'`）。
  `messages` には `metadata` カラムが無いため新設はしない。リンクは既にデータモデルにある **`polls.messageId`（poll → message の片方向）** を正とし、
  クライアントは表示中メッセージの `id` 群から `polls.messageId IN (...)` で投票を引いて描画する（messageType が `'poll'` のメッセージにのみ投票カードを出す）。
- **投票 API**:
  - `POST /api/polls` — 投票作成（question / options / allowMultiple / anonymous）。作成と同時に messageType `'poll'` のメッセージを投稿
  - `POST /api/polls/[id]/vote` — 投票/取り消し（body: optionId[]）。`allowMultiple=false` は既存票を置換
  - `GET /api/polls/[id]` — 集計取得（option ごとの票数、anonymous でなければ投票者一覧）
- **集計の配信**: `poll_votes` の変更を DB トリガ + `realtime.broadcast_changes()` で配信し、`RealtimeProvider` が
  該当クエリを invalidate → REST 再取得（**本プロジェクトの Realtime 方針に準拠。postgres_changes は使わない**）。
- **UI**: チャットメッセージ内のインライン投票カード（選択肢 + 票数バー + 自分の投票状態）。
  `apps/web/src/components/app/chat/` 配下に `PollCard` を追加。Domain Hook（`use-poll.ts`）で取得・投票を扱う。
- **権限**: 投票の作成・投票はチャンネルメンバー（ゲストは参加プロジェクトのチャンネルのみ）。`requireChannelAccess` を流用。

---

## 7. スキル（内部ツール）設計

「調整さんリンク生成スキル」は、方針変更により **「アプリ内投票を作成するスキル」** になる。
[`10_ai_member_design.md`](./10_ai_member_design.md) Stage 2 の「ツール呼び出しで `packages/core` のユースケースを実行」という枠に乗せる。

- **ポート定義**（`packages/core`、インターフェースのみ）:
  ```ts
  interface PollPort {
    createPoll(input: {
      workspaceId: string; channelId: string; authorProfileId: string
      question: string; options: string[]
      allowMultiple?: boolean; anonymous?: boolean; closesAt?: Date
    }): Promise<{ pollId: string; messageId: string }>
  }
  ```
- **ユースケース**（`packages/core`）: `createPoll` コマンド。バリデーション（選択肢1件以上等）を持つ。
- **実装**（`apps/web` 側）: 上記 `POST /api/polls` と同じ内部関数を呼ぶ。
- **AI ツール定義**（Vercel AI SDK）: エージェントが会話の中でも `create_poll` を tool として呼べるようにしておくと、
  Stage 2 の「@主務 投票立てて」にもそのまま使える。定期ジョブは LLM を介さず同じユースケースを直接呼ぶ。

→ **結論: 「投票作成スキル（ユースケース + ポート + 任意で AI ツール定義）」を先に作るのが土台**。
定期ジョブはそれを cron で叩く薄い層なので、スキル → 定期ジョブの順で実装する。

---

## 8. 発火フロー（on-scheduled-job-fire）詳細

Inngest 関数。各 `step.run` で冪等に分割する（既存 `functions.ts` の流儀に合わせる）。

1. **load**: `jobId` から定義・Bot 送信者・チャンネルをロード。`enabled=false` なら skip。
2. **reserve**: `(jobId, scheduledFor)` で `status='running'` 行を **INSERT して run を予約**する（`onConflictDoNothing`）。
   挿入できなければ別の発火が既にこの予定時刻を担当済み → **即 skip**。この予約を `create-poll` の**前**に置くことで、
   副作用（投稿）の重複を防ぐ。以降のステップは予約した run 行を `running → success/failed` に遷移させる。
3. **resolve-action**: `actionSpec.options.kind` を実値へ展開。
   - `weeks_of_next_month` → 来月の各週の開始日を timezone 基準で算出（決定論。LLM 不要）。
   - 本文に `{{nextMonth}}` 等のテンプレ変数があれば置換。自由文生成が要る場合のみ gpt-4o-mini。
4. **create-poll**: `PollPort.createPoll(...)` を実行 → `pollId` / `messageId` を得る。
   - 本文には先頭にメンション（`mentionUserIds` を canonical `<@userId>` 形式で埋め込む。`lib/chat/mentions.ts` 準拠）を付ける。
5. **notify**: `message/created` イベントを送る → 既存の `on-message-created` がメンション通知・Push を処理。
6. **bookkeeping**: `lastRunAt` 更新、`schedule` から次の `nextRunAt` を再計算、予約した run を `running → success` に更新。
7. **失敗時**: 予約した run を `running → failed`（+ error）に更新し、**作成者へアプリ内通知でエラーを知らせる**
   （CLAUDE.md「サイレントに fallback せずエラーを見せる」に準拠。投稿先に半端なメッセージは残さない）。

メンション解決の注意: NL の「@山田さん」→ userId 解決は**保存時**に行い `mentionUserIds` に固定する。
発火時に名前で再解決しない（改名・同名で誤爆するため）。保存時に一意に解決できない名前はエラーにする。

---

## 9. 設定 UI（/settings/scheduled-jobs）

CLAUDE.md「設定セクションは URL 駆動」に従い、`/settings/scheduled-jobs` セクションを追加する
（`SETTINGS_NAV_GROUPS` に項目追加 + `SettingsSectionContent` に本体を実装。PC/モバイル共有）。

- **一覧**: 登録済みジョブ（rawInstruction の要約 / 次回実行 / on-off トグル / 直近の実行結果）。
- **作成・編集**: 大きめのテキスト入力欄（自然言語）+ 保存。保存時にコンパイルして**確定内容のプレビュー**を返す:
  > 次回 **2026-07-15 09:00 (JST)** に **#登山本部** で **@山田 @田中** をメンションし、
  > 「来月の各週」を選択肢にした投票を投稿します。
- **コンパイル失敗時**: 「`@佐藤` に一致するメンバーが2人います」「`#登山本部` というチャンネルが見つかりません」等、
  具体的に何が解決できなかったかを表示して保存を止める。
- **テスト実行ボタン**: その場で1回発火（投稿先を本番チャンネルにするか dry-run プレビューにするかは要検討 → 未決事項）。
- **権限**: ジョブは指定チャンネルに **Bot として投稿**するため、作成はそのチャンネルのメンバーである member 以上に限定。

---

## 10. スケジュールとタイムゾーン

- `schedule` は構造化（freq / byMonthday / atHour 等）。内部的に cron / RRULE 互換を意識し、将来 weekly/daily に拡張可能にする。
- `timezone` はワークスペース既定（当面 `Asia/Tokyo`）。`nextRunAt` は UTC で保存し、計算時に timezone を考慮。
- **存在しない日付**: 「毎月31日」等は、その月に無ければ月末にクランプする（要規約化 → 未決事項）。
- ディスパッチャ間隔（例 5分）より細かい時刻精度は保証しない（分単位で十分）。

---

## 11. 段階的実装計画

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| **P0: 投票機能（単体）** | `polls` 系テーブル / `messageType: 'poll'` / `POST /api/polls`・vote / `PollCard` / Realtime集計 | チャットで手動投票を立てて、メンバーが投票し票数がリアルタイム更新される |
| **P1: 投票スキル** | `packages/core` の `createPoll` ユースケース + `PollPort` + AI ツール定義 | エージェントへの `@主務 投票立てて` で投票が立つ（Stage 2 と接続） |
| **P2: 定期ジョブ最小** | Bot 送信者 / `scheduled_jobs`・`scheduled_job_runs` / 保存時コンパイル / ディスパッチャ cron / on-scheduled-job-fire / 設定UI | 登山本部ユースケースが毎月15日に自動投稿される |
| **P3: 拡充** | weekly/daily スケジュール、テスト実行、締切・自動集計サマリ投稿、他アクション種別（リマインド投稿等） | 定期ジョブが汎用の cron 基盤になる |

投票機能を先に独立で作る（P0→P1）ことで、定期ジョブ（P2）は「既存スキルを cron で叩く薄い層」に保てる。

---

## 12. リスクと対策

| リスク | 対策 |
|---|---|
| 二重発火（cron リトライ・多重ディスパッチ） | `scheduled_job_runs` で予定時刻ごとの予約（冪等） |
| メンションの誤爆（同名・改名） | 保存時に userId へ固定。曖昧な名前は保存エラー |
| Bot 送信者 profile の権限（auth 非紐付け） | 10_ai_member_design の未決事項に同じ。RLS 設計を共有して解決 |
| 設定ミスで意図せぬチャンネルに投稿 | 保存時プレビューで確定内容を明示 + テスト実行 + on-off トグル |
| 投票機能の票改ざん・多重投票 | DB の一意制約 + サーバー側検証（UI ガードは補助） |
| LLM コスト | 発火判定は cron 比較で LLM 不使用。コンテンツ生成も決定論優先、必要時のみ gpt-4o-mini |
| 自然言語コンパイルの誤解釈 | 保存時プレビューで人間が必ず確認してから有効化 |

---

## 13. 未決事項

- テスト実行を本番チャンネルに出すか、dry-run プレビューに留めるか
- 「毎月31日」等、存在しない日付のクランプ規約
- 投票の締切到達時に、集計結果のサマリを自動投稿するか（P3 候補）
- 1ワークスペースあたりのジョブ上限・発言頻度上限（10_ai_member_design の規律と整合させる）
- 投票の選択肢に「メンバー」を直接使う種別（`members_of_channel` 等）を初期から入れるか
- ジョブ作成権限を member 以上にするか admin に絞るか（誤爆の影響範囲で判断）
- Bot 送信者 profile の RLS / 認証設計（10_ai_member_design と共通の未決）

---

## 参考

- [`docs/10_ai_member_design.md`](./10_ai_member_design.md) — AIメンバー設計（Stage 2 ツール / Stage 3 心拍＝本書とは別物の heartbeat）
- [`docs/notification-ux-redesign.md`](./notification-ux-redesign.md) — Realtime（Broadcast from Database）方針
- OpenClaw の cron と heartbeat の使い分け（cron=正確・確実・独立 / heartbeat=近似・自発監視）:
  [Cron vs heartbeat · OpenClaw](https://docs.openclaw.ai/automation/cron-vs-heartbeat)
- 調整さんに公式 API が無い件の確認:
  [調整さんお知らせさんを Dify で作ってみた（スクレイピング前提）](https://qiita.com/watanabe-tsubasa/items/e02bfc26ccc898965243) /
  [日程調整 API を提供する TimeRex](https://mixtend.com/news/scheduling-api/)
