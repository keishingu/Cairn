# AIプロジェクト操作 設計・実装計画

> **ステータス**: 実装前の確定方針
> **作成日**: 2026-07-24
> **対象**: `/ai` からのプロジェクトステータス変更・マイルストーン日程変更

## 1. 背景と目的
Cairn は、PCを開かなくてもスマートフォンからプロジェクトを前へ進められる体験を目指す。現在の `/ai` はRAGを使った回答や助言はできるが、回答後の更新は別画面で行う必要がある。
そこで `/ai` を「質問に答える画面」から「会話でプロジェクトを動かす操作面」へ拡張する。
目的:
- スマートフォンの `/ai` だけで日常的な更新を完結させる
- 自然言語を、対象・変更前・変更後が明確な操作へ変換する
- 進捗を根拠に、マイルストーンの現実的な日程案を提示する
- 誤認識、権限逸脱、同時編集による意図しない更新を防ぐ
- AI経由の操作も通常UIと同じ権限・履歴・通知ルールで扱う
本書は [`ai-pmo-design.md`](./ai-pmo-design.md) の「本人の明示アクションを経る」原則と、[`milestone-design.md`](./milestone-design.md) のデータ構造を継承する。

## 2. 決定
`/ai` にプロジェクト操作を追加するが、LLMのツールから業務データを直接更新しない。
1. AIが最新の構造化データを取得する
2. AIが変更案を `ai_actions` に `pending` として保存する
3. チャット内に変更前後と根拠を示す確認カードを表示する
4. ユーザーが「変更する」を押す
5. サーバーが権限と現在値を再検証して更新する
6. 実行結果と、条件付きの「元に戻す」を表示する
AIの文章生成と業務データの更新境界を分離し、承認APIを唯一の書き込み経路にする。

## 3. スコープ
初期スコープ:
- プロジェクトのステータス変更
- マイルストーンの開始日・終了日・開始時刻・終了時刻の変更
- 「来週金曜」「2週間後」などの相対日付解釈
- タスク状況を使った根拠付き日程案
- 変更前確認、キャンセル、実行結果、条件付き取り消し
- 同時編集の検知
- 監査ログとプロジェクトチャンネルへのシステムメッセージ
- PC、モバイルWeb、Expo内WebViewで共通の操作カード
初期スコープ外:
- プロジェクト・マイルストーンの作成、削除、アーカイブ
- タスク、担当者、権限、メンバー構成の変更
- 複数プロジェクトの一括実行
- AI判断だけによる自動実行
- マイルストーン変更に伴うタスク期限・プロジェクト終了日の連鎖変更
- AI PMOナッジからの無承認実行

## 4. 要求
| ID | 機能要求 |
|---|---|
| F-1 | プロジェクト名と希望ステータスを自然言語で指定できる |
| F-2 | 利用可能なステータスを最新DBから取得し、存在するものだけ提案する |
| F-3 | マイルストーン名と変更希望日を自然言語で指定できる |
| F-4 | 相対日付はJST基準の `YYYY-MM-DD` へ解決して表示する |
| F-5 | 対象が一意でなければ提案を作らず、最小限の確認質問をする |
| F-6 | 対象、変更前後、根拠、仮定、警告を確認カードに表示する |
| F-7 | 「変更する」の明示操作まで業務データを変更しない |
| F-8 | 実行時に認証、所属、ロール、現在値を再検証する |
| F-9 | 実行状態を会話履歴から再表示できる |
| F-10 | 他の編集と競合しない場合だけ元へ戻せる |
| F-11 | AI経由の変更を監査ログとチャンネルへ残す |
| F-12 | 更新後に通常画面の関連キャッシュを再取得する |
| F-13 | 提案作成前に操作者のプロジェクト参照権限を検証し、権限のない対象の現在値や差分を保存・返却しない |

| ID | 非機能要求 |
|---|---|
| N-1 | LLM出力を認可済み入力として信用しない |
| N-2 | 書き込みは冪等にし、二重タップ・再送で重複更新しない |
| N-3 | 別ワークスペースへの越境操作を拒否する |
| N-4 | 非活性メンバーは未所属として扱う |
| N-5 | ゲストは参照できても変更を承認できない |
| N-6 | 競合時は上書きせず、最新値を示す |
| N-7 | 提案は30分で失効する |
| N-8 | PCとモバイルで意味・安全性・履歴を一致させる |
| N-9 | エラーを成功や既定値へフォールバックしない |
| N-10 | 推測・期限切れのIDを含め、未認可の対象からaction snapshotを生成しない |

## 5. UX
### 5.1 ステータス変更
入力例: 「Cairnのステータスを進行中にして」
確認カード:
- 対象: Cairn
- 変更: 未着手 → 進行中
- 操作: `変更する` / `キャンセル`
### 5.2 明示日付の変更
入力例: 「β版リリースを2週間後の金曜にずらして」
- 対象: Cairn / β版リリース
- 終了日: 2026-08-01 → 2026-08-14（金）
- 指定されていない開始日・時刻: 変更なし
- プロジェクト期間外になる場合: 警告を表示
### 5.3 現実的な日程案
入力例: 「遅れているタスクを考慮して、β版の期限を現実的な日にして」
AIは次を最新DBから取得して根拠にする。
- 未完了タスク数、期限超過タスク数
- 未完了タスクの最も遅い期限
- 現在のプロジェクト期間とマイルストーン期間
- AIが置いたバッファの仮定と確信度
判断材料が不足する場合は日付を捏造せず、目標時期や必要なバッファを質問する。

## 6. 日程提案の制約
現在、タスクはプロジェクトに属し、個別マイルストーンには紐付かない。工数、依存関係、稼働可能時間、休暇も構造化されていない。
初期版の「現実的」は正確な予測ではなく、保存済み事実から説明可能な案を作ることとする。
- プロジェクト全体のタスク状況を根拠にする
- タスク期限がなければ予測精度が低いと伝える
- 参照した事実とAIの仮定を分けて表示する
- 低い確信度の案を断定しない
- プロジェクト期間・他マイルストーンとの矛盾を警告する
- 関連日程を自動で連鎖変更しない
将来 `tasks.milestone_id`、見積工数、依存関係、稼働情報を導入した段階で精度を上げる。

## 7. 現状とギャップ
利用できる実装:
- `/ai` の会話、RAGソース、ツール結果の保存・再表示
- AI SDK `streamText` とツール実行基盤
- プロジェクト、タスク、ステータス、マイルストーンの取得API
- `PATCH /api/projects/[id]` のステータス変更
- `PATCH /api/projects/[id]/milestones/[milestoneId]` の日付・時刻変更
- `ai_messages.tool_invocations` と `audit_logs`
- Expoの `/ai` WebView
不足:
- 業務データ用AIツール
- 最新値に基づく変更案の永続化・承認・失効モデル
- プロジェクト・マイルストーン更新処理の共通サービス
- マイルストーン更新のチャンネル履歴と監査ログ
- 競合検知と取り消し
- `/ai` の操作カード
RAGは検索索引であり、操作直前の正本には使わない。

## 8. アーキテクチャ
```text
発話 → AIメッセージAPI
  ├─ searchProjects
  ├─ getProjectPlanningContext
  ├─ proposeProjectStatusChange
  └─ proposeMilestoneScheduleChange
           ↓
      ai_actions (pending)
           ↓
      確認カード
       ├─ cancel
       └─ execute
           ├─ 認可・現在値再検証
           ├─ 業務更新
           ├─ audit_logs
           └─ system message
```
読み取りツールは最新DBを返す。提案ツールはpending actionを作るだけで業務データを更新しない。

## 9. ツール
`searchProjects`:
- 入力名称からアクセス可能な候補ID、名称、ステータス、期間を返す
- ゲストは参加プロジェクトだけを対象にする
- 候補が複数なら曖昧さを返す
`getProjectPlanningContext`:
- プロジェクト、利用可能ステータス、マイルストーン、タスク集計を返す
- RAGを経由せず、必要最小限の列だけモデルへ渡す
`proposeProjectStatusChange`:
- `projectId`, `statusId`, 理由を受ける
- 現在値を読み取りaction snapshotを作る前に、操作者がprojectを参照できることを検証する
- 同じステータスなら提案を作らない
- ステータスのworkspace所属を検証し、`actionId` と差分を返す
`proposeMilestoneScheduleChange`:
- `projectId`, `milestoneId`, 変更値、根拠、仮定、確信度を受ける
- 現在値を読み取りaction snapshotを作る前に、操作者がprojectを参照できることを検証する
- 未指定フィールドは変更しない
- 開始日が終了日より後の案を拒否する
- milestoneのproject所属を検証し、`actionId` と差分を返す

## 10. データとAPI
`packages/db/src/schema/ai.ts` に `aiActions` を追加する。
主な列:
- 所属: `workspace_id`, `conversation_id`, `requested_by`
- 冪等性: `request_key`（一意）
- 対象: `action_type`, `project_id`, `milestone_id`
- 差分: `before_snapshot`, `after_snapshot`
- 説明: `reason`
- 状態: `status`, `expires_at`, `executed_at`, `reverted_at`
- 日時: `created_at`, `updated_at`
状態は `pending / executed / cancelled / expired / conflicted / failed / reverted`。
会話やRAG全文は複製せず、操作に必要な差分と根拠だけを保存する。
API:
| パス | 動作 |
|---|---|
| `GET /api/ai/actions/[id]` | 作成者本人へ現在状態を返す |
| `POST .../[id]/execute` | 再認可・競合検知後に実行する |
| `POST .../[id]/cancel` | pending提案を取り消す |
| `POST .../[id]/revert` | 現在値が適用後値と一致する場合だけ戻す |
`execute` は更新、監査ログ、action状態更新を同一トランザクションで行う。
実行済みactionへの再リクエストは、更新を重ねず同じ結果を返す。

## 11. 更新処理の共通化
AI承認APIから既存PATCH APIをHTTPで呼ばず、サーバー内の共通更新サービスへ抽出する。
通常UIとAIの両方から次を同じ処理として利用する。
- workspace所属・role・入力検証
- DB更新と `updated_at`
- `audit_logs`
- プロジェクトGeneralチャンネルへのシステムメッセージ
- 必要なAI索引更新イベント
操作者は承認したユーザーとする。履歴には「○○さんがAIアシスタントから承認して変更」と残す。

## 12. 安全性と日時ルール
- action取得・実行は作成者本人に限定する
- owner/adminも他人のpending actionを代理実行できない
- activeな `member` 以上だけが実行できる
- 対象ID、before snapshotはサーバーがDBから作る
- LLMの名称・現在値を信用しない
- 実行時にbefore snapshotが不一致なら `conflicted` にする
- revertは現在値がafter snapshotと一致する場合だけ許可する
- 相対日付は提案作成時にJSTの絶対日付へ固定する
- 日付だけの依頼では時刻、時刻だけの依頼では日付を保持する
- 未指定フィールドをnullにしない
- プロジェクト期間外・マイルストーン重複は警告し、自動調整しない

## 13. UI・キャッシュ・監査
カード表示:
- 操作、対象、変更前後
- 参照した事実、AIの仮定、確信度、警告
- pending: `変更する` / `キャンセル`
- executed: 実行時刻 / `元に戻す`
- conflict・expired・failed: 理由と再提案導線
二重送信中はボタンを無効化する。モバイルは1カラム、主要タップ領域44px以上とする。
Expo側はWebViewのため初期版でReact Native画面追加は不要。
成功後に次をinvalidateする。
- `projectQueryKeys.all`, `projectQueryKeys.statuses`
- `['project-milestones', projectId]`
- `chatQueryKeys.projectChannels`
`audit_logs` には操作者、action ID、対象、変更前後、AI経由、理由、確信度、実行・取消時刻を残す。
会話全文やRAG全文は保存しない。

## 14. テストと受け入れ条件
単体:
- JST相対日付、部分更新、開始終了整合性
- action状態遷移、冪等性、競合、条件付きrevert
- 日程の事実・仮定・確信度の分離
API:
- owner/admin/memberは実行可能、guest・非活性は拒否
- 提案作成時点でproject参照権限を検証し、未認可ならactionとsnapshotを作らない
- 他人・別workspace・別projectのaction/entityを拒否
- 期限切れ、二重実行、競合を安全に扱う
- revertが他の編集を上書きしない
UI/E2E:
1. モバイル `/ai` でステータス変更を承認する
2. プロジェクト一覧とチャンネル履歴へ反映される
3. マイルストーン日程を承認し、概要・カレンダーへ反映される
4. 再読み込み後もカード状態が一致する
5. revertで元へ戻る
6. 別端末編集後の古い提案が競合で拒否される

## 15. 実装フェーズ
Phase 1（4〜6開発日）:
- `ai_actions`、migration、4つのAIツール
- action取得・実行・取消・revert API
- 共通更新サービス、監査、システムメッセージ
- 確認カード
- ステータス変更と明示日付のマイルストーン変更
完了条件は、PCとExpo内WebViewの両方から2操作を確認付きで安全に実行できること。
Phase 2（2〜3開発日）:
- タスク集計を使う根拠付き日程案
- 事実・仮定・確信度・矛盾警告
- 情報不足時の確認質問
- 承認率、取消率、失効率、競合率、revert率、モバイル比率の計測
Phase 3:
実運用結果を見て、タスク状態・担当者・プロジェクト期間への拡張を別途設計する。

## 16. 修正対象
追加:
- `apps/web/src/lib/ai/project-operation-tools.ts`
- `apps/web/src/lib/projects/project-mutations.ts`
- `apps/web/src/app/api/ai/actions/[id]/route.ts`, `execute/route.ts`, `cancel/route.ts`, `revert/route.ts`
- `apps/web/src/components/app/ai/action-card.tsx`
- `packages/db/src/schema/ai.ts` の `aiActions`
- `packages/shared/src/schemas/index.ts` のactionスキーマ
- `supabase/migrations/` のテーブル・制約・インデックス
修正:
- `apps/web/src/app/api/ai/conversations/[id]/messages/route.ts`
- `apps/web/src/components/app/pages/ai.tsx`
- `apps/web/src/app/api/projects/[id]/route.ts`
- `apps/web/src/app/api/projects/[id]/milestones/[milestoneId]/route.ts`
- `apps/web/src/hooks/use-patch-project.ts`
- `apps/web/src/hooks/use-project-milestones.ts`
- `packages/db/src/schema/index.ts`
- `docs/README.md`
テストは対象ファイルの近くに置き、説明文は日本語にする。

## 17. 代替案・リスク
不採用:
- LLMツールから即時PATCH: 確認前に変更される
- カードから既存PATCHを直呼び: 失効・競合・冪等性・履歴が分散する
- RAGを現在値として利用: 索引更新遅延がある
- 初期から全操作をAI化: 安全境界の検証範囲が広すぎる
主なリスクと対策:
- 同名対象の誤選択 → 一意になるまで提案しない
- 古い提案 → before snapshot比較と30分失効
- 根拠のない日程 → 構造化データと事実・仮定の分離
- 二重タップ → UI無効化、request key、冪等API
- revertが他人の編集を消す → after snapshot一致時だけ許可
- AI経由だけ履歴が欠ける → 共通更新サービスに集約

## 18. 初期値
実装開始を妨げる未決事項はない。次を初期値として固定する。
- すべての書き込みで承認必須
- action有効期限は30分
- revertは現在値がAI適用後の値と一致する場合だけ許可
- 日付解釈はJST
- プロジェクト期間外への変更は警告し、禁止しない
- 日程案はプロジェクト全体のタスク状況を根拠にする
- 対象操作はステータスとマイルストーン日程だけ
