# AI常駐PMO設計書 — プライベートナッジによるプロジェクト推進支援

作成日: 2026-07-17
最終更新: 2026-09-24
ステータス: 現行仕様（Phase 1/2 実装済み・段階ロールアウト中。Phase 3/4 は未実装）

AI時代の「プロジェクト推進ツール」の中核仮説 —— **AIが善いPMOのように常駐し、裏方としてプロジェクトを前に進める** —— の要求と設計。最低線は **don't be evil**: このAIは監視・査定・炙り出しの道具には決してならず、常に本人の側に立つ（§2.3 がその具体化）。

- 戦略上の位置づけ（「逆転② 視線」）: [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md)
- 3つのAIサーフェス（`/ai` ワークベンチ・AI PMO・AIメンバー）の境界: [`10_ai_member_design.md`](./10_ai_member_design.md)。本書は**本人だけに見える受動的なプライベートナッジ**を担当する

## 0. 実装状況

| 領域 | 状況 | 現行仕様 |
|---|---|---|
| Phase 1 タスクナッジ | 実装済み | 毎日 09:00 JST。期限接近・期限超過・7日以上の停滞を決定論的に検知 |
| Phase 2 メッセージ巡回 | 実装済み | 02:00 / 08:00 / 14:00 / 20:00 JST。DM以外の新着差分をJevで分類・精査し、必要な通知だけ作成 |
| 発話ゲート | 実装済み | 重複・クールダウン・静寂時間・日次上限（製品要件との差分は §6.3） |
| 配信・フィードバック | 実装済み | チャット合成、ベル通知、「あとで」「これは問題ない」、タスク完了ショートカット |
| 設定 | 実装済み | 個人キルスイッチ（`profiles.ai_nudges_enabled`）、workspace owner 向け Phase 1/2 スイッチ（`workspaces.ai_nudges_phase_one_enabled` デフォルトON / `_phase_two_enabled` デフォルトOFF） |
| ロールアウト | 制御中 | `FEATURE_FLAGS.aiPmo` とワークスペース設定の両方が有効な場合だけ動作 |
| 課金 | 実装済み | ナッジ配信ごとにケルンのクレジットを消費（[`billing-implementation-design.md`](./billing-implementation-design.md)） |

主な実装箇所: `apps/web/src/lib/ai-nudges/`、`apps/web/src/lib/inngest/functions.ts`、`apps/web/src/app/api/ai/nudges/`、`packages/db/src/schema/ai.ts`、Jev クライアント `apps/web/src/lib/ai/jev.ts`

## 1. コンセプト

AIが定期的にワークスペースを巡回（ハートビート）して停滞・リスクの兆候を検知し、**関係する本人にだけ**チャット欄の文脈の中でそっと知らせる（例:「タスク『装備リスト確定』の期限が明後日ですが、まだ着手されていないようです」）。

- **プライベートが第一形態である理由**: この種の機能の最大の失敗要因は検知精度ではなく**リマインドが公開処刑になること**。名指しすればツールは監視装置として嫌われ、チャットに本音が書かれなくなる（検知の材料自体が消える）。よって宛先本人にのみ表示し「**このメッセージはあなただけに見えています**」を常に明示する。チーム向けの公開発言は信頼獲得後（Phase 4）
- **成否を分けるのは「言わない判断」**: 的外れな指摘を2〜3回されたユーザーはミュートし、機能は形骸化する。検知と同等以上に、誤指摘率と鬱陶しさの制御（重複抑止・クールダウン・頻度上限・フィードバック）を一級の設計対象とする

## 2. 要求

### 2.1 機能要求

| # | 要求 | 備考 |
|---|---|---|
| F-1 | 期限が近い / 過ぎているのに未完了のタスクを担当者本人に知らせる | Phase 1 |
| F-2 | 進行中のまま長期間更新がないタスクを担当者本人に知らせる | Phase 1 |
| F-3 | チャットの潜在リスク（結論が出ずに流れた議論・認識齟齬・未回答の依頼）を関係者本人に知らせる | Phase 2 |
| F-4 | **宛先復元ナッジ**: 宛先不明のまま未回答の質問・依頼を、最も答えられそうな一人にだけ知らせる | Phase 2（§5.2） |
| F-5 | チャット欄に「あなただけに見えています」付きで合成表示し、対象へ1タップで遷移できる | §8.1 |
| F-6 | 「あとで」「これは問題ない」のフィードバックを返せ、同一事象を繰り返し指摘しない | §6 |
| F-7 | 発火根拠（どの検知器が何を根拠に）を記録する | `reason` / `audit_logs` |
| F-8 | 過去の経緯を添えた文脈付きナッジ | Phase 3 |
| F-9 | **個人キルスイッチ**: 本人がナッジを一括オフにできる | §8.3 |

### 2.2 非機能要求

| # | 要求 | 備考 |
|---|---|---|
| N-1 | **沈黙がデフォルト**。確信が持てない場合は発言しない | [`10_ai_member_design.md`](./10_ai_member_design.md) §6 の原則 |
| N-2 | 頻度上限: 1ユーザー1日3件 | §6.3 |
| N-3 | AIの閲覧範囲は既存の権限モデルに完全準拠し、DMは巡回しない | §7 |
| N-4 | モデルコストは差分巡回 + Jev判定 + 必要時だけの gpt-5-mini 文面生成で抑える | §5.2 |

### 2.3 やらないこと（設計上の禁止事項）

- **公開の場での催促・名指し**。ナッジは本人以外に一切表示しない
- **管理者・リーダー向けの「遅れている人一覧」**。ナッジの存在・内容・既読状態を本人以外（owner / admin を含む）に見せる機能・集計・レポートは作らない。「炙り出しに使えない」ことがこの機能の信頼の根拠であり、要望があっても原則拒否する
- **自動エスカレーション**。無視され続けてもリーダーへ報告しない（本人に「チームに共有しましょうか?」と提案するに留める）
- **DM の監視・巡回**
- **ナッジからの状態変更の自動実行**。タスク操作は本人の明示的なアクションを経る

## 3. 全体アーキテクチャ

```
Inngest cron（ハートビート）
  ├─ Phase 1: ルール検知（SQL） tasks.dueDate × status × assigneeId → 候補
  └─ Phase 2: LLM 巡回（前回スキャン以降の新着があるチャンネルのみ）
       Jevで分類・発話可否・宛先選定 → llm_risk の文面だけ gpt-5-mini で生成
  ▼
発話ゲート: 重複抑止 → クールダウン → 頻度上限 → 静寂時間帯 → クレジット消費
  ▼
ai_nudges を INSERT / UPDATE（+ ベル通知）
  │  DB トリガー + realtime.broadcast_changes()
  ▼
本人のクライアントだけが invalidate → REST 再取得 → チャット欄にカードを合成表示
  └─ フィードバック（あとで / 問題ない）→ 抑止へ還流
```

## 4. データモデル（`packages/db/src/schema/ai.ts`）

### 4.1 `ai_nudges`

ナッジは**通常の `messages` 行にしない**。messages はチャンネル全員への配信・未読・既読が前提で、「本人だけに見える」を載せると全経路に分岐が入るため。宛先ユーザーを持つ独立テーブルとし、チャットUI側でタイムラインに合成する。

```
ai_nudges
  id            uuid PK
  workspace_id  uuid NOT NULL → workspaces
  user_id       uuid NOT NULL → profiles        -- 宛先。本人のみ閲覧可
  channel_id    uuid → channels    ON DELETE SET NULL  -- 表示先チャンネル
  project_id    uuid → projects    ON DELETE SET NULL
  task_id       uuid → tasks       ON DELETE SET NULL  -- 対象タスク（ルール検知）
  message_id    uuid → messages    ON DELETE SET NULL  -- 根拠メッセージ（LLM検知）
  detector      text NOT NULL      -- task_due_soon | task_overdue | task_stalled | unanswered_ask | llm_risk
  dedupe_key    text NOT NULL      -- §6.1
  title / body  text NOT NULL
  reason        jsonb NOT NULL DEFAULT '{}'     -- 検知器の入力スナップショット（F-7）
  status        text NOT NULL DEFAULT 'active'  -- active | dismissed | resolved | suppressed
  feedback      text               -- later | not_helpful | null
  remind_after  timestamptz        -- この時刻まで再 active 化しない
  created_at / responded_at

  UNIQUE (user_id, dedupe_key)
```

- 行は「イベント」ではなく**その関心事の現在状態**。ハートビートは既存行の `status` をリコンサイルする（§6.1）
- `resolved` は対象の解消（タスク完了・期限変更）をハートビートが検知して立てる。操作なしで消えるナッジが「AIがちゃんと見ている」体験になる
- 参照 FK は全て `ON DELETE SET NULL`。既定の `NO ACTION` だとナッジが紐づくタスク・チャンネル等を削除できなくなるため

### 4.2 `ai_scan_states`（Phase 2）

LLM巡回の差分カーソル。チャンネルごとに「どこまで読んだか」を持ち、新着があるチャンネルだけを巡回する。

```
ai_scan_states
  channel_id                      uuid PK → channels ON DELETE CASCADE
  last_scanned_message_id         uuid → messages ON DELETE SET NULL
  last_scanned_at                 timestamptz NOT NULL
  next_unanswered_ask_check_at    timestamptz   -- 24時間未満だった依頼の再評価予約
  next_unanswered_ask_message_id  uuid → messages ON DELETE SET NULL
```

- `channel_id` は `CASCADE`（巡回済みチャンネル・その親プロジェクトを削除不能にしないため）
- `next_unanswered_ask_*` は、24時間未満だった依頼をチャンネルに新着がなくても成熟後に再評価するための予約。`unanswered_ask` の最低経過時間と差分カーソルを両立させる

### 4.3 `document_chunks` の拡張（Phase 3・未実装）

`sourceType: 'message'` を追加し、チャットを「同一チャンネル・近接時間帯のまとまり」でチャンク化する（短文が多くベクトルが痩せるため）。巡回には使わず、文脈付与（F-8）で使う。

**アクセス制御上の必須事項**: 現行の `searchChunks` は `workspaceId` 単位でしか絞れず、guest フィルタも `project` / `file` チャンクしか知らない。`message` チャンクには `metadata.channelId` を持たせ、プライベートチャンネル・guest 制限を適用するよう拡張する。怠ると `/api/ai/conversations` の RAG 経由で非参加チャンネルの発言が漏れる。

## 5. 検知設計

### 5.1 Phase 1 — ルールベース検知（`lib/ai-nudges/rules.ts`）

構造化データだけで判定でき誤指摘がほぼゼロのため、ここで配信基盤・発話ゲート・介入の作法を確立する。

| detector | 条件 | dedupe_key |
|---|---|---|
| `task_due_soon` | `today <= dueDate <= today + 3日` かつ `status = 'todo'` | `task_due_soon:{taskId}:{dueDate}` |
| `task_overdue` | `dueDate < today` かつ `status != 'done'` | `task_overdue:{taskId}:{dueDate}` |
| `task_stalled` | `status = 'in_progress'` かつ `updatedAt < now - 7日` | `task_stalled:{taskId}:{実行日のISO週}` |

- 宛先は担当者。`assigneeId IS NOT NULL` を必須とする（`user_id` NOT NULL のため未アサインは対象外）
- `task_due_soon` は `dueDate >= today` で `task_overdue` と排他にする（同一タスクで2件消費しないため）
- `dueDate` を key に含めるため、期限変更で再度ナッジできる。`task_stalled` の週は `updatedAt` ではなく**ハートビート実行日**から算出する（放置タスクでも翌週に再送できるように）
- 表示先は対象タスクのプロジェクトチャンネル。閾値（3日・7日）は現状コード定数

### 5.2 Phase 2 — LLM巡回（`lib/ai-nudges/llm-nudge-scan.ts` / `llm-nudge-delivery.ts`）

**チャットのベクトル化は巡回に使わない。** 新着差分を時系列のまま読ませる方が確実で安い。

1. `ai_scan_states` から新着のあるチャンネル（DM除く）を列挙
2. 新着 + 直前の文脈を **Jev (`typesafe-ai/jev`)** の一次判定に渡し、対象メッセージごとに「結論が出ずに流れた議論 / 未回答の依頼・質問 / 認識齟齬・スコープ膨張」を分類（選択確率 0.7 未満は捨てる）
3. 候補だけを二次判定で精査: 未解決 / 回答済み / 期限切れ / 判断材料不足、発話価値、宛先1人、宛先を裏付ける会話根拠。対象後の通常投稿も回答・引受け・完了として読み、宛先か根拠がなければ発話しない
   - `unanswered_ask`: 固定文面（生成モデルを呼ばない）
   - `llm_risk`: 通知文だけ gpt-5-mini で生成
4. 発話ゲート（§6）を通過したものだけ `ai_nudges` に書く

補足仕様:

- 表示中の `unanswered_ask` は、LLM再評価ではなく直接返信の有無だけで解消する
- 静寂時間帯で配信を待機した候補は、配信直前に評価時刻より後の投稿・返信があれば破棄して次回巡回へ委ねる
- Jev のコンテキスト上限（32K）に収めるため、本文・会話・宛先候補（最大30人）を切り詰める。上限値はコード定数（`llm-nudge-scan.ts`）が正
- Evaluation API は Vercel AI Gateway 経由で ZDR 有効・`typesafe-ai` 限定で呼ぶ
- 各Jev呼び出しは `audit_logs` にメッセージ単位で記録する（本文は保存せず、選択結果・全確率・所要時間・トークン数等）。記録失敗で外部APIを再実行すると二重課金になるため best-effort（`jev-audit.ts`）
- 実モデルの校正は `jev-shadow-eval.test.ts` の shadow 比較で行う（既定は dry-run。有料APIを呼ぶため実行は明示的に）

#### 宛先復元ナッジ（detector: `unanswered_ask`）

チャットの沈黙は速度ではなく**責任の拡散**の問題であり、効くのはペースではなく**宛先の特定**（背景は [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) の「沈黙の設計」）。宛先が曖昧なまま24時間以上未回答の質問・依頼について、**最も答えられそうな一人**にだけ知らせる:

> この質問、あなたが一番答えられそうです（このメッセージはあなただけに見えています）

- 宛先の推定材料: 関連タスクの担当者、メンション、直近発言、メンバーのスキル・経験（`document_chunks` の `sourceType: 'member'`）
- 特定できなければ発話しない。**候補者全員への一斉送信は絶対にしない**（責任の拡散をAIが再生産するだけ）
- dedupe_key: `unanswered_ask:{messageId}`
- 「全員が読んで熟考している沈黙」は触らない。対象は回答がないと進行がブロックされる問いに限る。頻度上限が**注意の予算**として働く

### 5.3 Phase 3 — メッセージ埋め込みによる文脈付与（未実装）

ナッジ生成時に関連する過去の議論をベクトル検索し文面に添える（例:「この論点は 6/28 の議論で『A案で進める』と一度決まっています」）。`/api/ai/conversations` の検索コンテキストにも流用できる。アクセス制御は §4.3。

## 6. 発話ゲート（言わない判断）

### 6.1 重複抑止（状態リコンサイル方式）

`(user_id, dedupe_key)` ごとの現在状態として、ハートビートが毎回条件を再評価する（`lib/ai-nudges/reconcile.ts`）。

| 現在の行 | 条件が継続 | 条件が解消 |
|---|---|---|
| 行なし | 横断クールダウンチェック（下記）を経て `active` で INSERT | 何もしない |
| `active` | そのまま（再通知しない） | `resolved` |
| `dismissed` / `suppressed` かつ `remind_after` 到来 | `active` に戻す（新規配信扱いで日次上限を消費） | `resolved` |
| `dismissed` / `suppressed` かつ `remind_after` 未到来 | 抑止継続 | そのまま |
| `resolved` | そのキーは終了（新しい期限・停滞週は別 key の別行） | — |

**横断クールダウンチェック**: `task_stalled` の key は週ごとに回転するため、行単位の `remind_after` だけでは `not_helpful` の30日抑止をすり抜ける。新規 INSERT 前に同一 `(user_id, detector, 対象)` で `suppressed` かつ `remind_after > now()` の行があればスキップする（対象はタスク系は `task_id`、メッセージ系は `message_id`）。

### 6.2 フィードバック

- 「あとで」（`later`）: `dismissed` + `remind_after = now + 2日`
- 「これは問題ない」（`not_helpful`）: `suppressed` + `remind_after = now + 30日`
- フィードバックは抑止にのみ使い、本人以外への表示・集計には使わない（§2.3）。not_helpful の蓄積による個人別の閾値調整は未実装

### 6.3 頻度上限・静寂時間帯

- 製品要件は**全detector共通で1ユーザー1日3件**、超過分は破棄（翌日に持ち越すと古い指摘が溜まるため）。優先順位はルール検知 > LLM検知
- **現実装との差分**: 上限は Phase 1（`AI_NUDGE_DAILY_LIMIT`）と Phase 2（`PHASE_TWO_DAILY_LIMIT`）で別々に3件ずつ数えるため、両方有効な日は最大6件になり、横断優先順位も効かない。Phase 2 をデフォルトONにする前に統合を決める
- 静寂時間帯（22:00–08:00 JST）は配信しない。Phase 1 は朝に実行して回避し、Phase 2 は配信を翌朝へ遅延する

## 7. 権限・プライバシー

- **閲覧範囲は権限モデルに従う**。巡回はサービスロールで行うが、生成時に宛先ユーザーが対象にアクセスできることを `requireChannelAccess` / `requireProjectAccess` 相当で検証する
- **DM は巡回しない**。私的な会話をAIが読むという感覚は公開チャンネルとは受け止められ方が質的に異なるため
- **非活性メンバーには送らない**（宛先解決は `active_workspace_members` 経由）。ゲストは参加プロジェクトの対象だけ受け取る。読み取りは本人のみで owner / admin にも例外を作らない
- **生成時の検証だけでは不十分**（その後に非活性化・プロジェクト除外・プライベートチャンネル削除があり得る）。一覧API（`GET /api/ai/nudges`）は `requireChannelAccess` で現在のアクセスを再評価し、キルスイッチ・workspace の Phase スイッチも読み取り時に反映する

## 8. 配信・UI

### 8.1 チャット欄への合成表示

- 該当チャンネルのタイムラインに、通常メッセージと区別したカードで表示する: AIアイコン + 「このメッセージはあなただけに見えています」、本文 + 対象へのリンク、「あとで」「これは問題ない」（タスク系は「完了にする」も）
- 位置は配信時点の最新位置。チャンネルに紐づかないナッジはベル通知のみ

### 8.2 Realtime・通知

- `ai_nudges` の **INSERT・UPDATE 双方**を DB トリガーで本人の user topic へ broadcast し、`RealtimeProvider` が `['ai-nudges']` を invalidate する。UPDATE も配信するのは `resolved` / `suppressed` への遷移を開いたままの画面に反映するため
- ベル通知は `notification_type = 'ai'`、`notifications.data.nudgeId` でナッジに紐づける
- **ベル通知はナッジと同じライフサイクル**: `ai_nudges.status` が `dismissed` / `resolved` / `suppressed` に遷移したら DB トリガー（`delete_hidden_ai_nudge_notification`）が対応する通知行を削除する。通知一覧APIは本文をそのまま返すため、ナッジ側だけ失効させるとベルが迂回路になるのを防ぐ。キルスイッチ・アクセス失効もこの同じ遷移で処理する（別の削除ロジックを持たない）。加えて通知一覧・バッジは workspace の Phase スイッチで AI 通知を絞り込む
- **Push は送らない**（「開いたときにそっと目に入る」強度が適切。割り込む価値の確証を得てから解放する）

### 8.3 個人キルスイッチ

「うるさくない・監視しない」がテーゼである以上、**本人が自分で止められない状態で出荷しない**。

- `profiles.ai_nudges_enabled`（デフォルト true）。設定の通知セクションのトグル（`settings.tsx`）から `PATCH /api/me` で更新
- ハートビートは生成・配信の前にこのフラグを見る（UI で隠すだけにしない）
- OFF は同一トランザクションで即時遡及: `active` → `suppressed`（`remind_after = NULL`）、`dismissed` → `suppressed`（「あとで」の期限は保持）。§8.2 のトリガーでベルからも消える
- 再 ON 後、条件が継続していればハートビートが同じ行を `active` に戻す。`not_helpful` の30日抑止は早期解除しない
- 粒度は「全部 ON / 全部 OFF」の1段のみ（detector 別・頻度・静寂時間の個人設定はない）

## 9. フェーズ

| Phase | 状況 | 内容 |
|---|---|---|
| 1 | 実装済み | ルール検知3種 + ハートビート + チャット合成 + フィードバック + 個人キルスイッチ。LLM なしで介入の作法を安く確立するため先行 |
| 2 | 実装済み・デフォルトOFF | 差分スキャン + Jev判定 + 必要時の文面生成。限定ワークスペースで誤指摘率・クレジット原価・宛先精度を評価して開放範囲を広げる |
| 3 | 未実装 | メッセージ埋め込み + 文脈付きナッジ（権限安全な過去議論の参照） |
| 4 | 未実装 | 本人の明示承認を経た公開再浮上。第一候補は「結論が出ないまま流れた議論の要約」。承認・監査・取消条件の定義が前提 |

## 10. 未決事項

- Phase 2 をデフォルトONへ移す品質基準（誤指摘率、有用性、1ワークスペースあたり原価）
- 日次上限の全detector共通化（§6.3）
- ナッジ文面のトーンを将来のAI人格定義へ接続するか（現状 Phase 1 は固定文面、Phase 2 はPMO専用プロンプト）
- 個人設定の粒度拡張（頻度・静寂時間帯・detector 別・プロジェクト単位）の時期
- タイムライン合成の位置仕様（未応答ナッジのピン表示・古いナッジの折りたたみ）
- `task_stalled` にチャットでの言及を加味するか（Phase 2 判定との統合）
- プロジェクト全体のリスクをリーダーに知らせるか（「本人以外に見せない」原則との整理。リーダー自身が行動主体、という整理は可能）
- 閾値（3日・7日）のワークスペース設定化
- モバイル（Expo ネイティブチャット）での合成表示の実装時期

## 11. `/ai` 調査ワークベンチとの境界

`/ai` は利用者が明示的に依頼する横断調査、AI PMO は定期巡回で高確信度の少数シグナルだけを本人へ届ける。判定ルールや権限考慮済みの問い合わせ処理は共有できるが、PMOの配信状態は共有しない: `/ai` はナッジの作成・解決・再活性化をせず、`ai_scan_states` を進めず、日次上限にも算入しない。ナッジの「詳しく調べる」は対象IDと根拠を `/ai` へ渡すだけで、調査結果のチャンネル共有は本人の明示操作を必須にする。詳細は [`10_ai_member_design.md`](./10_ai_member_design.md) §1.3 / §2.4。
