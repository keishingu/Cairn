# ハートビート（宣言型の定期アクション）設計書

作成日: 2026-06-25
ステータス: 構想・設計段階（実装未着手）

ユーザーが**自然言語で定義した定期アクション**を、AI エージェントがスケジュールに従って実行する仕組み（ハートビート）の設計。
初期の主ユースケースは「毎月の登山本部（下山連絡の電話当番）決めを、アプリ内投票でチャンネルに投げる」こと。

この文書は [`docs/10_ai_member_design.md`](./10_ai_member_design.md) の **Stage 3「心拍を持つ（半自動）」** を、
*システムが異常を検知して自発的に喋る* 自律巡回とは別軸の、*ユーザーが宣言的に定義する定期投稿* として具体化したもの。

---

## 1. 用語と位置づけ

| 用語 | 意味 |
|---|---|
| **ハートビート (heartbeat)** | 「いつ・どのチャンネルに・何を」を定義した定期アクションの1件。ユーザーが自然言語で作る |
| **ディスパッチャ** | 期日が来たハートビートを拾って発火させる Inngest cron |
| **スキル (skill)** | ハートビートが発火時に呼び出す内部ツール。第一弾は「アプリ内投票を作成する」スキル |
| **投票 (poll)** | 自作のアプリ内投票機能（Slack の投票ライク）。外部サービスには依存しない |

### Stage 3 自律巡回との違い

| | 自律巡回（10_ai_member_design Stage 3） | 本書のハートビート |
|---|---|---|
| 起動条件 | システムが状態を監視し、異常（計画書なし等）を検知したとき | ユーザーが定義したスケジュール（毎月15日 等） |
| 発言するか | LLM が確信度で判断（沈黙がデフォルト） | 期日が来たら必ず実行（宣言的） |
| 設定 | AGENTS.md（組織の人格・規範） | 設定画面の自然言語入力（個別アクション） |
| 主目的 | 抜け漏れの検知・催促 | 定型業務の自動化 |

両者は併存する。本書は後者のみを扱う。

---

## 2. 主ユースケース（登山本部決め）

設定画面のテキスト欄に、ユーザーが次のように書く:

```
毎月15日に、@山田さん @田中さん をメンションして、
来月の登山本部（その週の山行の下山連絡を電話で受け取る担当）を決める投票を
#登山本部 チャンネルに投稿して。選択肢は来月の各週。
```

これを保存すると、毎月15日にエージェントが `#登山本部` で次のような投稿を行う:

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
[設定画面 /settings/heartbeats]
   │  自然言語を入力 → 保存
   ▼
[POST /api/heartbeats]
   │  LLM(gpt-4o-mini)で「保存時コンパイル」
   │   → schedule(構造化) / channelId / mentionUserIds / actionSpec / messageTemplate
   │   → 元の自然言語文も rawInstruction として保持（編集・表示の正）
   ▼
[heartbeats テーブル]  nextRunAt を計算して保存
   ▲                                  │
   │ 編集で再コンパイル                  │  scan due rows
   │                                   ▼
                          [Inngest cron: heartbeat-dispatcher]（例: 5分ごと）
                                       │  nextRunAt <= now の行を拾う
                                       │  各行に heartbeat/fire イベントを送る
                                       ▼
                          [Inngest fn: on-heartbeat-fire]
                                       │ 1. 定義をロード
                                       │ 2. actionSpec を解決（来月の各週 → 選択肢を生成）
                                       │ 3. スキル実行（投票を作成）= poll 行を作成
                                       │ 4. メッセージ本文を合成（メンション + 投票カード参照）
                                       │ 5. AI エージェントとして messages に投稿
                                       │ 6. message/created を送る（既存の通知経路に乗る）
                                       │ 7. nextRunAt を再計算、heartbeat_runs に記録
                                       ▼
                          [#登山本部 に投票付きメッセージが出現]
                                       │ メンバーが投票
                                       ▼
                          [poll_votes]→ DBトリガで realtime.broadcast_changes()
                                       → RealtimeProvider が invalidate → 票数再取得
```

---

## 4. 自然言語をいつ解釈するか

ユーザーから「OpenClaw はどっち？」という問いがあったので、まず事実を整理する。

### OpenClaw の方式 = 発火ごとに LLM 解釈

OpenClaw は cron で**30分ごと（デフォルト）にエージェントを起こし**、`HEARTBEAT.md`（cron 構文ではなく自然言語のタスク表）を読ませ、
**LLM 自身が「今、期日が来たタスクはあるか」を毎回判断**する。やる事があれば実行し、無ければ `HEARTBEAT_OK` を返して握り潰す。
これにより「反応型チャットボット」を「自律的に動くエージェント」に変える、というのが OpenClaw の中核パターン。
（参考: [How OpenClaw Works](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) /
[OpenClaw Heartbeat Guide](https://claw.mobile/blog/openclaw-heartbeat-guide)）

### Cairn での採用方針 = ハイブリッド（保存時コンパイル + 発火時コンテンツ生成）

OpenClaw の「毎回 LLM 解釈」は**個人の常駐アシスタント**には合うが、Cairn の文脈ではそのまま採らない:

- **コスト**: 10_ai_member_design でも「巡回 × ワークスペース数」の LLM コストがリスクとして挙がっている。
  数千ワークスペース × 5分間隔で毎回 LLM を回すのは非現実的。
- **非決定性**: 「毎月15日に投票」のような定型業務で、発火のたびに LLM が時刻判定すると、解釈ブレで実行漏れ・重複が起きうる。
- **プレビュー不能**: 保存時に構造が決まらないと、設定画面で「次回 7/15 09:00 に実行」と確定表示できない。

そこで次のように役割を分ける:

| フェーズ | 担当 | LLM | 内容 |
|---|---|---|---|
| **保存時コンパイル** | 設定保存・編集 | gpt-4o-mini を1回 | 自然言語 → `schedule`（構造化）/ `channelId` / `mentionUserIds` / `actionSpec`。曖昧さ（名前重複・チャンネル不在）はここで検出してエラー表示 |
| **発火判定** | ディスパッチャ cron | **使わない** | `nextRunAt <= now` の単純比較。決定論的・安価 |
| **発火時コンテンツ生成** | on-heartbeat-fire | 必要時のみ gpt-4o(-mini) | 動的な本文・選択肢の生成（例「来月の各週」→ 実際の日付）。決定論で出せる部分は LLM を使わない |

**自然言語は捨てない**: `rawInstruction` を正として保持し、設定画面ではユーザーが書いた文をそのまま見せて編集させる（OpenClaw の「自然言語が設定の正」という良さは維持）。編集のたびに再コンパイルし、`schedule` 等を更新する。

> 要するに「**設定の表現は自然言語、実行の表現は構造化**」。OpenClaw の UX を借りつつ、発火は cron 比較に落として安く・確実にする。

---

## 5. データモデル

### 5.1 ハートビート定義

```ts
// packages/db/src/schema/heartbeats.ts（新規）
heartbeats {
  id            uuid pk
  workspaceId   uuid → workspaces (cascade)
  agentId       uuid → ai_agents          // どのエージェントとして投稿するか
  channelId     uuid → channels           // 投稿先（コンパイルで解決済み）
  createdBy     uuid → profiles
  rawInstruction text                      // ユーザーが書いた自然言語（編集・表示の正）
  schedule      jsonb                      // 構造化スケジュール（後述）
  mentionUserIds uuid[]                    // 解決済みメンション対象
  actionSpec    jsonb                      // 実行アクション定義（後述）
  timezone      text  default 'Asia/Tokyo'
  enabled       boolean default true
  nextRunAt     timestamptz                // 次回発火予定（ディスパッチャが参照）
  lastRunAt     timestamptz
  createdAt / updatedAt
}
```

`schedule`（jsonb）の例:
```jsonc
{ "freq": "monthly", "byMonthday": 15, "atHour": 9, "atMinute": 0 }
// 将来: weekly / daily / "everyNthWeekday" 等に拡張。内部表現は RRULE 互換を意識する
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
heartbeat_runs {
  id            uuid pk
  heartbeatId   uuid → heartbeats (cascade)
  firedAt       timestamptz
  status        text   // 'success' | 'failed' | 'skipped'
  resultMessageId uuid → messages   // 投稿したメッセージ（あれば）
  error         text
}
```
- ディスパッチャは**冪等性**のため、`heartbeat_runs` に「この予定時刻の run が既にあるか」を見て二重発火を防ぐ（Inngest のリトライで同じ予定が複数回流れても1回だけ実行）。

### 5.3 投票（アプリ内ポール）

```ts
polls {
  id            uuid pk
  workspaceId   uuid → workspaces (cascade)
  channelId     uuid → channels
  messageId     uuid → messages     // 投票カードを描画するメッセージ
  createdBy     uuid → profiles      // エージェント or 人間
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
  id        uuid pk
  pollId    uuid → polls (cascade)
  optionId  uuid → poll_options (cascade)
  userId    uuid → profiles
  createdAt
  // unique(pollId, optionId, userId) で二重投票防止。
  // 単一選択(allowMultiple=false)は (pollId, userId) でも一意にする
}
```

---

## 6. 投票（アプリ内ポール）機能の設計

ハートビートとは独立に**単体で使える機能**として作る（手動でも投票を立てられる）。ハートビートはその作成 API を呼ぶだけ。

- **メッセージ種別**: `messages.messageType` に `'poll'` を追加（既存は `'text' | 'html' | 'system'`）。
  投票カードは `pollId` を `messages.metadata` に持たせ、クライアントが poll を取得して描画する。
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
10_ai_member_design Stage 2 の「ツール呼び出しで `packages/core` のユースケースを実行」という枠に乗せる。

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
  Stage 2 の「@主務 投票立てて」にもそのまま使える。ハートビートは LLM を介さず同じユースケースを直接呼ぶ。

→ **結論: 「投票作成スキル（ユースケース + ポート + 任意で AI ツール定義）」を先に作るのが土台**。
ハートビートはそれを定期的に叩く薄い層なので、スキル → ハートビートの順で実装する。

---

## 8. 発火フロー（on-heartbeat-fire）詳細

Inngest 関数。各 `step.run` で冪等に分割する（既存 `functions.ts` の流儀に合わせる）。

1. **load**: `heartbeatId` から定義・エージェント・チャンネルをロード。`enabled=false` なら skip。
2. **dedupe**: この予定時刻の `heartbeat_runs` が success で存在すれば skip（二重発火防止）。
3. **resolve-action**: `actionSpec.options.kind` を実値へ展開。
   - `weeks_of_next_month` → 来月の各週の開始日を timezone 基準で算出（決定論。LLM 不要）。
   - 本文に `{{nextMonth}}` 等のテンプレ変数があれば置換。自由文生成が要る場合のみ gpt-4o-mini。
4. **create-poll**: `PollPort.createPoll(...)` を実行 → `pollId` / `messageId` を得る。
   - 本文には先頭にメンション（`mentionUserIds` を canonical `<@userId>` 形式で埋め込む。`lib/chat/mentions.ts` 準拠）を付ける。
5. **notify**: `message/created` イベントを送る → 既存の `on-message-created` がメンション通知・Push を処理。
6. **bookkeeping**: `lastRunAt` 更新、`schedule` から次の `nextRunAt` を再計算、`heartbeat_runs` に success 記録。
7. **失敗時**: `heartbeat_runs` に failed + error を残し、**作成者へアプリ内通知でエラーを知らせる**
   （CLAUDE.md「サイレントに fallback せずエラーを見せる」に準拠。投稿先に半端なメッセージは残さない）。

メンション解決の注意: NL の「@山田さん」→ userId 解決は**保存時**に行い `mentionUserIds` に固定する。
発火時に名前で再解決しない（改名・同名で誤爆するため）。保存時に一意に解決できない名前はエラーにする。

---

## 9. 設定 UI（/settings/heartbeats）

CLAUDE.md「設定セクションは URL 駆動」に従い、`/settings/heartbeats` セクションを追加する
（`SETTINGS_NAV_GROUPS` に項目追加 + `SettingsSectionContent` に本体を実装。PC/モバイル共有）。

- **一覧**: 登録済みハートビート（rawInstruction の要約 / 次回実行 / on-off トグル / 直近の実行結果）。
- **作成・編集**: 大きめのテキスト入力欄（自然言語）+ 保存。保存時にコンパイルして**確定内容のプレビュー**を返す:
  > 次回 **2026-07-15 09:00 (JST)** に **#登山本部** で **@山田 @田中** をメンションし、
  > 「来月の各週」を選択肢にした投票を投稿します。
- **コンパイル失敗時**: 「`@佐藤` に一致するメンバーが2人います」「`#登山本部` というチャンネルが見つかりません」等、
  具体的に何が解決できなかったかを表示して保存を止める。
- **テスト実行ボタン**: その場で1回発火（投稿先を本番チャンネルにするか dry-run プレビューにするかは要検討 → 未決事項）。
- **権限**: ハートビートは指定チャンネルに**エージェントとして投稿**するため、作成はそのチャンネルのメンバーである member 以上に限定。
  エージェントが対象チャンネルのメンバーであることも必須（未参加なら作成時にエラー）。

---

## 10. スケジュールとタイムゾーン

- `schedule` は構造化（freq / byMonthday / atHour 等）。内部的に RRULE 互換を意識し、将来 weekly/daily に拡張可能にする。
- `timezone` はワークスペース既定（当面 `Asia/Tokyo`）。`nextRunAt` は UTC で保存し、計算時に timezone を考慮。
- **存在しない日付**: 「毎月31日」等は、その月に無ければ月末にクランプする（要規約化 → 未決事項）。
- ディスパッチャ間隔（例 5分）より細かい時刻精度は保証しない（分単位で十分）。

---

## 11. 段階的実装計画

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| **P0: 投票機能（単体）** | `polls` 系テーブル / `messageType: 'poll'` / `POST /api/polls`・vote / `PollCard` / Realtime集計 | チャットで手動投票を立てて、メンバーが投票し票数がリアルタイム更新される |
| **P1: 投票スキル** | `packages/core` の `createPoll` ユースケース + `PollPort` + AI ツール定義 | エージェントへの `@主務 投票立てて` で投票が立つ（Stage 2 と接続） |
| **P2: ハートビート最小** | `heartbeats`/`heartbeat_runs` / 保存時コンパイル / ディスパッチャ cron / on-heartbeat-fire / 設定UI | 登山本部ユースケースが毎月15日に自動投稿される |
| **P3: 拡充** | weekly/daily スケジュール、テスト実行、締切・自動集計サマリ投稿、他アクション種別（リマインド投稿等） | ハートビートが汎用の定期アクション基盤になる |

投票機能を先に独立で作る（P0→P1）ことで、ハートビート（P2）は「既存スキルを cron で叩く薄い層」に保てる。

---

## 12. リスクと対策

| リスク | 対策 |
|---|---|
| 二重発火（cron リトライ・多重ディスパッチ） | `heartbeat_runs` で予定時刻ごとの冪等チェック |
| メンションの誤爆（同名・改名） | 保存時に userId へ固定。曖昧な名前は保存エラー |
| エージェント profile の権限（auth 非紐付け） | 10_ai_member_design の未決事項に同じ。RLS 設計を共有して解決 |
| 設定ミスで意図せぬチャンネルに投稿 | 保存時プレビューで確定内容を明示 + テスト実行 + on-off トグル |
| 投票機能の票改ざん・多重投票 | DB の一意制約 + サーバー側検証（UI ガードは補助） |
| LLM コスト | 発火判定は cron 比較で LLM 不使用。コンテンツ生成も決定論優先、必要時のみ gpt-4o-mini |
| 自然言語コンパイルの誤解釈 | 保存時プレビューで人間が必ず確認してから有効化（沈黙の自動実行をいきなり許さない） |

---

## 13. 未決事項

- テスト実行を本番チャンネルに出すか、dry-run プレビューに留めるか
- 「毎月31日」等、存在しない日付のクランプ規約
- 投票の締切到達時に、集計結果のサマリを自動投稿するか（P3 候補）
- 1ワークスペースあたりのハートビート上限・発言頻度上限（10_ai_member_design の規律と整合させる）
- 投票の選択肢に「メンバー」を直接使う種別（`members_of_channel` 等）を初期から入れるか
- ハートビート作成権限を member 以上にするか admin に絞るか（誤爆の影響範囲で判断）
- エージェント profile の RLS / 認証設計（10_ai_member_design と共通の未決）

---

## 参考

- [`docs/10_ai_member_design.md`](./10_ai_member_design.md) — AIメンバー設計（Stage 2 ツール / Stage 3 心拍）
- [`docs/notification-ux-redesign.md`](./notification-ux-redesign.md) — Realtime（Broadcast from Database）方針
- OpenClaw のハートビート設計（自然言語スケジュール / 発火ごと LLM 解釈）:
  [How OpenClaw Works](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) /
  [OpenClaw Heartbeat Guide](https://claw.mobile/blog/openclaw-heartbeat-guide)
- 調整さんに公式 API が無い件の確認:
  [調整さんお知らせさんを Dify で作ってみた（スクレイピング前提）](https://qiita.com/watanabe-tsubasa/items/e02bfc26ccc898965243) /
  [日程調整 API を提供する TimeRex](https://mixtend.com/news/scheduling-api/)
