# 実装計画: iOS ホーム画面ウィジェット「今日の予定」+ クイックアクションの見直し

実装エージェントへ渡す実装プロンプト。合意済みの仕様と、調査で確認した技術的な前提をまとめる。実装後は本文書を「記録」として残し、現行の設計判断は [`mobile-app.md`](mobile-app.md) に移す。

## 背景・目的

次回のストア配信（ネイティブ変更を含むため `runtimeVersion` が上がり、EAS Update では配れない）に合わせて、Expo アプリに次の2つを追加する。Web・DB の変更は不要で、既存 API だけで作る。

1. **iOS ホーム画面ウィジェット「今日の予定」**（`expo-widgets` 55.x。iOS 専用。Android は対象外）
2. **ホーム画面クイックアクション（アプリアイコン長押し）をタブと同じ4項目に揃える**（iOS・Android）

作業前に `AGENTS.md`、`apps/mobile/AGENTS.md`、`docs/mobile-app.md`（特に「ホーム画面のクイックアクション」「ビルド・配布」）を読むこと。ブランチは `develop` から `feat/` で切り、PR も `develop` 宛て。

---

## 1. クイックアクションの見直し

### 仕様

- 項目を **「タスクを作成」「プロジェクトを作成」「チャンネルを作成」「AI に聞く」** の4つにする（タブバーの チャット / プロジェクト / タスク / AI と同じ並び感）。**「DM を送る」は削除**し、`FEATURE_FLAGS.dm` による分岐も消す。iOS・Android とも表示上限は4つ。
- 既存の仕組みをそのまま使う: `apps/mobile/lib/quick-actions.ts` の `QUICK_ACTION_IDS` / `QUICK_ACTIONS` / `routeFromQuickAction`、`apps/mobile/hooks/use-quick-actions.ts`。動的登録（`setItems`）のみ、静的定義は使わない（AGENTS.md）。
- 遷移先:
  - `new-task`: 既存どおり `/(app)/tasks?new=1&open=<nonce>`
  - `ask-ai`: 既存どおり `/(app)/ai?focus=1&open=<nonce>`
  - `new-project`: `/(app)/chats?create=project&open=<nonce>` → `apps/mobile/app/(app)/chats/index.tsx` が既存の `openCreateProject()`（WebView の `panel=create-project`）を呼ぶ
  - `new-channel`: `/(app)/chats?create=channel&open=<nonce>` → 同ファイルの `setCreateMode('channel')`
- `chats/index.tsx` には現在 `dm=1` を受ける `useEffect`（`useLocalSearchParams` で `dm` / `open` を読み、開いたら `router.setParams` で消す）がある。これを `create` パラメータに置き換える。`dm` の受け口は削除する。
- **権限**: プロジェクト・チャンネル作成は admin 以上（`canCreateAdminResources`）。権限のないユーザーが押したときは**黙って無視せず** `Alert.alert` でその旨を表示する（「エラーを隠さない」ルール）。最終判定はサーバー。
- Android 用アイコンを追加: `apps/mobile/assets/quick-actions/project.png` と `channel.png`（既存 `task.png` 等と同じ 432×432 RGBA、白背景前提の単色シンボル）。`dm.png` は削除。`app.json` の `expo-quick-actions` plugin の `androidIcons` に `shortcut_project` / `shortcut_channel` を追加し `shortcut_dm` を消す。生成は root の `node_modules` にある `sharp` で SVG → PNG にする一時スクリプトで良い（スクリプトはコミットしない。`scripts/generate-icons.mjs` は PWA アイコン用で別物）。
- iOS は SF Symbols: 例 `symbol:folder.badge.plus`（プロジェクト）、`symbol:number`（チャンネル）。
- i18n: `packages/shared/src/i18n/ja.ts` / `ko.ts` に `'Create project'` `'Create channel'` は既にある。`'Send a DM'` は他で使っていなければ削除。
- テスト `apps/mobile/lib/quick-actions.test.ts` を更新（項目数・順序、DM 分岐の削除、`app.json` の androidIcons との整合チェックが既にあるので追従）。

### ドキュメント更新

- `docs/mobile-app.md` の「ホーム画面のクイックアクション」節: 項目一覧と DM 関連の記述（`FEATURE_FLAGS.dm` が無効なら登録しない、DM の遷移）を書き換え、`create=project|channel` の流れを追記。
- `apps/web/src/lib/ai/product-help.ts` の「Expoアプリは、ホーム画面のアプリアイコンを長押しすると…」の行を新しい4項目に書き換える。
- `apps/mobile/AGENTS.md` のクイックアクションの行は変更不要（規約は変わらない）。

---

## 2. iOS ウィジェット「今日の予定」

### 使うライブラリと仕組み（調査済み）

- `expo-widgets@~55.0.20` と `@expo/ui@~55.0.17` の両方を `apps/mobile/package.json` の直接依存に追加する。`@expo/ui` は `expo-widgets` の依存でもあるが、このリポジトリは `.npmrc` で `shamefully-hoist=false` のため、ウィジェットの TSX が `@expo/ui/swift-ui` を直接 import する（型・JSX の解決）には直接依存でないと解決できない。`expo-widgets` の `expo-module.config.json` は `platforms: ["apple"]` で **iOS のみ**。
- app config の plugin:

  ```ts
  ['expo-widgets', {
    widgets: [{
      name: 'TodayWidget',
      displayName: '...',      // ウィジェットギャラリーに出る名前。i18n 不可なので固定
      description: '...',
      supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'],
      contentMarginsDisabled: false,
    }],
  }]
  ```

  `bundleIdentifier` / `groupIdentifier` を省略すると `<ios.bundleIdentifier>.ExpoWidgetsTarget` / `group.<ios.bundleIdentifier>` になる。`apps/mobile/app.config.ts` は環境ごとに `ios.bundleIdentifier` を変えているので、**plugin はこの `app.config.ts` の `plugins` 配列に置く**（`app.json` ではなく）。3 バリアント（dev / preview / production）で別の extension bundle ID・App Group になることを確認する。
- plugin が自動で行うこと: App Group entitlements（本体・extension）、`Info.plist` の `ExpoWidgetsAppGroupIdentifier`、`extra.eas.build.experimental.ios.appExtensions` への extension 登録、Xcode target 生成（deployment target 16.2）。手で書かない。
- JS API（`expo-widgets`）:
  - `createWidget<Props>(name, layout)` → `Widget`。`name` は plugin の `widgets[].name` と一致させる。
  - `widget.updateSnapshot(props)` / `widget.updateTimeline([{ date, props }, ...])` / `widget.reload()`。
  - レイアウト関数は本体に `'widget'` ディレクティブを書く。**babel-preset-expo（55.0.25、`widgets-plugin.js`）がこの関数を文字列化して extension 側で評価する**。したがって:
    - 関数の中からモジュールスコープの変数・関数・`t()`・`import` したものを**一切参照できない**。使えるのは引数（`props`, `environment`）と、extension バンドルがグローバルに置く `@expo/ui/swift-ui` のコンポーネント（`VStack` `HStack` `Text` `Image` `Spacer` `Divider` `Link` `Button` など）と modifiers（`padding` `font` `foregroundStyle` `frame` `lineLimit` `widgetURL` など）だけ。JSX はそのまま書ける。
    - 文言（「予定」「タスク」「期限切れ」「ログインしてください」等）はすべて **props で渡す**。
    - `environment.date` はタイムライン項目の日時、`environment.widgetFamily` でサイズ分岐、`environment.colorScheme` で配色分岐。
  - `Link`（`destination` に URL）か `widgetURL(url)` modifier でタップ時の URL を開く。行ごとの遷移には `Link` を使い、ウィジェット全体には `widgetURL` を1つだけ。
- 本体側 `requireNativeModule('ExpoWidgets')` は Android で例外になるので、`apps/mobile/lib/haptics.ts` と同じく **`Platform.OS === 'ios'` のときだけ遅延 `require`** する。Web・テストでは no-op。

### 表示内容

Web のプロジェクト一覧カレンダー（`apps/web/src/components/app/pages/projects-calendar.tsx`、月表示）の「今日の列」を切り出したもの + 自分のタスク。

- **今日のプロジェクト**: `GET /api/projects`（`ProjectDto`: `startDate` / `endDate` / `archived` / `title`）。`archived` を除き、`startDate <= today <= endDate`。`endDate` が無ければ `startDate === today`。終日扱い。
- **今日のマイルストーン**: `GET /api/milestones`（`WorkspaceMilestoneDto`: `startDate` / `endDate` / `startTime` / `endTime` / `completed` / `projectTitle` / `channelId`）。Web の月表示と同じく**開始日の1日だけ**に表示（開始日が無ければ終了日）。`completed` は除く。`startTime` があれば時刻表示。
- **自分のタスク**: `GET /api/tasks?assignee=me`（`TaskDto`: `dueDate` / `status` / `title` / `id`）。`status !== 'done'` かつ `dueDate <= today`。期限切れ（`dueDate < today`）は赤系で表示。
- 「参加中／全体」トグルは持たず「全体」固定。
- **並び**: プロジェクト → マイルストーン（時刻順、時刻なしは先頭）→ タスク（期日順、期限切れが先）。
- **サイズ別**:
  - small: 今日の日付（曜日つき）と「予定 N」（プロジェクト + マイルストーンの合算）「タスク N」の2件数
  - medium: 日付ヘッダ + 最大4行
  - large: 日付ヘッダ + 最大8行、超過分は「他 N 件」
- 行の記号: プロジェクト「■」/ マイルストーン「● 10:00 名前（プロジェクト名）」/ タスク「○ 名前」。SF Symbols（`Image systemName`）でも良い。
- 空のとき: 「今日の予定はありません」。未ログイン・サインアウト後: 「ログインしてください」。
- **タップ先**（アプリの scheme はバリアントで違うので `Linking.createURL` 等で組み立てて props に入れる）:
  - プロジェクト行 → `/(app)/projects/<id>`（`apps/mobile/app/(app)/projects/[id].tsx` は `id` のみ受ける）
  - マイルストーン行 → そのチャンネルのチャット。`/chats/<channelId>` を開き、`channelName` 等の付随 params は `lib/follow-notification.ts` の `channelRouteParams` と同じ解決で補う（既存の通知からの遷移と同じ経路に乗せる）
  - タスク行 → `/(app)/tasks?taskId=<id>&open=<nonce>`（既存の `tasksScreenPath` が Web の詳細を開く）
  - ヘッダ／空状態 → `/(app)/projects`（カレンダーは WebView の projects 画面で、表示ビューは localStorage に保存済み）
- **未ログイン時に deep link を踏んだ場合**は、クイックアクションの `createQuickActionInbox` と同じ「ログイン後に再開」の扱いにする。既存の `+native-intent.ts`（`redirectSystemPath`）と `app/_layout.tsx` のログイン後遷移を確認して合流させる。黙って捨てない。

### 更新タイミング（本体 JS）

- `apps/mobile/lib/home-widget.ts`（純粋関数）: 上記3 API の結果と「今日」の日付文字列・`t`・URL ビルダーを受けて `TodayWidgetProps` を返す `buildTodayWidgetProps(...)`。日付比較は `YYYY-MM-DD` の文字列比較で行い、`today` は端末ローカルで作る。
- `apps/mobile/hooks/use-home-widget.ts`: ログイン中かつ iOS のとき、React Query で3 API を取得し（既存の `queryClient`、query key にユーザー ID は含めない）、取得できたら `updateTimeline(entries)` を書く。
  - **タイムラインは今日から7日分**を、同じデータで `today` を1日ずつ進めた props で生成する（その日のプロジェクト・マイルストーン、その日以前が期日の未完了タスク。期限切れ判定も日ごとに変わる）。各項目の `date` はローカルの 0:00。
  - **8日目の項目は `stale: true` の props**にし、レイアウトは予定を描かず「アプリを開いて更新してください」だけを出す。expo-widgets の provider（`TimelineProvider.swift`）は保存済みの項目を再読込するだけで新しい日付の props を作らないため、数日アプリを開かないと最後の項目が「今日の予定」として残り続ける。古い予定を今日のものとして見せないための終端。
- 呼ぶ場所: 前面復帰時（`AppState` active）、該当クエリ（projects / milestones / tasks）の invalidate 後、ワークスペース切り替え後。Realtime の購読は増やさない（常時購読は `user:{me}` と表示中チャットだけ）。
- **初期化はログイン前から行う**: `createWidget()` はレイアウトを App Group に保存する副作用を持ち、保存されるまでウィジェットは空（`EmptyView`）になる。そのため `createWidget()` と本フックは認証済みの `(app)` レイアウトではなく、`apps/mobile/app/_layout.tsx`（`AuthGuard` と同じ階層。`useQuickActionsRegistration` が置かれている場所）で動かし、未ログインの初回起動でも「ログインしてください」の props を書く。
- **取得失敗時に古い表示を残すのは、同じユーザー・同じワークスペースの再取得に限る**（0件に置き換えない。アイコンバッジと同じ方針）。props に `workspaceId` を持たせ、`activateWorkspace()` によるワークスペース切り替え（`resetQueries` が走る）では前のワークスペースの予定を即座に消し、新しい取得が終わるまでは「更新中」、失敗したら「最新の情報を取得できませんでした」の props にする。別のワークスペースの行をタップして一致しない画面が開く状態を作らない。
- **「ログインしてください」の props に置き換える条件**: サインアウト・別ユーザーへの入れ替え（`shouldClearAccountCache` と同じ境界）に加え、起動時にセッションが無いと確定したとき（`AuthGuard` が使う `isSessionConfirmedAbsent` と同じ判定。アプリ停止中にセッションが失効すると `SIGNED_OUT` を受けずに未ログインになるため）。どの場合も前回の予定を残さない。ネットワーク失敗で確定できないときは置き換えない。
- `useHoldOtaReload` の対象ではない（入力状態を持たない）。

### ファイル配置の目安

- `apps/mobile/widgets/today-widget.tsx`: `'widget'` ディレクティブ付きのレイアウト関数と `createWidget('TodayWidget', layout)`。props の型もここ。
- `apps/mobile/lib/home-widget.ts` + `home-widget.test.ts`（日本語の `describe` / `test`）: 今日のプロジェクト・マイルストーン・タスクの抽出、並び、サイズ別の件数、7日分 + `stale` 終端のタイムライン生成、空・未ログイン・更新中・取得失敗・ワークスペース切り替えの props、URL 組み立て。
- `apps/mobile/lib/home-widget-native.ts`: iOS だけ `expo-widgets` を遅延 require するラッパー。
- `apps/mobile/hooks/use-home-widget.ts`（`app/_layout.tsx` から呼ぶ）。

### 設定変更

- `apps/mobile/app.json`: `runtimeVersion` を `1.11.0` → `1.12.0`。`version` はストア配信のフローに合わせて更新（1.2.0 → 1.3.0 を提案、判断はユーザー）。
- `apps/mobile/app.config.ts`: `expo-widgets` plugin を追加（上記）。
- `apps/mobile/package.json`: `expo-widgets` と `@expo/ui`（上記の理由で両方を直接依存に）。
- `eas.json` の変更は不要。**初回の `eas build --platform ios` で extension の bundle ID（例: `com.oss-cairn.ExpoWidgetsTarget`）の証明書・プロビジョニングが対話的に作られる**可能性があるので、PR 本文にその旨を書く。
- `npx expo prebuild --platform ios --clean` が通ること（生成物はコミットしない）と `pnpm --filter @cairn/mobile typecheck` / `test` を確認。iOS ビルド自体は CI・ローカルでは回せないので、PR に「EAS Build での確認が必要」と明記。

### ドキュメント更新

- `docs/mobile-app.md` に「ホーム画面ウィジェット（iOS）」節を追加: 表示内容と Web カレンダーとの対応、更新タイミング、`'widget'` 関数の制約、App Group / extension の自動設定、初回ビルドの注意、Android 非対応の理由。
- `apps/mobile/AGENTS.md` に守らないと壊れる規約だけ1〜2行追加。例: 「ウィジェットのレイアウト関数（`'widget'`）は文字列化されて extension で評価されるため、外側の変数・`t()`・import を参照しない。文言と URL は props で渡す」「ウィジェットの内容は `lib/home-widget.ts` の `buildTodayWidgetProps` だけで組み、取得失敗で空にしない」。
- `apps/web/src/lib/ai/product-help.ts` に iPhone のウィジェットの説明を1行追加（表示内容、タップ先、Android 非対応、更新はアプリを開いたとき）。

---

## 共通の確認事項

- コミットは Conventional Commits + 日本語の体言止め、「なぜ」を書く（例: `feat: ホーム画面から今日の予定を確認できるよう、iOS ウィジェットを追加`）。`Co-Authored-By` トレーラーを付ける。
- 本リポジトリはパブリック。固有名詞を入れない。
- 完了条件: `pnpm typecheck` `pnpm lint` `pnpm test` が通る、`expo prebuild --platform ios` が成功する、上記ドキュメント3箇所が更新されている、PR 本文に EAS Build での未確認事項（ウィジェットの実機表示、extension の証明書設定）が明記されている。
