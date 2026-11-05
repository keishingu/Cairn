# Teams（個人向け）コミュニティのエクスポート解析と Cairn への移行設計

**種別: 記録**（2026-11-05 時点の調査。実装・DB 変更はしていない）

Microsoft Teams（個人用）のコミュニティ機能が廃止されるため、`teams.live.com/dataexport` の「チャット履歴」「メディア」を Cairn に取り込めるかを調べた。対象は、あるコミュニティ（約40人）の運営者が自分のアカウントでエクスポートしたデータ1件。

- 本文・氏名・ID などの実データは本書に載せない。件数・型・構造だけを書く。例はすべて架空の値
- 解析は読み取り専用で、値を出さない集計スクリプトをリポジトリ外で実行した。外部サービスには送っていない

## 1. 結論

| 項目 | 判定 | 要点 |
|---|---|---|
| 会話一覧・本文・投稿日時 | ◎ | 47会話・6,446件。HTML 本文と UTC の投稿日時は全件ある |
| 投稿者 | **△** | ID はエクスポートした本人の投稿だけ。連絡先の人は表示名だけ。**それ以外の人の投稿（30%）は誰のものか分からない** |
| スレッド（投稿と返信） | **×** | 親子関係を示す項目がない。コミュニティの「投稿＋返信」は1本の時系列になる |
| 編集・削除 | △ | 編集日時はあるが履歴はない（最新の本文だけ）。削除済みは本文が空 |
| リアクション | ○ | 種類・日時・反応した人の ID がある（表示名は匿名化されることがある） |
| メンション | △ | 本文中の名前だけ。誰へのメンションかの ID はない |
| 画像・動画 | ◎ | `media/` に実ファイルがあり、99%をメッセージに紐づけられる |
| 添付ファイル（PDF など） | **×（実体なし）** | OneDrive の共有リンクだけ。ファイルはエクスポートに含まれない |
| イベント（予定） | ○ | イベントカードの日時・場所・iCalUID がある。予定表エクスポートと突き合わせられる |

**最大の課題は投稿者の特定**。エクスポートは「本人」「本人の連絡先」以外の参加者を `Unknown User` に置き換えるので、1人のエクスポートだけではコミュニティの会話を正しく復元できない（§4.1）。

## 2. 確認できたファイル構造

ZIP を展開した状態のフォルダ（`<MRI>_export/`）を調べた。ZIP そのもの（約700MB）は手元になかったので確認していない。

```
<MRI>_export/            612MB（ファイル 735 個）
├── messages.json        7.3MB   会話とメッセージ（本体）
├── endpoints.json       12KB    端末の通知登録情報（取り込まない）
├── invites.json         5KB     会話ごとの招待リンク（取り込まない）
└── media/               604MB   画像・動画 732 ファイル（フラット）
    └── 0-<region>-<dc>-<32桁hex>.<n>.<ext>   jpeg 647 / png 83 / mp4 2
```

- `media/` のファイル名は AMS（Teams のメディア保管庫）のオブジェクト ID ＋連番＋拡張子。730オブジェクト（2オブジェクトは2ファイル）
- メディアの最大は 19.6MB、中央値は 176KB。50MB を超えるものはない
- `endpoints.json` には端末ごとの通知用の鍵（`aesKey` `authKey`）が入っている。**秘密情報として扱い、アップロードも取り込みもしない**

## 3. スキーマ

### 3.1 messages.json

```jsonc
{
  "userId": "8:live:.cid.xxxx",          // エクスポートした本人の MRI
  "exportDate": "2026-11-05T00:00",
  "conversations": [{
    "id": "19:xxxx@thread.v2",            // 会話 ID（下表の接頭辞で種類が分かる）
    "displayName": "…",                    // 会話名（5件は空）
    "version": 0,
    "properties": { "lastimreceivedtime": "…", "consumptionhorizon": "…", … },
    "threadProperties": {
      "membercount": 40,
      "members": "[\"山田 太郎\",\"Unknown User\",\"Export Owner\", …]",  // JSON 文字列。MRI ではなく表示名
      "topic": "…", "picture": "…", …
    },
    "MessageList": [{
      "id": "1760000000000",               // 数値文字列（= 投稿時刻の epoch ms）。Teams 全体で一意
      "originalarrivaltime": "2026-01-01T00:00:00.000Z",
      "messagetype": "RichText/Html",
      "content": "<p>…</p>",
      "conversationid": "19:xxxx@thread.v2",
      "from": null,                        // 本人の投稿だけ MRI が入る
      "displayName": "山田 太郎",          // 連絡先の人だけ。それ以外は null
      "version": 1760000000000,            // 最終更新（編集・リアクション）の epoch ms
      "amsreferences": ["0-wus-d1-…"],      // media/ のオブジェクト ID
      "properties": {
        "edittime": 0, "deletetime": 0, "subject": "…",
        "emotions": [{ "key": "like", "users": [{ "DisplayName": "…", "time": 0, "value": "…" }] }],
        "deltaEmotions": [{ "key": "like", "users": [{ "mri": "8:live:…", "time": 0, "value": "…" }] }],
        "files": "[{…}]",                  // JSON 文字列（OneDrive のリンク）
        "links": "[{…}]",                  // JSON 文字列（URL プレビュー）
        "meeting": "{…}",                  // JSON 文字列（イベントカード）
        "qtdMsgs": [{ "messageId": 0, "sender": "8:live:…", "time": 0 }],   // 引用返信
        "pinned": "{\"creatorId\":…,\"pinnedTime\":…}", …
      }
    }]
  }]
}
```

### 3.2 会話の種類（会話 ID の接頭辞で判定）

| 種類 | 接頭辞 | 会話数 | メッセージ数 |
|---|---|---:|---:|
| グループ / コミュニティ | `19:<base64>@thread.v2` | 17 | 5,552 |
| 1対1チャット | `19:uni01_…` | 16 | 808 |
| 会議チャット | `19:meeting_…` | 12 | 77 |
| その他（`stream01_`） | `19:stream01_…` | 2 | 9 |

最大の会話（約40人のコミュニティ）が 4,300件で全体の67%を占める。期間は 2025-05-01〜2026-11-03。

### 3.3 messagetype

| 値 | 件数 | 扱い |
|---|---:|---|
| `RichText/Html` | 5,031 | 本文（HTML） |
| `Text` | 1,248 | 本文（プレーン） |
| `ThreadActivity/*`（AddMember・MemberJoined・TopicUpdate など） | 151 | システムメッセージ。本文に MRI が入る |
| `Event/Call` | 16 | 通話の記録 |

### 3.4 本文 HTML に出てくる要素

`itemtype` で意味が分かる。

| itemtype | 件数 | 意味 |
|---|---:|---|
| `schema.skype.com/Mention` | 4,724 | メンション（`<span itemid="0">名前</span>`。姓と名で span が分かれることがある） |
| `schema.skype.com/AMSImage` / `AMSVideo` | 379 / 2 | 本文中の画像・動画。`src` の URL に AMS オブジェクト ID |
| `schema.skype.com/ScheduledMeetingCreated` / `Updated` / `Cancelled` | 293 / 2 / 1 | イベントの作成・変更・取消 |
| `schema.skype.com/HyperLink` | 98 | リンク |
| `schema.skype.com/Reply` | 13 | 引用返信（`<blockquote>`） |
| `schema.skype.com/Emoji` | 10 | 絵文字 |

タグは `p` `br` `span` `div` `a` `img` `strong` `b` `u` `blockquote` `ul/li` `table` `video` だけで、サニタイズすれば Cairn の HTML 本文に変換できる。

### 3.5 JSON 文字列のプロパティ

| プロパティ | 件数 | 主なキー |
|---|---:|---|
| `files` | 801項目 | `fileName` `fileType` `fileInfo.shareUrl`（1drv.ms）`fileSize`（299件だけ）`isUploadError` |
| `links` | 451項目 | `url` `preview.title` `preview.description` `preview.previewurl` |
| `meeting` | 296件 | `meetingtitle` `location` `scheduledmeetinginfo.{startTime,endTime,iCalUID,isCancelled,eventType}` |
| `pinned` | 3,413件 | `creatorId`（145件だけ値あり）`pinnedTime`。意味は未確認 |

## 4. 各項目の保持状況（検証結果）

### 4.1 投稿者

ユーザーの投稿 6,279件の内訳:

| 状態 | 件数 | 割合 |
|---|---:|---:|
| `from` に MRI がある（エクスポートした本人） | 870 | 14% |
| `from` なし・`displayName` あり（本人の連絡先） | 3,500 | 56% |
| **`from` も `displayName` もない** | **1,909** | **30%** |

- 会話の `members` は MRI ではなく表示名で、本人は `Export Owner`、連絡先にいない人は `Unknown User` になる。379件中200件が `Unknown User`。40人のコミュニティでは25人が `Unknown User`
- 実名で出てくるのは14人で、同時にエクスポートした「連絡先」CSV の14人と一致した。**エクスポートは本人の連絡先にいない人を匿名化する**と判断した
- 匿名の投稿は人ごとの区別もできない（「Unknown User A」「B」に分けられない）
- 投稿者の手がかりは、メッセージ以外の場所には残っている:
  - `deltaEmotions[].users[].mri`: リアクションした人の MRI。34人分あり、`emotions` と `(key, time)` で結合すると全員の表示名（または `Unknown User`）と対応した
  - `ThreadActivity` の本文: メンバー追加などの MRI が43人分
  - `qtdMsgs[].sender`、`pinned.creatorId`
- 回復できるもの:
  - メッセージ ID は Teams 全体で一意で、Web 版のキャッシュ（IndexedDB）から取った ID と1,924件すべて一致した。キャッシュから取り出したデータで、最大の会話の匿名投稿1,519件のうち740件の投稿者が分かる（キャッシュに残っていた期間だけ）
  - **複数の参加者がそれぞれエクスポートすれば**、各自の連絡先の分だけ投稿者が分かる。メッセージ ID で重ね合わせられる（§8 未確認）

### 4.2 スレッド

- `parentMessageId` `replyChainId` にあたる項目はない。コミュニティの「投稿」と「返信」は同じ一覧に時系列で並ぶ
- 投稿の手がかりは `properties.subject`（155件）とイベントカード（296件）だけで、返信がどの投稿へのものかは分からない
- 引用返信（13件）は `qtdMsgs` で引用元のメッセージ ID が分かる

### 4.3 編集・削除

- 編集: 629件に `edittime` がある。**本文は最新版だけで、編集前の本文はない**
- 削除: 195件に `deletetime` があり、本文はすべて空（191件は `hardDeleteReason`）。取り込まない
- `version` が `id` と違うもの（作成後に更新された）は 2,554件。リアクションも含むので編集の判定には使えない

### 4.4 リアクション

- 1,710グループ、のべ 2,347件。種類は Teams の名前（`like` 1,349 / `heart` 153 / `surprised` 39 / `laugh` 35 / `bow` 24 …）で、Unicode 絵文字への変換表が要る
- `emotions` の表示名は 1,107件が `Unknown User`。ただし `deltaEmotions` に MRI があり、人ごとに区別できる。**本文の投稿者よりリアクションのほうが復元しやすい**

### 4.5 メンション

- `properties.mentions` はない。本文の `<span itemtype=".../Mention">` の文字列だけ
- **匿名化されるのは投稿者と members だけで、メンションの文字列には連絡先にいない人の実名も残る**（個人情報として扱う）
- 誰へのメンションかは名前の照合で推定するしかない

### 4.6 メディアとメッセージの紐づけ

- `amsreferences`（725種類）のうち722が `media/` のファイルと一致した
- 本文の `<img|video src>` の AMS ID（381種類）のうち378が一致した
- どのメッセージからも参照されないメディアが8件ある（プロフィール画像・会話アイコンなどと推測、未確認）
- 参照しているメッセージは、グループ 582件・1対1 16件

### 4.7 添付ファイル（PDF など）

- 801項目（PDF 715 / 画像 60 / Office 19 / txt 5 / mov・zip 各1）。**実体はエクスポートに含まれず**、1drv.ms の共有リンク（773件）か graph.microsoft.com（6件）だけ
- アップロードに失敗した添付（`isUploadError`）が15件ある
- リンクは投稿者の OneDrive を指す。コミュニティ廃止後も有効かは未確認

### 4.8 イベント

- イベントカード 296件（iCalUID 294種類）のうち286件が「共有予定表のイベント」エクスポート（292件）の iCalUID と一致した
- 予定表側には件名・期間・場所しかない。カードの位置から、どのメッセージがイベントの告知かは分かる。ただし §4.2 のとおり、返信の範囲は分からない

## 5. Cairn のスキーマとの対応

| Teams | Cairn | 変換 | 移行 |
|---|---|---|---|
| グループ / コミュニティ会話 | `channels`（`type='workspace'`）または `projects` ＋メインチャンネル | 会話名 → チャンネル名 | ◎ |
| 1対1チャット | `channels`（`type='dm'`） | 相手の同意が要る（§6.4）。MVP では対象外 | △ |
| 会議チャット | `channels` | 件数が少ない。MVP では対象外 | △ |
| メッセージ本文 | `messages.content`（`message_type='html'`） | HTML のサニタイズ。メンションは `<@userId>` か `@名前` | ◎ |
| 投稿日時 | `messages.created_at` | そのまま | ◎ |
| 投稿者 | `messages.sender_id`（NOT NULL、`profiles` を参照） | 仮メンバー（§7.3）。匿名の投稿は「不明な投稿者」の仮メンバー1人にまとめる | △ |
| 編集日時 | `messages.updated_at` | 履歴は持てない | △ |
| 返信 | `messages.parent_message_id` | 元データにない（引用返信13件だけ） | × |
| リアクション | `message_reactions`（`user_id` NOT NULL、`emoji` text） | Teams の名前 → Unicode。反応した人も仮メンバー | ○ |
| 画像・動画 | `files` ＋ `message_attachments` | 通常のアップロード経路（finalize）を通す。mp4 は `ALLOWED_MIME_TYPES` にないので現状は不可 | ◎（動画2件を除く） |
| 添付ファイル（リンク） | `files`（`file_type='link'`）か本文のリンク | 実体は利用者が別途ダウンロードして登録 | △ |
| URL プレビュー | 本文のリンク | プレビューは取り込まなくても困らない | ○ |
| イベントカード | `projects`（`start_date` `end_date` `location`） | iCalUID で予定表エクスポートと統合 | ○ |
| `ThreadActivity`・通話 | `messages`（`message_type='system'`）か取り込まない | MVP では取り込まない | — |
| members（表示名） | 仮メンバーの候補 | `Unknown User` は人数だけ分かる | △ |

## 6. 制約・リスク

### 6.1 データ損失

- 匿名投稿 30% の投稿者、スレッド構造、編集履歴、添付ファイルの実体、メンションの対象 ID は、このエクスポートからは戻せない
- 2件の mp4 は今の添付の制限で登録できない

### 6.2 重複

- **同じエクスポートの再実行**: 「外部ソース＋会話 ID＋メッセージ ID」をキーに冪等にする。取り込み元の ID を持つ対応表（例: `import_external_refs(workspace_id, source, external_id, entity, entity_id)`、`unique(workspace_id, source, external_id)`）か、決定的な UUID（UUID v5）を使う
- **複数人のエクスポートの重ね合わせ**: メッセージ ID が共通なので、同じキーで投稿者の情報だけを補える
- **既存プロジェクトとの重複**: イベントは iCalUID で、すでに手作業で作ったプロジェクトとはタイトル・日付で候補を出し、利用者に選んでもらう
- メディアは同じ AMS オブジェクトを複数のメッセージが参照することがある（参照 729件・種類 725）。ファイルは1回だけアップロードして、`message_attachments` で共有する

### 6.3 ユーザーマッピング

- Cairn の `messages.sender_id` と `message_reactions.user_id` は NOT NULL で `profiles` を参照する。参加前の人の投稿を入れるには、ログインできない仮メンバー（`profiles.kind` に新しい種類を足す。`bot` が前例）が必要
- 対応づけの手がかりは、表示名（連絡先の人）・MRI（本人・リアクション・システムメッセージ）・メンションの文字列。名前の重複や表記ゆれ（姓名の順、全角・半角、ローマ字）があるので、自動では候補を出すだけにして、確定は管理者が行う
- 本人の参加後に仮メンバーから本人へ引き継ぐ。投稿などの参照をすべて付け替えるか、仮メンバーを本人に結びつけるかを決める必要がある

### 6.4 権限・プライバシー

- **取り込みを実行できるのは workspace の owner / admin だけ**にする（権限はワークスペースロールだけで決める規約）
- 仮メンバーは `active_workspace_members` に入れない。認可・Storage RLS・Realtime の対象外になり、「非活性メンバーは未所属と同等」の規約と整合する
- **1対1チャットは相手との私的な会話**なので、workspace の他メンバーに公開しない。MVP では取り込まない
- 匿名化された人の投稿も、本人の同意なく新しいサービスに移る。取り込み画面で「参加者に移行を知らせたか」を確認する文言を出し、公開範囲（非公開チャンネル・アーカイブ）を選べるようにする
- メンションの文字列には実名が残る（§4.5）
- `endpoints.json` の鍵、`invites.json` の招待リンクは読み込まない。ZIP ごとアップロードする方式にすると、これらがサーバーに渡る

### 6.5 運用

- メッセージの取り込みは API を通さないので、通知（Inngest）は発火させない。過去の投稿が大量のメンション通知になるのを防ぐため
- 画像 730件・604MB は、ストレージ容量の計上とプランの上限にかかる。取り込み前に必要な容量を見せる

## 7. MVP インポーターの設計案

### 7.1 方針

1. **解析はブラウザで行う**。`messages.json`（数MB）だけを読み、`endpoints.json` などはアップロードしない。会話本文をサーバーに一括で送らず、選んだ会話だけを送る
2. **共通の中間形式**（§7.4）に変換してから取り込む。Teams 専用の処理は変換部分だけにする
3. **メディアは通常のアップロード経路**（署名付き URL → finalize）を1件ずつ通す。サムネイル・検索インデックス・容量計上が普段どおり動く
4. 取り込みは Inngest のジョブで、会話ごとに1トランザクション。冪等で、途中で止まっても再実行できる

### 7.2 流れ

1. owner / admin が「Teams から取り込む」を開き、展開したフォルダ（または ZIP）を選ぶ
2. ブラウザで解析して、会話の一覧（種類・件数・期間・参加人数）と、投稿者が分からない投稿の割合を表示する
3. 取り込む会話を選ぶ。初期値はグループ / コミュニティだけで、1対1と会議は外しておく
4. 参加者の対応づけ: 表示名・MRI ごとに「既存メンバー」「仮メンバーを作る」「取り込まない」を選ぶ。`Unknown User` の投稿は「不明な投稿者」1人にまとめる
5. 取り込み先: 会話ごとに「新しいチャンネル」か「プロジェクト」。イベントカードからプロジェクトを作るかどうかも選ぶ（予定表エクスポートがあれば日付・場所を補う）
6. 確認画面（件数・必要な容量）→ 実行 → 進捗の表示 → 結果のレポート（取り込めなかった添付・動画の一覧）
7. 仮メンバーごとに招待リンクを発行する。参加時に仮メンバーから本人へ引き継ぐ

### 7.3 DB への影響（実装時に決める）

- `profiles.kind` に仮メンバーを表す種類を追加する（`auth.users` なし、`workspace_members` に入れない）
- 取り込み元の対応表（`import_external_refs`）と、取り込みジョブの状態テーブル
- 引き継ぎ方式（参照の付け替えか結びつけか）
- 動画を添付として認めるか（`ALLOWED_MIME_TYPES`）

### 7.4 共通インポート形式（Slack / Discord と共用）

JSON Lines を想定する。1行1レコードで、`type` で種類を分ける。ID はすべて取り込み元のもので、Cairn の ID への変換は取り込み側で行う。

```jsonc
{"type":"source","platform":"teams-consumer","exportedAt":"2026-11-05T00:00:00Z","exporter":"u:owner"}
{"type":"user","ref":"u:owner","displayName":"架空 太郎","externalIds":["8:live:…"],"email":null,"confidence":"exact"}
{"type":"user","ref":"u:unknown","displayName":"不明な投稿者","anonymous":true}
{"type":"conversation","ref":"c:1","kind":"group","name":"…","memberRefs":["u:owner","u:2"],"memberCount":40}
{"type":"message","ref":"m:1760000000000","conversationRef":"c:1","parentRef":null,"senderRef":"u:unknown",
 "sentAt":"2026-01-01T00:00:00Z","editedAt":null,"body":{"format":"html","value":"<p>…</p>"},
 "mentions":[{"userRef":null,"text":"架空"}],"quoteRef":null}
{"type":"reaction","messageRef":"m:1760000000000","userRef":"u:2","emoji":"👍","sourceKey":"like","at":"…"}
{"type":"attachment","messageRef":"m:1760000000000","kind":"media","path":"media/0-wus-….1.jpeg","mime":"image/jpeg","size":12345}
{"type":"attachment","messageRef":"m:…","kind":"external","url":"https://…","fileName":"計画書.pdf","note":"not included in export"}
{"type":"event","ref":"e:<iCalUID>","messageRef":"m:…","title":"…","start":"…","end":"…","allDay":true,"location":"…"}
```

| 取り込み元 | 投稿者 | スレッド | 添付 | 備考 |
|---|---|---|---|---|
| Teams 個人用 | 本人と連絡先の人だけ（他は匿名） | なし | メディアは同梱、ファイルはリンク | 本書 |
| Slack（標準エクスポート） | `users.json` の ID・メール（有料プランならメールあり） | `thread_ts` | `url_private`（トークンが要る） | `senderRef` にユーザー ID が入るので対応づけは確実 |
| Discord（DiscordChatExporter など） | ユーザー ID・名前 | `reference`（返信先） | CDN の URL（期限付き） | 公式のエクスポートはない |

形式に `anonymous` `confidence` `kind: external` を持たせておけば、Teams のような欠けたデータも Slack のような完全なデータも同じ取り込み処理で扱える。

## 8. 未確認事項

- ZIP の元の形（約700MB と展開後 612MB の差。圧縮前後の違いか、含まれないファイルがあるか）
- 他の参加者のエクスポートで、その人の連絡先が実名になるか（複数人のエクスポートで投稿者を補えるか）
- 連絡先でも `from`（MRI）が入らない理由と、データ形式が今後変わるか
- 1drv.ms のリンクがコミュニティ廃止後も開けるか。投稿者以外がダウンロードできるか
- 参照されないメディア8件の正体
- `pinned`（3,413件）と `consumptionhorizon` の意味
- 2025-05-01 より前の会話が切れているのか、最初からないのか
- 1対1チャットの扱いについて、法令（電気通信事業法の通信の秘密）上の確認が要るか（DM の法令対応は `../telecom-business-filing-research.md`）
