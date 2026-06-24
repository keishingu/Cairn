# テスト仕様書（自動生成）

> このファイルは `scripts/gen-test-spec.mjs` がテストコードから自動生成しています。
> 直接編集せず、テストを更新してから `pnpm gen:test-spec` を再実行してください。

- 生成日時: 2026-06-24
- 対象テストファイル数: 29
- 仕様項目（it / test）数: 165

## 目次

- [API（サーバー処理・権限制御）](#area-1)
- [チャット関連ユーティリティ](#area-2)
- [データ取得・状態管理（フック）](#area-3)
- [ドメインロジック（core）](#area-4)
- [画面・ルーティング](#area-5)
- [画面コンポーネント](#area-6)
- [共通ユーティリティ](#area-7)
- [共有バリデーション（shared）](#area-8)
- [通知・Push 関連](#area-9)

## 読み方

- このドキュメントは、テストコードに書かれている「確認済みの振る舞い」を一覧化したものです。
- ユーザー向けの仕様把握を目的にしていますが、自動生成のため一部に API 名・内部用語・テストファイル名が含まれます。
- 実装やテストと矛盾する場合は、コードとテストを正とします。

<a id="area-1"></a>

## API（サーバー処理・権限制御）

### `apps/web/src/app/api/attachments/[fileId]/route.test.ts`

**/api/attachments/[fileId] のアクセス制御**

- 閲覧権限が無いファイルは GET が 403 を返し、ダウンロードできない
- 閲覧権限が無いファイルは PATCH が 403 を返す
- 閲覧権限が無いファイルは DELETE が 403 を返す

### `apps/web/src/app/api/attachments/upload/route.test.ts`

**/api/attachments/upload のアクセス制御**

- アクセス権の無いチャンネルへはアップロードできない

### `apps/web/src/app/api/auth/setup/route.test.ts`

**POST /api/auth/setup**

- 不正な JSON には 400 を返す
- workspaceName なし・メンバーシップなし → needsWorkspace: true
- workspaceName なし・メンバーシップあり → needsWorkspace: false
- workspaceName あり・既存メンバーシップがあっても新規ワークスペースを作成する
- workspaceName あり・プロフィール未作成 → プロフィールも同時に作成する

### `apps/web/src/app/api/auth/webview-handoff/route.test.ts`

**POST /api/auth/webview-handoff**

- 未認証なら 401 を返し、トークン発行を行わない
- 認証済みユーザーの email で magiclink を発行し tokenHash を返す
- ユーザーの email が取得できない場合は 500 を返し、リンク発行を行わない
- magiclink 発行に失敗した場合は 500 を返す

### `apps/web/src/app/api/channels/[channelId]/messages/route.test.ts`

**/api/channels/[channelId]/messages のアクセス制御**

- アクセス権の無いチャンネルでは GET が 403 を返し、メッセージを読めない
- アクセス権の無いチャンネルでは POST が 403 を返し、投稿できない

### `apps/web/src/app/api/invite/[token]/accept/route.test.ts`

**POST /api/invite/[token]/accept**

- 未認証なら認証エラーを返す
- 存在しない・期限切れトークンには 404 を返す
- 既にメンバーの場合はべき等に 200 を返す（use_count を増やさない）
- max_uses に達していると 410 を返す
- 有効なトークン・未参加ユーザー → ワークスペースに追加して workspaceId を返す
- max_uses が null（無制限）の場合は何度でも参加可能

### `apps/web/src/app/api/projects/channels/route.test.ts`

**GET /api/projects/channels**

- 未認証なら認証エラーを返す
- ゲストは参加プロジェクトのチャンネルのみ取得できる
- ゲストで参加プロジェクトが0件の場合は空配列を返す
- 通常メンバーはすべてのプロジェクトのチャンネルを取得できる

### `apps/web/src/app/api/projects/route.test.ts`

**GET /api/projects**

- 未認証なら認証エラーを返す
- ゲストは参加プロジェクトのみ取得できる
- ゲストで参加プロジェクトが0件の場合は空配列を返す
- 通常メンバーはすべてのプロジェクトを取得できる（ゲストフィルタなし）

### `apps/web/src/app/api/workspaces/invites/route.test.ts`

**POST /api/workspaces/invites**

- 未認証なら認証エラーを返す
- owner でないユーザーには 403 を返す
- メンバーシップなし（ゲストも含む）は 403
- owner は招待トークンを作成できる
- admin も招待トークンを作成できる

**GET /api/workspaces/invites**

- admin は招待一覧を取得できる
- member は招待一覧を取得できない

### `apps/web/src/app/api/workspaces/members/[userId]/route.test.ts`

**PATCH /api/workspaces/members/[userId]**

- 未認証なら 401 を返す
- 無効なロール値は 422 を返す
- member は変更できない（403）
- admin は member を admin に昇格できる
- admin は admin を member に降格できる
- admin は owner への昇格を行えない（403）
- admin は owner のロールを変更できない（403）
- owner は member を owner に昇格できる
- owner が複数いる場合、owner を降格できる
- 唯一の owner は降格できない（422）
- ゲストを通常ロールへ昇格できない（422）
- 通常ロールをゲストへ降格できない（422）
- 存在しないメンバーは 404 を返す

<a id="area-2"></a>

## チャット関連ユーティリティ

### `apps/web/src/lib/chat/ime.test.ts`

**isImeConfirmingEnter**

- composition 中フラグが立っている場合は true を返す
- nativeEvent.isComposing が true の場合は true を返す
- keyCode 229 の場合は true を返す
- 通常の Enter では false を返す

### `apps/web/src/lib/chat/mentions.test.ts`

**extractMentionIds**

- canonical 形式と旧形式の両方から userId を抽出する
- 同じ userId は重複排除する
- メンションが無ければ空配列

**canonicalizeMentions**

- 旧形式の埋め込み名を除去して canonical 形式にする
- canonical 形式はそのまま保つ

**hydrateMentions**

- canonical 形式に現在の表示名を埋め込む
- 旧形式の埋め込み名より現在名を優先する（名前変更を反映）
- 解決できない userId はフォールバック名で埋める

**stripMentionsToText**

- 最新名で @表示名 に変換する
- nameOf 未指定なら旧形式の埋め込み名を使う

<a id="area-3"></a>

## データ取得・状態管理（フック）

### `apps/web/src/hooks/use-debounce.test.ts`

**useDebounce**

- 初期値をすぐに返す
- 指定した遅延時間が経過すると新しい値を返す
- 遅延中に連続して値が変わった場合は最後の値だけを返す

### `apps/web/src/hooks/use-detail-panel.test.ts`

**useDetailPanel — panelState の導出**

- ?open なしでは panelState が null
- ?open=project-{id} では panelProject を返す
- ?open=member-{id} では panelMember を返す
- キャッシュにない ID では null を返す

**useDetailPanel — 操作関数**

- openPanel(project) は ?open=project-{id} へ push する
- openPanel() 引数なしは ?open なし URL へ push する
- openProjectById は ?open=project-{id} へ push する
- openMember は ?open=member-{userId} へ push する
- closePanel は ?open を除いた URL へ push する
- backPanel は router.back() を呼ぶ
- 別ページ (/chat) からでも ?open=member-{id} へ push する
- openMember は遷移元の ?tab を引き継がない（buildUrl が tab を削除する）

**useDetailPanel — panelTab / setPanelTab**

- ?tab なしでは panelTab が "chat"
- ?tab=members では panelTab が "members"
- setPanelTab は router.replace で ?tab を更新する（履歴を汚さない）

### `apps/web/src/hooks/use-patch-project.test.ts`

**usePatchProject**

- 成功時に PATCH リクエストを送り projects クエリを invalidate する
- レスポンスが ok=false のときサーバーのエラーメッセージを throw する

**useDeleteProject**

- 成功時に DELETE リクエストを送り projects クエリを invalidate する
- レスポンスが ok=false のとき error を throw する

### `apps/web/src/hooks/use-project-files.test.ts`

**useProjectFiles**

- /api/projects/:id/files からファイル一覧を取得する
- 取得失敗時に isError が true になる
- deleteMutation がファイルを削除して project-files クエリを invalidate する
- setLatestMutation がファイルに最新版フラグを PATCH して project-files クエリを invalidate する

### `apps/web/src/hooks/use-project-members.test.ts`

**useProjectMembers**

- /api/projects/:id/members からメンバー一覧を取得する

**useWorkspaceMembersForInvite**

- enabled=true のときワークスペースメンバーを取得する
- enabled=false のときフェッチしない

**useAddProjectMember**

- メンバーを追加してキャッシュに追記する
- エラーレスポンスのときエラーメッセージを throw する

**useRemoveProjectMember**

- メンバーを削除してキャッシュから取り除く

### `apps/web/src/hooks/use-project-statuses.test.ts`

**useProjectStatuses**

- /api/projects/statuses からステータス一覧を取得する
- staleTime=Infinity のとき、キャッシュに既にデータがある場合はフェッチしない

### `apps/web/src/hooks/use-project-tasks.test.ts`

**useProjectTasks**

- /api/tasks?projectId=... からタスク一覧を取得する
- toggleMutation がタスクを楽観的に更新してから PATCH を送る
- toggleMutation がエラーのとき楽観的更新をロールバックする

**useCreateTask**

- タスクを作成して onSuccess コールバックを呼ぶ
- 作成エラー時は onSuccess コールバックを呼ばない

<a id="area-4"></a>

## ドメインロジック（core）

### `packages/core/src/application/create-project.test.ts`

**CreateProjectUseCase**

- プロジェクトを作成してリポジトリに委譲する

<a id="area-5"></a>

## 画面・ルーティング

### `apps/web/src/app/(app)/_shells/pc-shell.test.tsx`

**PCShell — URL からパネル表示の導出**

- ?open なしでは ProjectPanel を表示しない
- ?open=project-{id} では対応するプロジェクトの ProjectPanel を表示する
- キャッシュに存在しない ID では ProjectPanel を表示しない
- /members などプロジェクト以外のパスでは ProjectPanel を表示しない

**PCShell — openPanel の URL 更新**

- openPanel(project) は ?open=project-{id} へ router.push する
- openPanel() は ?open なし URL へ router.push する

**PCShell — ProjectPanel の閉じるボタン**

- パネルの閉じるボタンは ?open なし URL へ router.push する

### `apps/web/src/app/page.test.tsx`

**RootPage**

- /projects にリダイレクトする

<a id="area-6"></a>

## 画面コンポーネント

### `apps/web/src/components/app/pages/members-page.test.tsx`

**PageMembers (モバイル) — カードタップの URL 更新**

- メンバーカードをタップすると /members/{userId} に router.push する
- タップするとメンバーパネルが開く

**PageMembers (モバイル) — パネルを閉じたときの URL 更新**

- パネルの閉じるボタンは /members に router.push する
- パネルを閉じるとパネルが非表示になる

**PageMembers (モバイル) — initialUserId によるパネル復元**

- initialUserId が渡されたとき、メンバーが読み込まれ次第パネルを開く
- initialUserId が存在しない ID の場合はパネルを開かない

### `apps/web/src/components/app/pages/projects-calendar.test.ts`

**buildGcalEvents**

- 1日のみのイベントは1セルに span=1 で配置される
- 週をまたぐイベントは週ごとに分割され、各セグメントの span が正しく計算される
- 表示範囲外のイベントは除外される
- 表示範囲をまたぐイベントは表示範囲内に収まるよう切り詰められる
- 同じ週で重なる複数のイベントは異なる row に割り当てられる
- 重ならない複数のイベントは同じ row に割り当てられる
- calendarColor が null の場合はデフォルト色が使われる

**buildGcalWeekEvents**

- 週内の1日のみのイベントは day と span が正しく計算される
- 週をまたぐイベントは週の範囲内に切り詰められる
- 週の範囲外のイベントは除外される
- 重なる複数のイベントは異なる row に割り当てられる

**buildGcalTimedEvents**

- 終日イベントは除外される
- 時刻指定イベントは曜日と分単位の開始・終了位置に変換される
- 終了時刻が開始時刻以前の場合は最低30分の長さになる
- 日をまたぐイベントは当日の24時までで終了する
- 週の範囲外のイベントは除外される
- 同じ曜日で重なる時刻指定イベントは異なる列に割り当てられる

<a id="area-7"></a>

## 共通ユーティリティ

### `apps/web/src/lib/storage-keys.test.ts`

**STORAGE_KEYS**

- すべてのキーが cairn: プレフィックスで始まる
- すべてのキーが cairn:<snake_case> 形式に準拠している
- 重複するキー値がない

### `apps/web/src/lib/toast.test.ts`

**toast ストア**

- 購読すると現在のリストが即時に1回通知される
- success / error / info でバリアントを指定して追加できる
- デフォルトの表示時間が経過すると自動で消える
- duration: 0 を渡すと自動消去されない
- id を指定して任意のタイミングで閉じられる
- 解除した購読者には以後通知されない

### `apps/web/src/lib/token-crypto.test.ts`

**token-crypto**

**CALENDAR_TOKEN_ENCRYPTION_KEY が正しく設定されている場合**

- 暗号化したトークンを復号すると元の文字列に戻る
- 暗号化結果は iv:authTag:encrypted の3要素のhex文字列になる
- 同じ平文でも暗号化のたびに異なる結果になる（ivがランダムなため）
- 不正な形式の文字列を復号しようとするとエラーになる

**CALENDAR_TOKEN_ENCRYPTION_KEY が未設定の場合**

- encryptTokenを呼ぶとエラーになる

**CALENDAR_TOKEN_ENCRYPTION_KEY の長さが不正な場合**

- encryptTokenを呼ぶとエラーになる

<a id="area-8"></a>

## 共有バリデーション（shared）

### `packages/shared/src/schemas/index.test.ts`

**createProjectSchema**

- 有効なデータを受け入れる
- タイトルが空の場合エラーになる
- workspaceId が UUID でない場合エラーになる

**createTaskSchema**

- デフォルト優先度は medium になる
- 高優先度を設定できる
- 無効な優先度はエラーになる

**postMessageSchema**

- デフォルトの messageType は text になる
- 空のメッセージはエラーになる

**uploadGalleryItemSchema**

- 有効な座標を受け入れる
- 範囲外の緯度はエラーになる

<a id="area-9"></a>

## 通知・Push 関連

### `apps/web/src/lib/push/suppress.test.ts`

**hasReadMessage**

- read state が存在しなければ未読扱い
- last_read_message_id が対象メッセージと一致すれば既読
- last_read_at がメッセージ作成時刻以降なら既読
- last_read_at がメッセージ作成時刻と同時刻でも既読
- last_read_at がメッセージ作成時刻より前なら未読
- last_read_at が null かつ message id 不一致なら未読
