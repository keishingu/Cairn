# 外部サービス排他接続 設計方針

> **ステータス**: 実装前の確定方針
> **作成日**: 2026-07-24
> **対象**: カレンダー、チャット、ストレージ、ミーティングの外部サービス連携

## 1. 決定

Cairn は、ワークスペースの機能カテゴリごとに主系サービスを1つだけ選ぶ。

| 機能カテゴリ | Cairn 側 | 外部サービスの例 |
|---|---|---|
| カレンダー | Cairn Calendar | Google Calendar / Outlook Calendar |
| チャット | Cairn Chat | Slack / Microsoft Teams |
| ストレージ | Cairn Storage | Box / Google Drive / SharePoint |
| ミーティング | meeting metadataのみ、または未接続 | Circleback / Notta / Plaud |

Google Calendar を選んだらカレンダー、Slack を選んだらチャット、Box を選んだらストレージ、Circleback を選んだら会議の記録・議事録取り込みにそのサービスを使う。

同じカテゴリで Cairn と外部サービスを併用したり、複数の外部サービスへ同時に書き込んだりしない。排他性はサービス全体ではなく、**ワークスペース × 機能カテゴリ**に適用する。そのため Google Calendar、Slack、Box、Circleback は異なるカテゴリとして同時に接続できる。

## 2. Cairn の役割

Cairn は外部サービスの代替実装や汎用双方向同期ハブではなく、プロジェクト文脈を外部リソースへ与える調整レイヤーになる。

Cairn が正本として保持するもの:

- ワークスペース、プロジェクト、マイルストーン、タスク、メンバー、権限
- 各機能カテゴリで選択中のプロバイダー
- Cairn エンティティと外部リソースの対応関係
- provider-neutral な `meeting` と、会議から人が承認したタスク・決定事項
- 接続・紐付け・操作の監査履歴

外部サービスを主系にしたカテゴリでは、本文や実体の正本を外部サービスに置く。

- カレンダーイベント: Google Calendar
- メッセージとスレッド: Slack
- フォルダとファイル本体: Box
- 録音、文字起こし、生成された議事録: Circleback

Cairn は外部ID、URL、同期状態、最終確認日時と、一覧・検索・AIに必要な権限付きの読み取り専用cacheを保持できる。ただし外部接続中に内部レコードを別の正本として並行更新しない。

## 3. 手動で確定する対応関係

名前一致、参加者、日時、AIの確信度だけでは外部リソースの帰属を確定しない。ユーザーが明示的に次を設定する。

| Cairn 側 | 外部側 |
|---|---|
| プロジェクトまたはマイルストーン | Google Calendar イベント |
| プロジェクトまたはマイルストーン | Slack チャンネル |
| プロジェクトまたはマイルストーン | Box フォルダ |
| プロジェクト | Circleback タグ |

AI は候補を検索しやすくしたり未紐付けを通知したりできるが、対応関係を自動確定しない。対応付け後の表示・作成・編集・削除・webhook処理は選択済みproviderのadapterを通して自動で行う。

## 4. `meeting` エンティティ

`meeting` は録音・文字起こし機能ではなく、会議に関する複数サービスのデータをプロジェクト文脈へ束ねる薄いハブとする。

```text
project / milestone
        ↑
     meeting
      ↙   ↘
calendar   Circleback
 event     meeting record
```

初期の責務:

- 所属 workspace / project / milestone
- タイトル、開始・終了時刻、公開状態
- Google Calendar event への参照
- Circleback meeting への参照
- 議事録・transcript・action items の読み取り専用snapshot
- AI検索用チャンクと同期状態

初期スコープ外:

- Cairn 自身による録音、文字起こし、要約生成
- 議事録・transcript・Circleback action itemsの編集
- 出席管理や会議室予約
- Circleback と競合する会議検索・会議アシスタント
- action items から Cairn task への無承認な自動変換

## 5. Circleback の取り込み

Circleback のタグと Cairn のプロジェクトを管理者が手動で対応付ける。Circleback webhook の `tags` を、会議ごとの決定的なルーティングキーとして使う。

```text
手動設定
Circleback tag ↔ Cairn project

Circleback webhook
  ├─ meeting id
  ├─ tags
  ├─ icalUid
  ├─ notes
  ├─ actionItems
  └─ transcript
        ↓
tag mapping で project を決定
        ↓
meeting を upsert
```

処理ルール:

- provider connection と Circleback meeting ID の組み合わせで冪等化する
- active なタグ対応が1つだけ見つかった場合、そのprojectへmeetingを帰属させる
- 対応するタグがない場合は `pending` とし、projectへ公開しない
- 複数タグが異なるprojectへ対応する場合は `conflicted` とし、自動公開しない
- タグの対応先と `icalUid` で見つけた Google Calendar event の対応先が異なる場合も `conflicted` にする
- `icalUid` が一致すれば、同じmeetingへcalendar eventを結び付ける。一致しなくてもタグが一意なら取り込みはできる
- pending / conflicted は接続管理者または送信元として確認できるユーザーだけに見せる
- タイトル・参加者・日時を使うAI推測は候補表示に限り、公開先を確定しない

Circleback タグは webhook では文字列として届くため、実装時は connection 内のタグ名を正規化せず原文で保持し、前後空白等の安全な比較規則だけを定義する。タグ名変更で対応が切れた場合は同名推測で付け替えず、再設定を求める。

Circleback の webhook は署名付きraw bodyを検証してから処理する。Cairn が保持する議事録・transcript・Circleback action items は表示・検索用snapshotであり、Circleback meetingが正本である。Cairnはこれらの編集APIを持たず、meeting画面の編集導線は `Circlebackで編集` の外部リンクにする。

2026-07-24時点の[公式webhook仕様](https://support.circleback.ai/en/articles/11014015-export-meeting-data-with-webhooks)は、automationからmeeting dataをexportする形で、meeting ID、tags、`icalUid`、notes、action items、transcriptと署名検証方法を提供している。一方、削除・共有権限変更のlifecycle eventは同仕様に記載されていない。そのため初期版は次の扱いにする。

- 受信内容を取得時点のsnapshotとして保存し、`last_synced_at` を表示する
- webhookの再実行は同じmeetingを更新する
- recording URLは一時URLのため保存対象にせず、録音本体も自動取得しない
- Circleback側の削除・権限変更が自動通知されると仮定しない
- 保持停止・削除要求・接続解除時に、Cairn側snapshotを明示的に削除または非公開化できるようにする

## 6. データモデル案

### 主系provider

`workspace_capability_providers`:

- `workspace_id`
- `capability`: `calendar | chat | storage | meeting`
- `provider`: `cairn | none | google_calendar | slack | box | circleback | ...`
- `connection_id`
- `status`: `active | switching | error | disconnected`
- `(workspace_id, capability)` の一意制約

### 外部コンテナとの手動対応

`external_container_links`:

- `workspace_id`, `capability`, `provider`, `connection_id`
- `project_id`, `milestone_id`（nullable）
- `external_container_type`: `calendar_event | channel | folder | tag`
- `external_container_id`
- `external_parent_id`, `external_url`
- `linked_by`, `linked_at`, `last_verified_at`
- `status`: `active | inaccessible | deleted | inactive`

Circleback の場合は `external_container_type = tag`、`external_container_id = webhookで届くタグ名` とする。

### 会議ハブ

`meetings`:

- `workspace_id`
- `project_id`（pending時はnullable）
- `milestone_id`（nullable）
- `title`, `started_at`, `ended_at`
- `status`: `pending | active | conflicted | inaccessible | deleted`
- `created_at`, `updated_at`

`meeting_sources`:

- `meeting_id`, `provider`, `connection_id`
- `external_id`, `external_url`, `external_calendar_uid`
- `source_metadata`, `last_synced_at`
- `(connection_id, provider, external_id)` の一意制約

`meeting_artifacts`:

- `meeting_id`
- `kind`: `notes | transcript | action_items | recording_reference`
- `content_text` または `content_json`
- `provider`, `external_version`, `synced_at`

`meeting_artifacts` は外部providerから得たimmutable snapshotとして扱い、ユーザー編集用の更新APIを作らない。Circlebackから再取得した場合はproviderの最新版で置き換える。Cairn taskへ承認済みaction itemを変換した後は、別entityであるtaskをCairn側で編集し、元のCircleback action itemは変更しない。

RAG の `document_chunks.source_type` に `meeting` を追加し、`source_id = meetings.id` とする。検索時は `meetings.project_id` とproject accessを必ず検証し、pending / conflicted は索引対象にしない。

## 7. providerを通すルール

すべての機能呼び出しは最初に有効なproviderを解決する。

```text
calendar operation
  → resolve workspace calendar provider
    ├─ cairn            → internal calendar adapter
    └─ google_calendar  → Google Calendar adapter
```

- 外部provider選択中に、失敗を隠して内部providerへフォールバックしない
- 外部APIが失敗した場合は操作を失敗として表示し、内部だけを更新しない
- 一覧用キャッシュは正本ではない。期限切れや同期失敗をユーザーへ示す
- 外部で削除・権限変更されたリソースは「リンク切れ」と表示し、同名リソースへ自動で付け替えない
- AI、Web、Expo、バックグラウンドジョブも同じprovider解決を使う

## 8. 接続後の挙動

### Google Calendar

- Cairn のカレンダー面は Google Calendar events を表示する
- Cairn からのevent作成・日程変更は Google Calendar APIへ書き込む
- Cairn に日程を保持する場合は、連携eventから得た派生値または同期済みキャッシュとして扱う
- 参加者、繰り返し、通知、タイムゾーン等を簡易モデルへ無理に変換しない

### Slack

- Cairn のチャット導線は対応する Slack channelを表示または開く
- 投稿、返信、編集、削除は Slack APIを通す
- AI・検索用の取り込みは Slack の権限と保持ポリシーを守る
- Cairn 内部channelは構造上の参照先として残せるが、Slack接続中の別会話面にはしない

### Box

- Cairn のファイル導線は対応する Box folderを表示または開く
- アップロード、更新、移動、削除は Box APIを通す
- ファイル本体を Cairn Storage と Box の両方へ保存しない
- Cairn は外部ID、名称、URL、MIME type、サイズ、更新日時等のメタデータを保持できる

### Circleback

- Circleback tag mappingを通じてmeetingをprojectへ取り込む
- Cairn は会議内容を常に読み取り専用で表示し、`Circlebackで編集` から正本へ誘導する
- action itemsはCairn taskの候補にできるが、人の承認前にtaskを作らない
- CirclebackからSlackへも議事録を投稿する場合は重複表示を明示し、Cairn側で同じ内容を別メッセージとして自動投稿しない

## 9. 切り替えと切断

provider変更は通常操作ではなく移行操作として扱う。

- 切り替え前に既存リンク数、未同期操作、利用不能になる機能を表示する
- 切り替え中は対象カテゴリへの書き込みを止める
- 旧providerのリンクは履歴として保持するがinactiveにする
- 新providerのリンクはユーザーが改めて手動で確定する
- 切断時に外部データを暗黙に複製・移行しない
- データ移行は接続切り替えとは別の明示的なimport処理にする

`meeting` はprovider-neutralなCairnエンティティなので、Circlebackを切断しても監査・帰属・承認済みの派生構造は残す。外部由来の本文を保持し続けられるかは契約・削除要求・保持ポリシーに従う。

## 10. 権限と情報越境

- 接続・主系切り替え・タグ対応付けはowner/adminに限定する
- カレンダー・チャンネル・フォルダの紐付けはCairn側編集権限と外部側参照権限を両方確認する
- Cairnのguestに、外部サービス上で権限のないevent・channel・folder・meetingを見せない
- AI索引、通知、previewも両側の権限を満たす範囲に限定する
- 監査ログへ接続、切り替え、紐付け、解除、リンク切れ、meeting帰属確定を記録する

## 11. 現状との差分

2026-07-24時点:

- Google Calendarはユーザー単位で接続し、Cairnのproject / milestoneへeventsを追加レイヤーとして重ねている
- Google Calendar eventとproject / milestoneの明示的な対応付けはない
- iCalによるCairn → Google Calendar表示と、Google Calendar → Cairn読み込みが併存している
- Slack / Box / Circlebackの主系provider実装と外部リソース対応付けはない
- `meeting` / `meeting_sources` / `meeting_artifacts` は存在しない
- 各画面・APIはprovider resolverを経由せず、内部実装を直接利用している

したがって現行のGoogle Calendar Labを排他接続の完成形とは扱わない。

## 12. 実装順序

1. `meeting`の最小モデルとアクセス制御
2. 機能カテゴリ別の主系provider設定と共通resolver
3. 手動リソース対応付け、監査、リンク切れ表示
4. Circleback tag mapping、署名検証webhook、meeting upsert
5. Google Calendar adapterとカレンダー面の排他化
6. Slack adapterとチャット面の排他化
7. Box adapterとファイル面の排他化
8. provider切り替え・切断・明示的import

各カテゴリは、読み取りだけでなく作成・編集・削除・AI・バックグラウンド処理まで同じadapterを通せた時点で完成とする。
