# AIオートメーション設計書 — Skill / cron / heartbeat

作成日: 2026-10-27
ステータス: 構想・設計段階（未実装）。§2 の決定事項は 2026-10-27 に合意済み

利用者（admin 以上）が**自然言語の指示文**で AI の動きを定義し、手動呼び出し（Skill）・定刻（cron）・巡回（heartbeat）で実行させる仕組み。AI PMO のナッジは「Cairn が組み込みで持つ cron / heartbeat」と位置づけ直し、最初から同じ実行基盤に載せる。

- 3つの AI サーフェスの境界: [`10_ai_member_design.md`](./10_ai_member_design.md)
- 組み込みの cron / heartbeat（AI PMO）: [`ai-pmo-design.md`](./ai-pmo-design.md)
- 定刻実行と冪等性の元設計: [`scheduled-jobs-design.md`](./scheduled-jobs-design.md)（本書の cron が置き換える。§9）
- Bot 送信者・カード型メッセージ: [`app-platform-design.md`](./app-platform-design.md)
- 外部エージェント向けの読み取り口: [`mcp-server-design.md`](./mcp-server-design.md)

## 1. 背景と想定ユースケース

山岳部での事故を受け、部内の審査を「経験ベース」で行う体制づくりが進んでいる。現状の課題は、振り返り資料がプロジェクトごとに散らばり、メンバーの経歴を一元的に把握できないこと。`/ai` へ毎回質問する方法では、質問した範囲しか答えないため網羅的に把握できず、全資料を手で入力することもできない。

求められていること:

1. **資料の収集**: 定期的に実行し、AI 自身が該当資料を見つける
2. **分析**: 振り返り資料に書かれた経験が、審査の各項目に当てはまるか判定する
3. **管理**: メンバーごとに一覧できる形でまとめる

具体的な指示の例:

| 種類 | 指示文の例 |
|---|---|
| cron | 毎日10時に #審議 チャットを確認し、計画を提出した人の経歴を過去のプロジェクトと添付ファイルから調べ、計画を遂行できる人物か判断して @審査担当 に報告する |
| heartbeat | このチャンネルの会話を確認し、プロジェクトが遅れそうな兆候を見つけたら、プロジェクトリーダーに非公開で知らせる |
| Skill（`$assign-reviewer`） | このプロジェクトに添付された計画書を読み、「コーチ」属性のユーザーのうち、過去に似た計画で「レビュワー」としてアサインされた人をプロジェクトに招待して「レビュワー」の役割を付ける。その後、招待した人に「レビュワーとしてアサインさせていただきました。ご確認お願いします！」とメンションする |

## 2. 決定事項

### 2.1 一つのモデルで表す

**オートメーション = 指示文 + 起動条件 + 読み取り範囲 + ツール + 結果の送り先**

| 起動条件 | いつ動くか | 発言 |
|---|---|---|
| **Skill** | 利用者が `$名前` で呼ぶ（`/ai`。後続で `/chat`） | 呼んだ場で結果を返す |
| **cron** | 定刻に**必ず**1回動く | 実行結果を必ず送る（何もなければ「該当なし」も可） |
| **heartbeat** | 1日4回（02:00 / 08:00 / 14:00 / 20:00 JST。AI PMO Phase 2 と同じ）起こされ、前回以降に新着がある場合だけ差分を見て AI が反応の要否を判断する | **沈黙がデフォルト**。要否の判定に AI PMO の発話ゲートを使う |

- **AI PMO のナッジは組み込みの cron（Phase 1 タスク巡回）と heartbeat（Phase 2 メッセージ巡回）である**。ユーザー定義の基盤を別に作ってから移すのではなく、**PMO の基盤（`ai_nudges`・差分カーソル・発話ゲート）を広げてユーザー定義を載せる**。PMO Phase 1/2 は組み込みオートメーション2件として登録する（§6・§8）。これは `scheduled-jobs-design.md` §1 の「AI PMO の cron をユーザー定義ジョブの基盤に流用しない」という方針を変更するもの
- 用語: **AI PMO** は組み込みオートメーションの総称、**ナッジ**（`ai_nudges`）は本人だけに見える非公開メッセージという**出力の形**、**cron / heartbeat / Skill** は**起動条件**を指す
- **発火の判定に LLM を使わない**。cron は `nextRunAt <= now` の比較で決め、heartbeat は差分カーソルに新着があるかで決める。LLM が動くのは発火後だけ

### 2.2 読み取り範囲と結果の送り先

| 起動条件 | 読み取り範囲 | 結果の送り先 |
|---|---|---|
| Skill（`/ai`） | 呼んだ本人の権限の範囲 | 呼んだ本人（`/ai` の会話内） |
| Skill（`/chat`・後続） | 呼んだ本人の権限の範囲 | 呼んだチャンネル。ただし §2.3 の根拠ルールを満たすものだけ |
| cron | 作成者本人の権限の範囲 | **非公開メッセージのみ**。宛先は根拠を閲覧できる人に限る（§2.3） |
| heartbeat | **紐づけたプロジェクトの中だけ**（プロジェクトチャンネル・タスク・ファイル） | そのプロジェクトのメンバーへの非公開メッセージ、またはそのプロジェクトチャンネル |

- DM は、どの起動条件でも読まない（AI PMO §7 と同じ）
- 作成者が非活性になった、または admin でなくなった場合、そのオートメーションは停止する（`paused_reason` を残し、owner / admin に通知する）。誰の権限で読むかを曖昧にしない

### 2.3 根拠ルール — 送り先が見られない情報を混ぜない

結果に含める根拠（メッセージ・ファイル・タスク・プロジェクト）は、ツールが返す evidence DTO（`10_ai_member_design.md` §2.3）としてサーバー側で追跡する。配信の直前に、**宛先の全員がすべての根拠に現在アクセスできるか**を `requireChannelAccess` / `requireProjectAccess` / `canAccessFile` 相当で検証する。

- 一部の宛先が見られない根拠がある場合は、その宛先への配信を**失敗**として記録し、作成者に知らせる。伏せ字にして送ることはしない（文面に要旨が残るため、伏せても漏れる）
- 本文の文字列から判定せず、ツールの戻り値で判定する。LLM が根拠を出さずに要旨だけ書くケースに備え、run の中で読んだ全 evidence を「読んだ根拠」として扱い、宛先の閲覧範囲を超えるものを1件でも読んでいれば、その宛先へは配信しない

### 2.4 書き込みは承認カードを通す

- 報告（非公開メッセージ・`/ai` への返答）だけは承認なしで実行する
- それ以外の書き込み（プロジェクト招待・役割付与・タスク作成・チャンネル投稿・メンション）は、AI が**実行案**を作り、承認カードで人間が承認・編集・却下する。承認した人を実行責任者として記録し、**承認者の権限で**実行する（承認者が実行できない操作は失敗させる）
- 承認者は、Skill では呼んだ本人、cron / heartbeat では作成者（または作成時に指定した admin 以上の人）
- 承認カードはアプリ基盤のカード型メッセージ（`app-platform-design.md` §4）で描く。`10_ai_member_design.md` の Stage 2 と同じ仕組みを使う
- 承認後の投稿・メンションの**送信者は AI の Bot profile**とし、メッセージに「○○さんが承認」を表示する。承認者の名義で投稿しない（AI が書いた文だと一目で分かるようにするため。`10_ai_member_design.md` §6-5）
- AI の Bot は**アプリ基盤の Bot と同じ仕組み**で作る。「Cairn AI」をファーストパーティのアプリとして各ワークスペースへ自動でインストールし、そのインストールの Bot profile（`app-platform-design.md` §3.2）で投稿する。認証・表示・無効化を別に作らない
- `/chat` から Skill を呼んだ場合、実行案と承認カードは**呼んだ本人にだけ**見せ（ナッジと同じく本人だけに見える表示）、承認後の投稿・メンションだけがチャンネルに出る。却下した案は誰にも見えない。実行案と承認・却下の記録は `ai_automation_runs` / `ai_pending_actions` に残る

### 2.5 作成できるのは admin 以上、一覧は公開

コストと誤った投稿の影響が大きいため、作成・編集・停止は owner / admin に限る。オートメーションの一覧（名前・指示文・起動条件・作成者・送り先・承認者）は **member 以上が閲覧できる**。§2.6 の許可条件を兼ねる。

### 2.6 AI PMO の禁止事項はユーザー定義には適用しない（公開を条件に許可）

`ai-pmo-design.md` §2.3 の「監視・査定・炙り出しの道具にしない」「リーダーへ自動エスカレーションしない」は、**組み込みの PMO にだけ**適用する。ユーザー定義のオートメーションで人物の評価やリーダーへの報告を行うことは、次を条件に許可する。

- admin が明示的に設定したものであること（§2.5）
- 指示文・送り先が member 以上の一覧で見られること（§2.5）。誰が何を誰に報告させているかを隠さない
- 人物の評価・報告を含む指示文には、保存時に「対象者の評価を報告する指示です。一覧でメンバーに公開されます」と注意を表示する
- 報告カードには、どのオートメーション（作成者名）からの報告かを表示する

組み込みの PMO が個人の側に立つ道具であることは変えない。ユーザー定義のものは組織が自分の責任で設定する道具として、透明性で釣り合いを取る。

### 2.7 プロフィール属性は、画面に見える範囲で AI も使う

`list_members` などのツールは、**実行主体（呼んだ本人 / 作成者）の画面に表示されるプロフィール属性**をそのまま返し、AI は属性で人を絞り込める（例: 「コーチ」属性のユーザー）。属性ごとの AI 利用許可フラグは設けない。画面で見えるものを AI 経由で見ても、新たな露出にはならないため。

- 属性をメンバーの埋め込み（`member/upserted` のインデックス）へ入れることはしない（`profile-attributes-design.md` §7.3 のまま）。ツール呼び出しで都度読む

### 2.8 受信者はオートメーションごとに受信を止められる

- 受信者は、届いた報告カードから、そのオートメーションからの受信を止められる（`ai_automation_mutes`）。止めたら作成者に通知し、報告が届いていないことに作成者が気づけるようにする
- 組み込みの PMO は、従来どおり個人キルスイッチ（`profiles.ai_nudges_enabled`）で一括して止める。ユーザー定義のものは個人キルスイッチの対象外（業務上の報告を一括停止で取りこぼさないため。止めるなら個別に止めて作成者に伝わる形にする）

### 2.9 上限とテスト実行

- ワークスペースあたり、オートメーションの**定義は20件**（組み込みは数えない）、**実行は1日100回**まで。上限に達した実行は `skipped` として記録し、作成者に知らせる。実際のクレジット消費を見て値を見直す
- **テスト実行（dry-run）**を設定画面に置く。実際にツールで読み、判断まで行い、結果を**設定画面にだけ**表示する（報告文・宛先・実行案・読んだ根拠・根拠ルールで届かない宛先）。配信・書き込み・承認カードの発行・ナッジの作成はしない。結果は実行履歴にも残す。クレジットは消費し、実行回数にも数える

### 2.10 メンバーの経歴一覧は既存画面 + `/ai` で賄う

- 一人ひとりの経歴（参加プロジェクト・期間・ステータス・プロジェクトの役割）は、既存のメンバー詳細（`/members/[id]`、`member-panel.tsx`）で見られる。新しい画面は作らない
- 全員を比較する表は、その都度 `/ai` で生成させる（Phase 0 の `list_members` / `get_member_history` を使う）。審査項目に当てはまるかの判定は cron の報告で行う
- 専用の比較表画面は、上記の運用で足りないことが分かってから検討する

## 3. 全体アーキテクチャ

```
[/settings/automations] 指示文 + 起動条件 + 範囲 + 送り先を入力 → 保存時コンパイル（§4）→ dry-run（§2.9）
   ▼
ai_automations（組み込みの PMO Phase 1/2 も行として持つ）
   │
   ├─ Skill:     /ai で `$名前` → 会話のストリーム内でエージェント実行
   ├─ cron:      Inngest cron（dispatcher, 5分ごと）→ nextRunAt <= now → automation/fire
   └─ heartbeat: Inngest cron（1日4回）→ 範囲内の差分カーソルに新着あり → automation/fire
   ▼
[Inngest fn: on-automation-fire]
   reserve run（冪等） → 実行
     組み込み: 既存の PMO 検知（ルール / Jev）
     ユーザー定義: エージェント実行（ツールは §5、上限は §10）
   → 報告: 根拠ルール（§2.3）→ 発話ゲート → ai_nudges で非公開配信
   → 書き込み: 承認カードを発行（ai_pending_actions）
   → run を success / failed / silent / skipped で確定
```

エージェントの実行は `/ai` の tool calling（Vercel AI SDK v4、`chatLanguageModel()` 経由）を共通化した関数で行い、`/ai`・cron・heartbeat で同じツール実装を使う。ツール側で、認証コンテキストではなく「実行主体（呼んだ本人 / 作成者）と読み取り範囲」を受け取って境界を引く。

## 4. 保存時コンパイル

指示文はそのまま実行時のプロンプトに使い（`rawInstruction` を正とする）、**構造化できる部分だけ保存時に確定する**。

| 確定するもの | 例 | 解決できない場合 |
|---|---|---|
| 起動条件・スケジュール | 毎日 10:00 JST | 保存エラー |
| 参照するチャンネル・プロジェクト | `#審議` → channelId | 名前の重複・不在は保存エラー |
| 宛先・メンション | `@審査担当` → userId | 同名が複数いれば保存エラー（発火時に名前で再解決しない） |
| Skill 名 | `assign-reviewer` | ワークスペース内で重複したら保存エラー |
| 書き込みの種類 | `invite_project_member`、`set_project_member_role`、`post_message` | 承認者が決まらなければ保存エラー |
| 人物評価・報告を含むか | 「遂行できる人物か判断して報告」 | 保存は止めず、§2.6 の注意を表示する |

保存時に「次回 10/28 10:00 に #審議 を読み、@審査担当 に非公開で報告します。書き込みはしません」のように確定内容をプレビューする。

## 5. ツール

`/ai` の既存の読み取りツール（`list_projects` / `list_project_tasks` / `search_channel_messages` / `search_workspace_documents` / `get_project_risk_snapshot`）に、次を加える。**同じ実装を MCP にも公開する**（§7）。

### 5.1 読み取り（追加）

| ツール | 用途 |
|---|---|
| `list_channels` | 名前・種類・紐づくプロジェクトでチャンネルを探す |
| `read_channel_messages` | 期間・スレッドを指定して時系列で読む（`since` は cron の前回実行時刻、heartbeat の差分カーソル） |
| `get_project_members` | プロジェクトの参加者とプロジェクトの役割（`project_roles`） |
| `list_members` | メンバー一覧。画面に表示されるプロフィール属性を含み、属性で絞り込める（§2.7） |
| `get_member_history` | あるメンバーが参加したプロジェクト・役割・期間・添付された振り返り資料の一覧。メンバー詳細の参加プロジェクト一覧（`/api/workspaces/members/[userId]/projects`）と同じデータ |
| `read_file` | 添付ファイルの抽出済み本文（既存 `/api/files/[id]/content`） |

### 5.2 書き込み（承認カード経由）

| ツール | 承認 |
|---|---|
| `send_private_report` | 不要（§2.4）。根拠ルールは必須 |
| `invite_project_member` | 必要 |
| `set_project_member_role` | 必要 |
| `post_message`（メンションを含む） | 必要 |
| `create_task` | 必要 |

承認待ちは `ai_pending_actions`（`10_ai_member_design.md` §4.2）に置く。承認までに対象が変わった場合（プロジェクト削除、承認者の権限喪失）は、実行時に再検証して失敗させる。

## 6. データモデル（案）

```
ai_automations
  id, workspace_id → workspaces (cascade)
  kind            text   -- skill | cron | heartbeat
  builtin         text   -- null（ユーザー定義）| pmo_tasks | pmo_messages
  name            text   -- Skill は `$name` の name。ワークスペース内で一意
  raw_instruction text   -- 編集・表示・実行プロンプトの正（組み込みは null）
  compiled        jsonb  -- §4 で確定した schedule / channelIds / projectId / recipientIds / writeActions
  scope_project_id uuid → projects   -- ユーザー定義 heartbeat の読み取り範囲（必須）
  approver_id     uuid → profiles    -- 書き込みの承認者
  created_by      uuid → profiles    -- 組み込みは null
  enabled         boolean default true
  paused_reason   text               -- creator_inactive | creator_demoted | budget_exhausted ...
  next_run_at, last_run_at, created_at, updated_at

ai_automation_runs
  id, automation_id → ai_automations (cascade)
  trigger_key     text   -- cron: 予定時刻 / heartbeat: 差分カーソル終端 / skill: 呼び出しメッセージID / dry-run: 'dry:' + 実行ID
  dry_run         boolean default false
  status          text   -- running | success | silent | failed | skipped
  evidence        jsonb  -- 読んだ根拠の evidence DTO（§2.3 の検証と監査に使う）
  output          jsonb  -- 配信した報告・発行した承認カード（dry-run は作成者に見せる内容）
  credits_used    integer
  error           text
  started_at, finished_at
  unique(automation_id, trigger_key)   -- 予約による冪等性（scheduled-jobs-design.md §5.2 と同じ）

ai_automation_mutes          -- §2.8 受信者ごとの受信停止
  automation_id → ai_automations (cascade), user_id → profiles, created_at
  primary key (automation_id, user_id)
```

- **差分カーソルは既存の `ai_scan_states` を広げる**。主キーを `channel_id` から `(automation_id, channel_id)` に変え、PMO Phase 2 の既存行は組み込みオートメーション `pmo_messages` の行へ移す。`next_unanswered_ask_*` は PMO 固有のまま残す
- **非公開メッセージの配信は `ai_nudges` を使う**（宛先本人だけに見え、チャット欄に合成表示され、ベル通知・Realtime の仕組みが揃っているため）。`automation_id` / `run_id` 列を足し、ユーザー定義からの報告は `detector = 'automation'` とする。カードには「このメッセージはあなただけに見えています」に加えて、どのオートメーション（作成者名）からの報告かと「このオートメーションの受信を止める」を表示する
- 発話ゲートのうち、重複抑止・静寂時間はユーザー定義にも適用する。**日次上限（1ユーザー1日3件）は組み込みの PMO だけ**に適用し、ユーザー定義の報告は §2.9 のワークスペース上限で抑える（業務上の報告が PMO の枠を食い合わないようにするため）

## 7. Cairn MCP の拡張

現在の MCP でチャンネルを読む手段は `search_messages`（部分一致・新しい順に最大50件）だけで、次のことができない。

- チャンネルの一覧取得（`#審議` を特定できない）
- 期間を指定した時系列の取得、スレッドの取得
- メンバー一覧・プロフィール属性の取得
- プロジェクトの参加者と役割の取得（`get_project` が参加者を返さない）

そのため、外部 AI で「メンバーの経歴一覧」を作ることは現状できない。§5.1 の読み取りツールを MCP にも同じ実装で公開する（MCP 層は既存 Route Handler を呼ぶ薄い変換のまま。`mcp-server-design.md` §6）。これは Cairn 内のオートメーションを待たずに出せるので、最初に実装する（§8 Phase 0）。

## 8. 段階

| Phase | 内容 | 完了条件 |
|---|---|---|
| 0 | §5.1 の読み取りツールを実装し、`/ai` と MCP に公開する | 外部 AI と `/ai` から「#審議 の昨日以降の投稿」「コーチ属性のメンバー」「プロジェクトのレビュワー」「全員の経歴の比較表」が取れる |
| 1 | Skill（`/ai` で `$名前`）+ 承認カード + Bot 送信者 + `/settings/automations`（一覧公開・dry-run） | `$assign-reviewer` で招待・役割付与・メンションが承認を経て完了する |
| 2 | 基盤の共通化: `ai_automations` / `ai_automation_runs` を作り、PMO Phase 1/2 を組み込みオートメーションとして載せ替え、`ai_scan_states` を広げる。**一括で切り替える**: 同じデプロイで旧 Inngest 関数を削除し、新しい発火の仕組みから既存の検知・ゲートのコードをそのまま呼ぶ（並行稼働はしない）。`FEATURE_FLAGS.aiPmo` とワークスペースの Phase スイッチは、組み込みオートメーションの実行条件としてそのまま評価する | PMO の挙動（検知・ゲート・配信・キルスイッチ・Phase スイッチ）が既存テストのまま変わらず、run が記録される |
| 3 | ユーザー定義の cron（根拠ルール・非公開配信・受信停止・上限） | 毎日10時の #審議 確認が @審査担当 に非公開で届き、run が監査できる |
| 4 | ユーザー定義の heartbeat（プロジェクト単位の差分巡回） | 遅延兆候の通知が沈黙をデフォルトとして届く |
| 5 | `/chat` からの Skill 呼び出し | チャンネルで `$名前` を呼べる |

投票作成（`scheduled-jobs-design.md` の登山本部ユースケース）は、Phase 3 以降に cron から呼べる書き込みツール `create_poll` として足す。

## 9. 既存設計との関係

| 文書 | 変わること |
|---|---|
| `scheduled-jobs-design.md` | 定期ジョブ（`scheduled_jobs` / `scheduled_job_runs`）は本書の cron（`ai_automations` / `ai_automation_runs`）に置き換える。決定論的な `actionSpec` は「書き込みツールを決まった引数で呼ぶ」ことで表す。冪等性の予約方式・保存時コンパイル・メンションの固定は引き継ぐ |
| `ai-pmo-design.md` | PMO は組み込みの cron / heartbeat として `ai_automations` に載る（Phase 2）。§2.3 の禁止事項は組み込みの PMO だけに適用する（§2.6）。配信（`ai_nudges`）・差分カーソル（`ai_scan_states`）・発話ゲートをユーザー定義と共有する |
| `10_ai_member_design.md` | `/ai` は読み取り専用という原則に、Skill の承認カード経由の書き込みを例外として加える。承認カードは Stage 2 の仕組みを先に作るもの |
| `profile-attributes-design.md` | §7.3 の「属性を AI の人物検索に使うか」は、画面に見える範囲でツールから使うと決めた（§2.7）。埋め込みへは入れない |

## 10. コストと上限

- モデルは `workspaces.ai_chat_model`。キーがなければ別プロバイダーへ逃がさず失敗にする（`apps/web/AGENTS.md`）
- 1 run あたりのツール呼び出し回数・取得件数の上限は `AI_RESEARCH_LIMITS` に揃え、切り詰めたら報告に明記する
- 実行ごとにケルンのクレジットを消費する。残高がない場合は実行せず `paused_reason = 'budget_exhausted'` とし、作成者に知らせる（コスト不足で「該当なし」と報告しない。`10_ai_member_design.md` §6-7）
- 定義数・実行回数の上限は §2.9

## 11. 未決事項

なし（2026-10-27 時点）。実装中に出た論点はここに追記する。
