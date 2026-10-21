# アプリ（プラグイン）基盤 設計書 — 第1段階

作成日: 2026-10-21
ステータス: 構想・設計段階（未実装。第1段階の論点は 2026-10-21 に決定済み → §11）

調整さん・アンケート・装備管理のような機能を Cairn 本体へ個別に作り込まず、**「Bot 送信者 + カード型メッセージ + インタラクションのコールバック」という汎用の仕組みに載る「アプリ」**として作るための基盤。第1段階では、既に設計済みのアプリ内投票（[`scheduled-jobs-design.md`](./scheduled-jobs-design.md) §5.3〜§7）を**ファーストパーティのアプリとして**この基盤の上に作り、基盤を自分で使いながら固める。

## 1. 位置づけと3段階

| 段階 | 内容 | 本書での扱い |
|---|---|---|
| **1. 基盤 + 投票アプリ** | アプリ登録・インストール、Bot、Block Kit 互換カード、インタラクション。最初の利用者はファーストパーティの投票アプリ | **本書の範囲** |
| 2. Slack 互換 API の公開 | 同じ基盤を外部へ公開する。全互換ではなく、Bolt for JS アプリが API の向き先差し替えだけで動く最小限 | §9 で範囲だけ示す |
| 3. 「Cairn でログイン」（OIDC） | 外部アプリ（最初は Cloudflare 上の PWA で作る装備管理）が Cairn のユーザーとして利用者を識別する | §10 で位置づけだけ示す |

設計の軸:

- **ワイヤフォーマットは最初から Slack に合わせる**。カードは Block Kit のサブセット、インタラクションは Slack と同じペイロード形と署名（`X-Slack-Signature` v0）。第2段階で「中身を作り直す」のではなく「外へ開ける」だけにする
- **ファーストパーティでも近道しない**。投票アプリは Cairn 内部の関数を直接呼ばず、外部アプリと同じ経路（署名付き HTTP、Bot として投稿・更新）を通る。近道すると第2段階で初めて基盤の欠陥が見つかる
- **描画できるものだけを受け付ける**。サーバーは Web とネイティブの両方が描画できるブロックだけを受理する（§4.4）。バージョン連動の負担はこの規律で抑える

### 既存設計との関係

| 既存文書 | 関係 |
|---|---|
| [`scheduled-jobs-design.md`](./scheduled-jobs-design.md) | 投票のデータモデル・権限・登山本部ユースケースは引き継ぐ。**`message_type` に `poll` を足す案は、汎用の `blocks` に置き換える**（§4.1）。定期ジョブの「Bot 送信者」は投票アプリの Bot になる（§7.4） |
| [`10_ai_member_design.md`](./10_ai_member_design.md) | 未決事項「`auth.users` に紐づかない送信者の認証・RLS」は、本書の Bot profile（§3.2）で先に解く。AI メンバーも将来は同じ Bot 機構に載せられる。Stage 2 の「承認カード」はカード型メッセージで描ける |
| [`mcp-server-design.md`](./mcp-server-design.md) | MCP の OAuth / PAT は**人間本人の代理**で、`resource` が `/api/mcp` に固定され REST の資格情報にならない。Bot トークンは**アプリ自身の身元**で、別系統として新設する（§3.3）。MCP の資格情報を流用しない |

## 2. 用語

| 用語 | 意味 | Slack の対応 |
|---|---|---|
| **アプリ** | 登録された外部（またはファーストパーティ）のプログラム。名前・アイコン・Request URL・署名シークレット・要求スコープを持つ | App |
| **インストール** | アプリをワークスペースへ導入した状態。ワークスペースごとに Bot と Bot トークンを持つ | Installation |
| **Bot** | インストールごとに作られる送信者 profile。人間のメンバーではない | Bot user |
| **カード** | `blocks`（Block Kit のサブセット）を持つメッセージ | Block Kit message |
| **インタラクション** | カードのボタン押下・選択、モーダル送信などを、アプリの Request URL へ通知すること | Interactivity |
| **モーダル** | アプリが開く入力フォーム（`view`） | Modal (views) |

## 3. アプリの登録とインストール

### 3.1 データモデル

```ts
apps {
  id
  slug            text unique          // 'polls' など
  name, description, iconUrl
  ownerWorkspaceId → workspaces null   // null = ファーストパーティ（全ワークスペースへ提供）
  requestUrl      text                 // Interactivity の送信先（https のみ）
  signingSecretEncrypted text          // HMAC に平文が要るため hash ではなく暗号化保存
  requestedScopes text[]               // 'chat:write' 等
  entryPoints     jsonb                // 作成メニューへの項目（§6.1）
  createdBy, createdAt, updatedAt
}

app_installations {
  id
  appId          → apps (cascade)
  workspaceId    → workspaces (cascade)
  botProfileId   → profiles  unique     // §3.2。1つの Bot profile を複数のインストールで共有させない
  grantedScopes  text[]
  installedBy    → profiles
  installedAt, revokedAt
  unique(appId, workspaceId)
}

app_bot_tokens {
  id
  installationId → app_installations (cascade)
  tokenHash      text unique            // SHA-256。平文は発行時に一度だけ表示（PAT と同じ）
  tokenEncrypted text null             // ファーストパーティだけ。自動プロビジョニングで平文を受け取る人がいないため（§3.3）
  tokenPrefix    text
  lastUsedAt, revokedAt, createdAt
}

app_channel_memberships {               // Bot が投稿できるチャンネル
  installationId → app_installations (cascade)
  channelId      → channels (cascade)
  workspaceId                           // 複合 FK で installation とチャンネルの両方に一致させる（§3.3）
  addedBy        → profiles
  createdAt
  primary key(installationId, channelId)
}
```

- 署名シークレットは既存の `apps/web/src/lib/token-crypto.ts`（`connected_accounts` のトークン暗号化）で暗号化して保存する。Bot トークンは検証だけでよいので hash 保存
- ファーストパーティかどうかは `ownerWorkspaceId is null` で決める（専用のフラグは持たない）
- `requestUrl` の https 限定はアプリ側で検証する（開発環境の例外は §5.4。DB では縛らない）。`requestUrl` があるのに署名シークレットがない行は DB の CHECK で拒否する
- ファーストパーティの投票アプリは全ワークスペースに既定でインストール済みにする（§11 D7）。マイグレーションでは適用時点のワークスペースにしか作れないため、`apps` 行・installation・Bot profile の作成は冪等な `ensureFirstPartyInstallations(workspaceId)` に一本化し、**ワークスペース作成処理から呼ぶ**。既存ワークスペースはデプロイ後に同じ関数で backfill し、インストール一覧・作成メニューの表示時にも同じ関数で欠けを補う（遅延初期化）。署名シークレットは環境変数から暗号化して入れるため SQL では作らない。Bot のチャンネルへの追加は手動

### 3.2 Bot profile

`profiles.id` は `auth.users.id` の写しだが FK は張られていないため、**`auth.users` を作らずに Bot 用の profile 行を作れる**。

- `profiles` に `kind text not null default 'human' check (kind in ('human','bot'))` を足す。Bot の profile は `app_installations.botProfileId` から1対1で参照され、`botProfileId` の一意制約で DB に強制する
- **Bot は `workspace_members` に入れない**。入れるとワークスペースロールを持ち、`active_workspace_members` を通る既存の認可（AGENTS.md の「権限はワークスペースロールだけで決める」）に Bot が紛れ込む。Bot は「ロールを持たない別種の主体」として扱い、権限はスコープ + `app_channel_memberships` だけで決める
- **Bot は `channel_members` にも入れない**。未読・メンバー一覧・通知・メンション候補など `channel_members` を人間前提で読むクエリが多く、混ぜると影響範囲を追い切れない。チャンネルヘッダーのメンバー表示などで Bot を見せる場合は `app_channel_memberships` を別に引く
- インストールを取り消しても Bot profile は消さない（過去のメッセージの送信者表示が壊れるため）。`revokedAt` で投稿・更新を止め、表示は「（アンインストール済み）」を添える
- 送信者表示（名前・アイコン・「アプリ」バッジ）は profile とアプリ定義から引く。人間と取り違えないよう、Web・ネイティブとも Bot の発言には必ずバッジを付ける（[`10_ai_member_design.md`](./10_ai_member_design.md) §6「AIであることを明示する」と同じ原則）

**実装時の注意**: メッセージ一覧は送信者の profile・ワークスペース属性・プロジェクトロールを JOIN して返している（`get-messages.ts`）。Bot はワークスペース属性を持たないので、INNER JOIN で Bot のメッセージが落ちないか、profile の RLS が「同じワークスペースのメンバー」で絞っていて Bot の profile が読めなくならないかを確認する。

### 3.3 Bot トークンと認可

- **ファーストパーティのトークン**: 自動プロビジョニングされる投票アプリには平文を控える人がおらず、hash だけではプロセス再起動後に Bot API を認証できない。ファーストパーティのインストールに限り `app_bot_tokens.tokenEncrypted` に token-crypto で暗号化した平文も保存し、投票アプリは installation ID から復号して使う。外部アプリのトークンは従来どおり hash のみ（暗号化平文を持たせない）
- 形式は `cairn_bot_<random>`。Slack の `xoxb-` は使わない（GitHub の secret scanning が Slack トークンとして誤検知・誤通報するため）。Bolt / `@slack/web-api` がトークンの接頭辞に依存しないかは第2段階で確認する（依存していれば互換モードで `xoxb-` 形式も発行する）
- Bot トークンで認証された API 呼び出しは、人間のセッション・MCP の AsyncLocalStorage context とは**別の「アプリ主体」context** で処理する。人間用の Route Handler をそのまま通さず、アプリ API 用の薄い層から `packages/core` のユースケースを呼ぶ
- 認可の判定:
  - インストールが有効（`revokedAt is null`）、トークンが有効
  - 要求操作に対応するスコープを `grantedScopes` に持つ
  - チャンネルを伴う操作は、そのチャンネルが `app_channel_memberships` にあり、かつチャンネル自体がアーカイブ・削除されていない
  - **installation とチャンネルのワークスペースが一致する**。両方のワークスペースに所属するメンバーが、A のインストールを B のチャンネルへ関連付けると A の Bot トークンで B へ投稿できてしまうため、`app_channel_memberships` に `workspace_id` を持たせ、`(installation_id, workspace_id)` → `app_installations(id, workspace_id)` と `(channel_id, workspace_id)` → `channels(id, workspace_id)` の複合 FK で DB に固定する。旧プロジェクトチャンネルとその子スレッドには `channels.workspace_id` が null の行が残り得る（既存コードは `coalesce(channels.workspace_id, projects.workspace_id)` で補っている）ため、FK を張る前に `projects` → 親チャンネルの順で backfill する。Bot API 実行時も同じ一致を検証する（`message_blocks` を書く `chat.update` も、対象メッセージのチャンネルのワークスペースで照合する）
  - DM（`channel_type = 'dm'`）へは第1段階では投稿させない
- 呼び出し回数の上限はトークン単位で毎分120回（PAT と同じ仕組み・同じ値）

### 3.4 スコープ（第1段階）

名前は Slack に合わせる。第1段階で使うのは次の3つだけ。

| スコープ | 許す操作 |
|---|---|
| `chat:write` | Bot が参加しているチャンネルへのカード投稿・自分の投稿の更新・削除、モーダルの open / update |
| `users:read` | ワークスペースの active メンバーの基本情報（ID・表示名・アイコン）の参照 |
| `channels:read` | Bot が参加しているチャンネルの情報・メンバー一覧の参照 |

- インタラクションの受信はスコープではなく Request URL の登録で有効になる（Slack と同じ）
- **ゲスト・private チャンネルの扱い**: `users:read` で返すメンバーは active のみ（非活性メンバーは未所属と同等）。`channels:read` のメンバー一覧は、Bot が参加しているチャンネルに限る

### 3.5 誰が何をできるか

| 操作 | 権限 |
|---|---|
| アプリのインストール・アンインストール・スコープ承認 | owner / admin |
| Bot をチャンネルへ追加・外す | そのチャンネルにアクセスできる member 以上（private チャンネルは参加者）。追加・削除は `audit_logs` に残す |
| カードのボタン・選択・モーダル操作 | そのチャンネルを読めるメンバー（ゲスト含む）。非活性メンバーは不可 |
| 外部アプリの登録（`ownerWorkspaceId` 付き） | 第2段階。第1段階はファーストパーティのみ |

UI は `/settings/apps`（インストール一覧・スコープ・Bot トークン再発行）。設定 URL 駆動の規約どおり `SETTINGS_NAV_GROUPS` に追加する。

## 4. カード型メッセージ（Block Kit サブセット）

### 4.1 保存形式

- `message_type` enum に **`blocks`** を足す（[`scheduled-jobs-design.md`](./scheduled-jobs-design.md) の `poll` 案は採らない。投票は blocks を使う1アプリに過ぎない）
- `messages.content` には Slack の `text` に当たる**代替テキスト**を入れる。通知・Push・検索・引用・未対応クライアントの表示に使う。必須
- ブロック本体は別テーブルに置く:

```ts
message_blocks {
  messageId      → messages (cascade) primary key
  installationId → app_installations (cascade)  // インストールは取り消しで止め、行は消さない
  blocks         jsonb                 // 検証済みの Block Kit サブセット
  schemaVersion  integer               // §4.4
  updatedAt                             // chat.update の時刻
}
```

`messages` へカラムを足さず別テーブルにする理由は `message_project_updates` と同じ（マイグレーション前に新コードが動く時間に、通常の投稿 INSERT まで失敗させない）。

**`chat.update` で `messages.updated_at` を動かさない**。現行の `isEdited` は `updatedAt > createdAt` で決まるため、票が入るたびに「編集済み」が付いてしまう。カードの更新は `message_blocks.updatedAt` だけを動かす。

### 4.2 対応するブロック・要素

| 種別 | 対応 | 備考 |
|---|---|---|
| `section` | ○ | `text`（mrkdwn / plain_text）、`fields`（最大10）、`accessory`（button / static_select / image） |
| `actions` | ○ | 要素は `button`、`static_select`。最大25要素 |
| `context` | ○ | 要素は text / image。最大10要素。投票者の表示に使う |
| `image` | ○ | `image_url`（https のみ）、`alt_text` 必須、`title` 任意 |
| `divider` / `header` | ○ | 描画が単純で、投票カードの見出しに使うため含める |
| `input`（モーダル内のみ） | ○ | 要素は `plain_text_input`（単行・複数行）、`static_select` |
| `button` | ○ | `text` / `action_id` / `value` / `style`(primary・danger) / `url` / `confirm`（確認ダイアログ） |
| `static_select` | ○ | `options`（最大100）、`initial_option`、`placeholder`。`option_groups` は後続 |
| `rich_text`, `multi_*_select`, `users_select`, `datepicker`, `checkboxes`, `radio_buttons`, `overflow`, `video`, `file` | × | 後続。日程調整（調整さん相当）で `datepicker` / `checkboxes` が要るなら次の拡張候補 |

- 上限は Slack に合わせる（メッセージ50ブロック・モーダル100ブロック、テキスト3000文字、`action_id` 255文字、`value` 2000文字）
- **mrkdwn は Cairn の Markdown とは別物**として扱う（`*太字*`・`_斜体_`・`~取り消し~`・`` `code` ``・`<url|表示>`・`<@userId>`・改行）。共通のパーサーでトークン列にし、各プラットフォームはトークン列を描くだけにする。書式記号の前後が単語の続きかは ASCII の英数字だけで判定する（Slack と同じく `snake_case` や `2*3*4` は崩さず、日本語の `これは*太字*です` は太字にする）
- `<@userId>` のメンションは Cairn の canonical 形式（`lib/chat/mentions.ts`）と同じ記法なので、そのまま解決して表示する。ID 体系の Slack 対応は §9

### 4.3 描画方針（Web とネイティブ）

チャット画面は Web（`apps/web`、Electron も同じ）とネイティブ（`apps/mobile` のチャットは React Native 実装）の2系統あるため、カードの描画も2系統になる。**二重実装の範囲を「見た目」だけに絞る**。

```
packages/shared/src/blocks/
  schema.ts        Zod スキーマ（サブセットの定義そのもの。サーバーの受理判定にも使う）
  mrkdwn.ts        mrkdwn → トークン列
  normalize.ts     blocks → 描画用の中間表現（上限の切り詰め、未対応要素の判定、URL 検証）
  fixtures.ts      代表的なカード（投票カード、全要素入り、未対応要素入り…）。`@cairn/shared/blocks/fixtures` から読み、本体の bundle には含めない

apps/web/src/components/app/blocks/      DOM で描く（Tailwind / 既存の UI 部品）
apps/mobile/components/blocks/           React Native で描く
```

- 検証・mrkdwn・正規化・未対応判定は `packages/shared` に1つだけ置き、両プラットフォームで同じ結果になるようにする。各プラットフォームに残るのは中間表現 → 部品の写像だけ
- `fixtures.ts` を Web とネイティブ双方のテストで読み、「全 fixture を例外なく描ける」「未対応要素は代替表示になる」を両方で確かめる。サブセットに要素を足すときは fixture を足し、片方の描画漏れをテストで落とす
- ネイティブのカード描画は**純 JS（既存依存の範囲）で書き、ネイティブモジュールを足さない**。これで `runtimeVersion` を上げずに EAS Update で配信できる。select は既存の ActionSheet / モーダル部品、画像は既存の画像表示部品を使う
- ネイティブで WebView にカードを描かせる案は採らない。メッセージリスト内の WebView は高さ計測・スクロール性能・タップの受け渡しが悪く、カードが多いチャンネルで破綻するため
- モーダルは Web ではダイアログ、ネイティブではシート（チャットはネイティブ実装なので WebView に逃がさない）

### 4.4 バージョン連動の負担を抑える規律

Web は deploy で全員が即座に新しくなるが、ネイティブは EAS Update が届くまで古い描画コードが残り、ストア版の `runtimeVersion` が古い端末には OTA 自体が届かない。サーバーが受理するブロックと、手元のクライアントが描けるブロックがずれる前提で設計する。

1. **受理するのは描けるものだけ**: サーバーは `packages/shared` のスキーマに合わない blocks を `chat.postMessage` / `chat.update` / `views.open` の時点で `invalid_blocks` エラーにする（Slack と同じ挙動）。未知の要素を保存して「クライアント任せ」にしない
2. **描画を先に、受理を後に**: サブセットに要素を足すときは、(a) Web とネイティブの描画を出す → (b) production へ OTA を配信し行き渡りを待つ → (c) `FEATURE_FLAGS` で受理を有効にする、の順にする。`schemaVersion` を `message_blocks` に記録し、どの版のスキーマで受理したかを追えるようにする
3. **それでも描けないものは黙って消さない**: 古いクライアントが未知の要素に出会ったら、その要素の位置に「このカードの一部はこのバージョンのアプリでは表示できません。アプリを更新してください」を出し、カード全体が描けない場合は代替テキスト（`content`）を表示する。空白や要素の欠落で済ませない（エラーを隠さない規約）
4. **操作は常にサーバーが検証する**: 古いクライアントが送った操作でも、サーバーが保存済みの blocks と照合して判定する（§5.2）ので、描画のずれが不正な操作にはつながらない

## 5. インタラクション

### 5.1 流れ

```
[利用者がボタンを押す（Web / ネイティブ）]
   ▼ POST /api/app-interactions   { messageId, blockId, actionId, selectedOptionValue? }（人間のセッションで認証）
     selectedOptionValue は static_select のときだけ。どの選択肢かを示す識別子で、保存済み blocks で検証する
[Cairn: 検証]
   - 利用者がチャンネルを読める active メンバーか
   - message_blocks に該当の block_id / action_id があるか、value は保存済み blocks から取る
   - static_select は selectedOptionValue が保存済みの options にあるか（無ければ 400）。選択肢のラベルはサーバーが blocks から引く
   - インストールが有効か
   - Bot がそのチャンネルにまだ参加しているか（app_channel_memberships）。外された後の古いカードは押しても配送せず、
     「このアプリはチャンネルから外されています」を表示する（配送して票だけ commit され、chat.update が not_in_channel で失敗し表示とずれるのを防ぐ）
   ▼ Slack 互換の block_actions ペイロードを組み立て、署名して POST
[アプリの Request URL]  3秒以内に 200 を返す
   ▼ （アプリ側）chat.update / response_url / views.open で応答
[Cairn: message_blocks 更新 → Broadcast → クライアントが再取得]
```

- **クライアントが送るのは「どの要素か」と、static_select ならどの選択肢か、だけ**。ボタンの `value` やラベルはクライアントから受け取らず、サーバーが保存済みの blocks から引く。select の選択値も保存済みの options と照合してから届ける。改ざんした値をアプリへ届かせない
- クライアントは押下後、該当ボタンを処理中表示にする。アプリからの更新（Broadcast）で解除し、タイムアウトやアプリのエラーは**ボタンの下にエラーを表示**する（サイレントに戻さない）

### 5.2 ペイロード（Slack 互換）

Slack と同じく `application/x-www-form-urlencoded` の `payload=<JSON>` で送る。主なフィールド:

```jsonc
{
  "type": "block_actions",
  "team":    { "id": "<workspaceId>", "domain": "<workspace slug>" },
  "user":    { "id": "<userId>", "name": "<表示名>", "team_id": "<workspaceId>" },
  "api_app_id": "<appId>",
  "token": "",                        // 非推奨の verification token は送らない
  "container": { "type": "message", "message_ts": "<ts>", "channel_id": "<channelId>" },
  "channel": { "id": "<channelId>", "name": "<チャンネル名>" },
  "message": { "ts": "<ts>", "text": "<代替テキスト>", "blocks": [ ... ] },
  "trigger_id": "<一時ID>",           // モーダルを開くため。3秒で失効
  "response_url": "https://<host>/api/app-response/<一時ID>",
  "actions": [{ "type": "button", "block_id": "...", "action_id": "...", "value": "...", "action_ts": "..." }],
  "cairn": { "message_id": "<uuid>", "interaction_id": "<uuid>" } // Cairn 独自の拡張。Slack アプリは無視する
}
```

ID の表現（`ts`・`team.id`・`user.id` を UUID のまま出すか、Slack 風に変換するか）は第2段階の論点だが、**投票アプリが第2段階で書き直しにならないよう、第1段階でも Slack と同じフィールド名に値を入れる**。第1段階は UUID をそのまま入れ、`cairn.*` にも UUID を併記する。投票アプリは `cairn.*` だけを読む（§11 D3）。

モーダルの `view_submission` / `view_closed`、作成メニューからの起動（§6.1）も同じ形で送る。

### 5.3 署名

Slack と同じ方式にする。

- `X-Slack-Request-Timestamp: <unix秒>`
- `X-Slack-Signature: v0=<hex(HMAC-SHA256(signingSecret, "v0:" + timestamp + ":" + rawBody))>`
- アプリ側は5分より古いタイムスタンプを拒否する（リプレイ対策）。Bolt の検証ロジックがそのまま通る

ヘッダー名は `X-Slack-*` のままにする。Bolt が名前を固定で読むため、Cairn 独自名にすると互換が崩れる。

### 5.4 配送と失敗

- タイムアウトは Slack と同じ3秒。Cairn は自動リトライしない
- **配送結果は不確定になり得る前提で契約を決める**。アプリへ届いて処理された後に応答だけが失われると、Cairn からは失敗に見え、利用者がやり直す。そこで (a) 押下ごとに `cairn.interaction_id` を付け、アプリは処理済みの ID を記録して同じ ID の再送を二重に処理しない、(b) アプリはボタンの意味を**冪等**に設計する（「この選択肢に投票する」は何度押しても同じ結果。トグルにしない）。投票アプリの取り消しは別のボタンにする（§7.3）
- `app_interaction_deliveries`（installationId / type / userId / status / httpStatus / 所要ms / error / createdAt）に記録し、設定画面からアプリ管理者が直近の失敗を見られるようにする。保持期間は30日
- `requestUrl` は https のみ。登録時と送信時に、プライベート IP・ループバック・リンクローカルへの名前解決を拒否する（SSRF 対策）。ファーストパーティの投票アプリも同じ検証を通る
- 例外は開発環境だけ。ローカルの Web は `http://localhost:3128` で動き、投票アプリの Request URL も同じ origin になるため、`NODE_ENV !== 'production'` かつ環境変数 `APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL=true` のときに限り、`APP_URL` と同じ origin の http ループバックを許可する。本番・Preview では設定しても無効にする
- 失敗時（タイムアウト・非2xx・署名不備の応答）は、押した本人にだけ「アプリが応答しませんでした」を出す。カードは変えない

### 5.5 応答の手段

| 手段 | 第1段階 | 用途 |
|---|---|---|
| `chat.update`（Bot トークン） | ○ | カード全体の更新（票数の反映） |
| `response_url` への POST | 後回し | `replace_original` でカード更新。有効期限30分・5回（Slack と同じ）。投票アプリは `chat.update` を使うので、外部アプリを公開する前に足す（Bolt の `respond()` が使う） |
| `views.open` / `views.update` / `views.push` | open / update のみ | モーダル。`trigger_id` は3秒・1回限りで、押した本人・インストールに結びつける。アプリが開くと Realtime で本人のトピック（`user:<id>`）へ知らせ、クライアントが開く。`response_action: push` は重ねず差し替える。モーダル内のボタン（block_actions）と `view_closed` は後回し |
| `response_action`（view_submission の同期応答） | `errors` / `update` / `clear` | 入力エラーの表示、モーダルの差し替え |
| エフェメラル（本人だけに見える）メッセージ | × | 後続。匿名投票を出すときの前提になる |

モーダルの状態（`view_id`・`callback_id`・`private_metadata`・`hash`・開いた利用者）は `app_views` に保存し、`views.update` の `hash` で競合を検出する。送信もクライアントが描いていた `hash` を付け、一致しなければ `view_changed` で拒む（差し替え後の意味で古い入力を解釈しない）。同じモーダルの同時送信は、届ける前に `submitting_until`（15秒の確保）を1つだけ取れた送信だけを `view_submission` にする。起点のチャンネルがあるモーダルは、送る時点で送信者のチャンネルへのアクセスとアプリの投稿可否（参加・アーカイブ）を確かめ直し、だめなら `channel_unavailable` で拒む

## 6. 内部 API（Bot から使う Web API）

第1段階はファーストパーティだけが使うが、**エンドポイントと引数は Slack の Web API と同じ名前・形**にする。第2段階はこれを外部へ開けるだけにする。

| メソッド | 第1段階 | 内容 |
|---|---|---|
| `chat.postMessage` | ○ | `channel` / `text` / `blocks` / `thread_ts` / `client_msg_id`。`blocks` なしなら通常の `text` メッセージ。`client_msg_id` があればメッセージ ID に使い、同じ ID の再送は既存メッセージを返す |
| `chat.update` | ○ | 自分（同じインストールの Bot）の投稿だけ |
| `chat.delete` | ○ | 同上 |
| `views.open` / `views.update` | ○ | §5.5 |
| `users.info` | ○ | `users:read` |
| `conversations.members` | ○ | `channels:read` |
| `auth.test` | ○ | トークンの確認（Bolt が起動時に呼ぶ） |

- パスは `POST /api/app-api/<method>`（例: `/api/app-api/chat.postMessage`）。Slack の `https://slack.com/api/<method>` と同じ並びにして、Bolt の `slackApiUrl` を差し替えるだけで向き先が変わるようにする
- 応答は Slack と同じ `{ "ok": true, ... }` / `{ "ok": false, "error": "channel_not_found" }`。HTTP ステータスは常に 200（Slack の流儀）。エラーコードも Slack の名前に寄せる
- Bot の投稿も既存の `message/created` イベントへ流し、メンション通知・Push・AI インデックスは既存の `on-message-created` に任せる（通知は Inngest 経由。ローカルでは Inngest dev server が要る）
- Bot の発言（代替テキスト）はメッセージ検索・RAG インデックスに含める。AI PMO の「未回答の依頼」判定からは除外する（§11 D11）

### 6.1 アプリの起動口（作成メニュー）

投票を「手動で立てる」には、アプリを呼び出す入口が要る。Slack ではスラッシュコマンド（`/poll`）がこれに当たるが、コンポーザーでのコマンド解釈・補完は第2段階に回す（§9）。第1段階は:

- メッセージ入力欄の「＋」メニューに、インストール済みアプリの `entryPoints`（例: 「投票を作成」）を並べる
- 選ぶと、**スラッシュコマンドと同じ形のペイロード**（`command=/poll`、`channel_id`、`user_id`、`trigger_id`、`response_url`）をアプリへ送る
- こうしておけば、第2段階でコンポーザーに `/poll` の入力を足しても、アプリ側の受け口は変わらない

## 7. 投票アプリ

### 7.1 構成

- ファーストパーティのアプリ `polls`。コードは `apps/web` 内の独立したモジュール（例: `apps/web/src/first-party-apps/polls/`）に置く
- **境界は向きごとに1つ**:
  - **アプリ → Cairn**: Bot トークンでの Web API 呼び出し（HTTP）だけ。投票アプリは Cairn 本体の内部関数を import しない（ESLint の import 制限で強制する）
  - **利用者の操作 → アプリ**: 署名付きインタラクションの受信（HTTP）だけ
  - **Cairn 本体 → アプリ**（定期ジョブ・AI からの作成、§7.4）: 投票アプリの公開エントリ `first-party-apps/polls/index.ts` が export する `createPoll` だけ。Cairn 本体はそれ以外のファイルを import しない（同じく ESLint で強制）。`createPoll` の中身もアプリ → Cairn の HTTP 経路で投稿するので、本体の内部関数を直接呼ぶ近道にはならない
  - [`scheduled-jobs-design.md`](./scheduled-jobs-design.md) の `PollPort.createPoll`（`packages/core`）は置かない。この公開エントリが置き換える
- Request URL は同じデプロイの Route Handler（例: `/api/first-party-apps/polls/interactions`）。署名検証は外部アプリと同じ v0 HMAC
- 投票データは投票アプリが持つテーブル（下記）。Cairn 本体のコードは投票テーブルを読まない

### 7.2 データモデル

[`scheduled-jobs-design.md`](./scheduled-jobs-design.md) §5.3 をそのまま引き継ぎ、所有者だけを変える。

```ts
polls        { id, installationId → app_installations (cascade), channelId, messageId → messages,
               createdBy, question, allowMultiple, anonymous, closesAt?, closedAt?,
               status, idempotencyKey, clientMsgId, version, renderedVersion, createdAt
               unique(installationId, idempotencyKey) }
poll_processed_interactions { interactionId primary key, pollId (cascade), createdAt }  // 30日で削除
poll_options { id, pollId (cascade), label, position }
poll_votes   { id, pollId (cascade), optionId (cascade), userId, allowMultiple, createdAt
               unique(pollId, optionId, userId)
               部分一意 (poll_id, user_id) WHERE allow_multiple = false }
```

- `workspaceId` の代わりに `installationId` を持つ（アンインストール時の扱いを一箇所にするため）
- 1人1票の DB 強制（部分一意インデックス + `allowMultiple` の非正規化）は既存設計どおり

### 7.3 カードと集計・リアルタイム更新

カードの例（登山本部）:

```
[header]   11月の登山本部 担当決め
[section]  下山連絡の電話当番です。担当できる週に投票してください。 <@山田> <@田中>
[section]  第1週 (11/2〜) ▓▓▓░░ 2票      [accessory: button「投票」 value=option:<id>]
[context]  👤山田 👤佐藤
[section]  第2週 (11/9〜) ░░░░░ 0票      [button「投票」]
 ...
[context]  単一選択 ・ 締切 11/20 23:59 ・ 作成: 定期ジョブ
[actions]  [自分の票を取り消す] [締め切る]（作成者のみ有効）
```

- **票の受付**: `block_actions` を受けたら、`poll_votes` を1トランザクションで更新し、同じトランザクションで `polls.version` を1つ進め、処理済みの `cairn.interaction_id` を記録する。「投票」ボタンは冪等（単一選択は既存票をその選択肢に置き換え、同じ選択肢をもう一度押しても変わらない）。取り消しは `actions` の「自分の票を取り消す」ボタンで行う
- **カードの再描画は commit の後**: `chat.update` は `/api/app-api/` への別 HTTP 呼び出しで、投票のトランザクションには参加できない。トランザクション内で呼ぶと、カードだけが先に更新されて投票の commit が失敗した場合に表示と実データが食い違う。そこで commit 後に Inngest イベント（`polls/card.render`、`pollId`）を送り、**`concurrency: { key: pollId, limit: 1 }`** の関数がその時点の最新の集計からカードを描いて `chat.update` する。描画は常に commit 済みの最新状態から作るので、同時投票で順序が入れ替わっても最後の描画が最新になり、`chat.update` の失敗は Inngest のリトライで回収する。描画済みの `version` を `polls.renderedVersion` に記録し、最新版を描画済みなら skip する
- **イベント送信漏れの回復**: commit の後、Inngest へイベントを送る前にプロセスが止まると、リトライの起点そのものが無くなる。`version > renderedVersion` は commit 済みの「描画待ち」を表す outbox として働くので、Inngest cron（`polls/card.sweep`、5分ごと）が `version > renderedVersion` かつ最終更新から1分以上たった投票と、`status='pending_post'` のまま1分以上たった投票を拾い、同じ `polls/card.render` / 投稿の再開を送り直す。どちらの処理も冪等なので、通常経路と重なっても結果は変わらない。描画待ちを拾う部分索引 `(id) WHERE version > rendered_version OR status = 'pending_post'` を張る
- **リアルタイム**: `message_blocks` の UPDATE に DB トリガーを張り、`realtime.broadcast_changes()` でチャンネルの topic へ流す。クライアントは該当メッセージのクエリを invalidate して REST で再取得する（Broadcast from Database のみ。postgres_changes・ポーリングは使わない）
- **「自分の票」**: Block Kit は**全員に同じカード**を描く仕組みで、閲覧者ごとの表示を持たない（[`scheduled-jobs-design.md`](./scheduled-jobs-design.md) §6 の「自分の投票状態」はそのままでは描けない）。`context` に投票者を並べて代える（Slack の投票アプリと同じ）。**第1段階は匿名投票を出さない**（`anonymous` カラムは残すが常に false。§11 D2）
- **締切**: `closesAt` を過ぎたら Inngest の遅延関数で締め、ボタンを外したカードへ `chat.update` する。結果のサマリを投稿するかは既存の未決事項のまま

### 7.4 定期ジョブ・AI からの作成

- 投票の作成は投票アプリ内のユースケース `createPoll` に一本化し、**再試行しても同じ投票・同じメッセージに収束する**状態遷移にする:
  1. 呼び出し元が渡す冪等キー（定期ジョブは `scheduled_job_runs.id`、モーダルは `view_id`、AI は tool call ID）で `polls` を `status='pending_post'` で作る。`unique(installationId, idempotencyKey)` なので再試行は既存の行を返す。同時にメッセージ ID にする UUID（`clientMsgId`）も採番して保存する
  2. commit 後に `chat.postMessage` を `client_msg_id = clientMsgId` 付きで呼ぶ。Cairn の Bot API は `client_msg_id` をメッセージ ID に使い、同じ ID の再送は新規投稿せず既存のメッセージを返す（モバイルのオフラインキューと同じ冪等化）
  3. 応答の `messageId` を保存して `status='posted'` にする。2〜3 の間で失敗しても、再試行は同じ `clientMsgId` で 2 からやり直すだけで、カードが二重に出ることはない
- 起動口は3つで、すべて同じユースケースを通る:
  1. 作成メニュー（§6.1）→ モーダルで質問・選択肢を入力 → `view_submission`
  2. 定期ジョブ（[`scheduled-jobs-design.md`](./scheduled-jobs-design.md) §8 の create-poll ステップ）→ 投票アプリのユースケースを呼ぶ。`scheduled_jobs.senderId` は投票アプリの Bot profile になる
  3. AI の `create_poll` tool（[`10_ai_member_design.md`](./10_ai_member_design.md) Stage 2）
- 2 と 3 は Cairn 本体側から投票アプリを呼ぶ形になる。第1段階は §7.1 の公開エントリ（`createPoll`）を呼ぶ。外部アプリには開かない（Slack の Workflow Steps 相当として第2段階以降に検討）
- 定期ジョブは対象チャンネルに投票アプリの Bot が参加していることを保存時に検証し、未参加ならコンパイルエラーにする（発火時に初めて `not_in_channel` で失敗させない）

## 8. 実装順

1. **スキーマ**: `profiles.kind`、`apps` / `app_installations` / `app_bot_tokens` / `app_channel_memberships`、`message_type` に `blocks`、`message_blocks`、Broadcast トリガー
2. **`packages/shared/src/blocks`**: スキーマ・mrkdwn・正規化・fixtures
3. **描画（Web → ネイティブ）**: section / header / divider / context / image / actions(button)。Bot の送信者表示とバッジ。ネイティブは OTA で配信できる範囲に収める
4. **Bot の Web API**: `auth.test` / `chat.postMessage` / `chat.update` / `chat.delete` / `users.info` / `conversations.members`
5. **インタラクション**: `/api/app-interactions`、署名、配送ログ、`response_url`。`static_select`
6. **モーダル**: `views.open` / `views.update`、`input`、`view_submission`（Web ダイアログ・ネイティブのシート）
7. **投票アプリ**: 作成メニュー → モーダル → カード → 投票 → 締切
8. **定期ジョブ**（[`scheduled-jobs-design.md`](./scheduled-jobs-design.md)）を投票アプリの上に載せる

各段で `/ai` のプロダクトヘルプ（`apps/web/src/lib/ai/product-help.ts`）、i18n（ja / en / ko）を更新する。機能全体は `FEATURE_FLAGS` の背後で段階的に有効化する。

## 9. Slack 互換で後続にやること・やらないこと（第2段階以降）

### 後続でやる

| 項目 | 内容 |
|---|---|
| ID 体系 | Slack の `T…`（team）/ `U…`（user）/ `C…`（channel）/ `ts`（`1700000000.000100` 形式、チャンネル内で一意）との対応。UUID を可逆に符号化するか、対応表を持つか。正規表現で ID 形式を検証する Slack アプリへの対処 |
| Web API の公開 | §6 のメソッドを外部アプリへ開く。最小限は `chat.postMessage` / `chat.update` / `chat.delete` / `users.info` / `conversations.members` / `auth.test` / `views.*` |
| 外部アプリの登録 | ワークスペースが自前のアプリを登録する UI（Request URL・署名シークレット・スコープ）。マニフェスト（`manifest.json`）の取り込み |
| OAuth v2 インストール | `oauth.v2.access` 相当。第1段階は管理画面での手動発行のみ |
| Events API | `message.channels`・`app_mention` などを Request URL へ送る。`url_verification` チャレンジ、リトライと `X-Slack-Retry-Num` |
| スラッシュコマンド | コンポーザーでの `/command` 解釈と補完。受け口は §6.1 で先に揃えておく |
| 追加の Block Kit 要素 | `datepicker` / `checkboxes` / `radio_buttons` / `users_select` / `overflow` / `rich_text`。§4.4 の順序で足す |
| エフェメラルメッセージ | `chat.postEphemeral`、`response_type: ephemeral` |
| 互換性テスト | Bolt for JS のサンプルアプリを CI で Cairn に向けて動かす |

### やらない

- Slack API の全面互換（`conversations.*` の大半、`files.*`、`reactions.*`、`usergroups.*`、Admin API、Enterprise Grid）
- Socket Mode（Request URL への HTTP 送信だけにする）
- RTM API、レガシーの verification token、Incoming Webhooks 単体、Workflow Builder
- Slack 自体との双方向ブリッジ（Slack のワークスペースへ発言を転送する等）

## 10. 第3段階:「Cairn でログイン」（OIDC）の位置づけ

- 第1・2段階のアプリは、Cairn のチャンネルの中でカードとインタラクションを通じて動く。**利用者が Cairn の外の画面（PWA など）を開いて、自分として操作する**には別の仕組みが要る。それが OIDC
- 現行の OAuth は MCP 専用（`resource` = `/api/mcp`、MCP の context 以外では資格情報にならない）なので、OIDC はそれと分けて追加する（`openid` スコープ、ID トークン、`/.well-known/openid-configuration`、UserInfo）
- 想定する最初の利用者は Cloudflare 上の PWA で作る装備管理アプリ。PWA は OIDC で利用者を識別し、Cairn への書き込み（チャンネルへの貸出通知など）は**インストール済みアプリの Bot トークン**で行う、という分担を想定する。利用者本人の権限で Cairn の REST API を叩かせる（ユーザートークン）かは第3段階で決める
- 本書の範囲では、アプリの身元（`apps`）を OIDC の client と同じ行に紐づけられるよう、`apps.id` を後から client ID の参照先にできる形にしておくだけにする

## 11. 決定事項（2026-10-21）

| # | 論点 | 決定 |
|---|---|---|
| D1 | 投票を本体機能にするか | アプリ基盤の上のファーストパーティアプリとして作る。`message_type: 'poll'` は足さず、汎用の `blocks` にする |
| D2 | 匿名投票 | 第1段階は出さない。非匿名のみで、投票者をカードに並べる。匿名はエフェメラルメッセージの実装後に検討 |
| D3 | ペイロードの ID | UUID のまま。`cairn.*` に UUID を併記し、投票アプリは `cairn.*` だけを読む。Slack 風の変換は第2段階 |
| D4 | 投票アプリの呼び出し | 同一デプロイでも署名付き HTTP で呼ぶ。遅延が問題になれば、ペイロードと署名を変えずに関数呼び出しへ差し替える |
| D5 | Bot と `channel_members` | 入れない。`app_channel_memberships` で管理する |
| D6 | Bot をチャンネルへ追加できる人 | そのチャンネルにアクセスできる member 以上。追加・削除は監査ログに残す |
| D7 | 投票アプリのインストール | 全ワークスペースに既定でインストール済み。チャンネルへの追加は手動 |
| D8 | `button.confirm` | 第1段階に入れる |
| D9 | `image_url` | https のみ許可。http は Web では混在コンテンツ、iOS では ATS で表示できないため。ローカル Storage（`http://127.0.0.1:54321`）の画像が必要になったら、開発環境だけループバックの http を許可する |
| D10 | レート上限・ログ保持 | Bot トークンは毎分120回（PAT と同じ）、配送ログは30日 |
| D11 | Bot の発言の扱い | 検索・RAG には含める。AI PMO の「未回答の依頼」判定からは外す |
| D12 | Cairn → アプリの呼び出し口 | 第1段階は投票アプリの内部関数のみ。外部アプリには開かない |
| D13 | Bot トークン形式 | `cairn_bot_<random>` |
| D14 | 締切時の結果サマリ投稿 | 当面しない。締切でボタンを外したカードに更新するだけ |

## 12. 未決事項（第2段階で決める）

- `ts` の採番方式。`created_at` から作ると同一チャンネル内の重複を DB で保証できないため、対応表か単調増加の採番が要る
- Slack 風 ID（`T…` / `U…` / `C…`）への変換方式と、ID 形式を正規表現で検証するアプリへの対処
- Bolt / `@slack/web-api` がトークン接頭辞に依存するか（依存していれば互換用に `xoxb-` 形式も発行）
- 外部アプリ公開前の画像プロキシ（閲覧者の IP をアプリ側へ渡さない）
- スラッシュコマンドの入力・補完、`datepicker` / `checkboxes` など追加要素の順序
- メンバー一覧・メンション候補に Bot をどう出すか（第1段階はヘッダーに「アプリ」欄を別に出す）
