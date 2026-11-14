# モバイルアプリ（Expo）の設計判断

- 状態: **現行リファレンス**（`AGENTS.md` から移した確定済みの判断）
- 関連: 配布・オフライン基盤は [`mobile-internal-distribution.md`](./mobile-internal-distribution.md)、WebView 認証は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md)、ストア提出は [`app-store-submission.md`](./app-store-submission.md)、経緯は [`archive/08_expo_roadmap.md`](./archive/08_expo_roadmap.md)

## 構成

- `apps/mobile/` はチャット以外を WebView で Web 版を表示する。チャットは `apps/mobile/app/(app)/chats/` のネイティブ実装
- **共通ヘッダーと通知スライドインは React Native が所有する**。WebView モードでは Web の `MobileHeader` を描画せず、`native-header` bridge でタイトル・サブタイトル・戻る可否を Expo へ通知する。Web 固有の右側アクションだけは WebView 内のツールバーとして残す
- **ワークスペース選択はユーザー別 AsyncStorage が共有元**。API は `X-Cairn-Workspace-Id` を Cookie より優先して active membership を再検証する。WebView ハンドオフ時は検証済み workspace ID を Cookie へ同期する
- **テーマとハイライトカラーは `profiles.theme` / `profiles.accent_id` が共有元**。Web の `next-themes` / localStorage は即時描画用キャッシュ。設定変更時は `PATCH /api/me` へ保存し、設定 WebView は `appearance-changed` を bridge へ通知、Expo は `/api/me` と前面復帰時の再取得で追従する
- **表示言語は `profiles.locale`（`ja` / `en` / `ko` / `system`）が共有元**。`system` はブラウザまたは端末の言語に従う。設定 WebView は `locale-changed` を bridge へ通知し、Expo のタブとログインも同じ設定に合わせる
- **カレンダーの週の始まりは `profiles.calendar_week_start`（`sunday` / `monday`、既定は日曜）が共有元**。設定 → 外観で選び `PATCH /api/me` へ保存する。Web の `cairn:calendar_week_start` は取得前の即時描画用キャッシュに留める。カレンダー画面自体は WebView
- ネイティブチャットも Web と同じ private Realtime Broadcast（`user:{userId}` と表示中のチャットの `channel:{channelId}` だけ）で更新し、ポーリングは使わない。画面外のチャンネルは user トピックで届く（[notification-design.md](notification-design.md#user-トピックへのチャンネル活動の配信)）
- **チャット添付の画像・PDF・Markdown はアプリ内のモーダルで開き、ピンチで拡大できる**（`chat-image-viewer.tsx` / `chat-pdf-viewer.tsx` / `chat-markdown-viewer.tsx`）。画像は iOS では `ScrollView` の拡大（PDF・Office と同じ UIScrollView）、`ScrollView` が拡大に対応しない Android ではキャッシュしたファイルを WebView で表示して拡大する。Markdown はネイティブの描画を拡大すると文字がぼやけ Android では拡大もできないため、Web と同じ mdast 系で HTML にして（生の HTML は文字に、画像は自動取得しないリンクに変える）JavaScript を無効にした WebView で表示する（`attachment-viewer-html.ts`）。判定は Web のテキストプレビューと同じく `text/markdown` か `.md` / `.markdown` で、`.txt` は除く。変換は JS スレッドで同期的に走りモーダルを閉じられなくなるため、300KB を超えるファイルは描画せず他のアプリで開く導線を出す。PDF の取得は共有シートと同じ `attachment-cache.ts` のキャッシュを使い、描画は `pdf-document-view.tsx` が端末ごとに切り替える。iOS は `react-native-pdf`（PDFKit）で、長押しで文字を選択・コピーできる。Android の `react-native-pdf`（Pdfium）はページを画像として描くだけで文字を選べないため、`pdf-document-view.android.tsx` で pdf.js（`pdfjs-dist` の legacy ビルド）を WebView で動かし、テキストレイヤーで選択・コピーできるようにしている。ネイティブ依存を足さず EAS Update で配れるよう、pdf.js 本体・worker・CMap（フォントを埋め込まない日本語 PDF 用）・画像復号の wasm は `metro-pdfjs-transformer.js` が `lib/pdfjs-assets.js` を置き換えて JS バンドルへ同梱する（CDN からは読まない。Android のバンドルだけに入る）。WebView にはファイルの読み取り権限を与えず、CSP で外部への接続も止め、PDF 本体は pdf.js が要求した範囲だけをアプリが表示中のファイルから読んで渡す。PDF 内の JavaScript は実行しない（pdf.js の sandbox は同梱しない）。大きな PDF でもメモリが溢れないよう、ページは画面の前後1画面分だけ描画し、3画面分より離れたら描画を捨てる。拡大は WebView のピンチで、拡大後は見えているページを細かく描き直す。埋め込みのない欧文の標準フォントは端末のフォントで代用する。iOS では Word / Excel / PowerPoint も `chat-office-viewer.tsx` で開く。WKWebView が OS 標準のプレビューで Office ファイルを描画できるため、ネイティブ依存を足さずに同じキャッシュのファイルを `file://` で読み込む（Android の WebView は描画できないため共有シートのまま）。WebView は描画方法をファイルの拡張子で決めるため、Office 判定は MIME ではなく拡張子だけで行い、読み取りは表示中のファイルだけに絞って JavaScript を無効にする（MIME だけ Office の HTML などをキャッシュ内の他ファイルが読める状態で描画させない）。それ以外の形式は共有シートで外部アプリに渡す。PDF と Office ファイル内のリンクはチャット本文と同じ `resolveMobileMarkdownLink` で判定する
- **チャット添付の動画はアプリ内で再生せず、OS のブラウザ（`expo-web-browser`）で開く**（`lib/video-playback.ts`）。最大 500MiB を端末へ丸ごと落とさないため、`/api/attachments/{id}?as=json` で Storage の署名 URL を受け取って開く（圧縮版ができていれば 720p の圧縮版、変換中は原本。`variant` で分かる）。動画の送信（ライブラリから選ぶボタン）は Solo 支援者本人と課金無効の環境にだけ出す（`GET /api/billing/upload-rights`。アプリは課金の導線を出さない）。送信は upload-url が `resumable: true` を返したときだけ、`tus-js-client` で uri のまま 6MB ずつ送る（`lib/resumable-upload.ts`）
- **WebView の画面で原本（PDF 原本・ギャラリーのオリジナル画像）を保存するときは、Web が `download-file` を bridge へ送り、アプリが取得して共有シートに渡す**（`lib/webview-download.ts`）。WebView では `window.open` で保存できないため。Web が開いているワークスペース（`cairn_workspace_id` cookie）を一緒に送り、アプリはその ID で `X-Cairn-Workspace-Id` を付ける。認証ヘッダーを送る先は原本の取得口（`/api/attachments/{uuid}?original=1`、`/api/projects/{uuid}/gallery/{uuid}/file?original=1`）だけに限る。メニューは取得できる本人にだけ出す
- **チャット本文の Markdown は `react-native-enriched-markdown` でネイティブ描画する**（`mobile-markdown.tsx`）。パーサー（md4c）はネイティブ側にあるため、メンション・画像の自動取得禁止・長い URL の省略・`||` と HTML のエスケープは `lib/mobile-markdown-source.ts` で、Web と同じ mdast（GFM）の構文木の上で適用してから Markdown に戻す。コードハイライト・数式・動画はルートと `apps/mobile` の `package.json` の `enriched-markdown` ブロックで無効にし、install 時のネイティブ資産ダウンロードも止めている。表示規則は [`.interface-design/system.md`](../.interface-design/system.md) の「React NativeチャットのMarkdown本文」
- **ブロック済み投稿の添付は表示しない**。共通メッセージ API は該当する添付を返さず、ネイティブ画面も古いキャッシュ上の添付を表示しない。添付を再び見るにはブロックを解除して再取得する。
- **ネイティブチャットの長押しメニューの並びは、返信 →（自分のメッセージなら）編集 → テキストをコピー → テキストを選択 → タスク化 → ブックマーク → リアクション → リンクをコピー →（可能なら）スレッドに切り出す → 末尾に削除（自分）/報告（他者）**。ブロック済みユーザーのメッセージは「一時的に表示」を返信の直後に置き、コピー・選択は出さない。コピーは `expo-clipboard` でメンションを `@表示名` に直した本文を書き込み、「テキストを選択」は `components/text-select-sheet.tsx` の全画面（iOS は読み取り専用の複数行 `TextInput`、Android は `selectable` な `Text`）で OS の選択メニューを使う。本文自体は `selectable={false}` のまま。メニューにブロックは置かず、報告の送信後のダイアログから「このユーザーをブロック」を出す（App Store 1.2）
- **ネイティブチャットでは、メッセージの送信者のアイコン・名前をタップすると下シートのプロフィール（`components/user-profile-sheet.tsx`）が開く。人単位の操作（メッセージを送る＝DM、メンション、ブロック／ブロック解除）の置き場で、本文の長押しメニューはメッセージ単位の操作のまま**。プロフィール情報（ワークスペースのロール・参加月・プロフィール属性）は `GET /api/workspaces/members` から引き、取得できないときは代替表示せずエラーを出す。出す操作は `lib/user-profile-actions.ts` で決める（自分には出さない、`FEATURE_FLAGS.dm` が無効なら DM を隠す、ブロック中は DM の代わりに解除、メンションは入力欄の候補と同じ集合に限る）。ブロック中かどうかはメッセージの `blocked` ではなく `GET /api/me/blocks`（自分 → 相手の向きだけ）で判定する（`blocked` は相手からのブロックでも立ち、解除できないブロックに「解除」を出してしまうため）。DM はサーバーが双方向のブロックで拒否するため、`blocked` が立っていれば DM は出さない。最終判定は常にサーバー。システムメッセージは開かない
- **「スレッドに切り出す」はネイティブチャットの長押しメニューにあり、範囲は「このメッセージだけ」「このメッセージ以降すべて」の2つに限る**（`components/move-to-thread-sheet.tsx`）。複数選択（チェックボックス）は Web のみ。API は Web と同じ `POST /api/channels/{id}/move-to-thread`。検索・ブックマークの一覧は WebView の Web 版（チャット補助画面）だが、結果を選んだ後の移動はネイティブのチャットが担う。通知（Push・通知一覧・通知パネル）、チャットへのリンク、検索・ブックマークの結果は、ネイティブで移動済みメッセージの移動先を確認（`GET /api/messages/{id}/location`）して開き、見つからない・確認できないときは古いチャンネルを開かずにエラーを表示する（`lib/follow-notification.ts`）
- **チャンネル・メッセージへのリンク（`/chats/{id}`、`?m=` 付き）は、WebView 画面・ネイティブチャット本文のどちらから押してもネイティブのチャットで開く**（`lib/chat-link.ts`）。判定はビルドの接続先 `API_BASE_URL` のオリジンとの一致だけで、ドメインは直書きしない。別環境（develop ビルドで本番のリンク等）は DB が別なので外部ブラウザへ渡す。開発ビルドだけは、接続先が Metro から導いた LAN の IP でも PC のブラウザでコピーしたリンクは `localhost` になるため、同じポートのループバックも同じサーバーとみなす。WebView では、ページ全体の読み込みは `onShouldStartLoadWithRequest` で受けるが、Next.js の `<Link>` による画面内遷移はそこを通らないため、Web の `mobile-shell.tsx` が `open-chats` メッセージに行き先の `path` を載せて送る（`path` の無い古い Web では一覧を開く）。チャット補助画面（`chat-tools`、`allowChatRoutes`）で WebView に読み込むのは補助画面の URL（`nativeAux=1`）だけで、そこから開くチャンネル・メッセージもネイティブで開く。補助画面の中の画面内遷移（検索結果・ブックマークからのジャンプ、パネルを閉じる等）は、`mobile-shell.tsx` が `panel` の無い `/chats` への遷移を検知して `open-chats` で行き先を渡し、Web の表示を直前のパネルへ戻す（アプリは同じ補助画面を開き直しても WebView を読み直さないため、Web のチャットを残さない）。行き先を渡すのは、アプリが補助画面の URL に付ける `nativeChatLinks=1` があるときだけ（この印を付けない古いバンドルは `open-chats` の行き先を読めず一覧を開くため、従来どおり WebView 内で開く）
- **`?m=` のメッセージジャンプは Web の `/chats` と同じ規則**（`lib/message-jump.ts`）。飛び先が直近のページにあればその位置へスクロールし、無ければ `GET /api/channels/{id}/messages?around=` で前後を直近とは別のキャッシュ（`['messages', channelId, 'history', messageId]`）に取って表示する。直近のページへ混ぜると間の欠けたタイムラインになるため。履歴表示中は「最新のメッセージへ移動」ボタンを出し、既読化はしない。送信すると最新へ戻す。前後を取得しても飛び先が無ければエラーを表示して直近の表示に戻す。飛び先は2秒間強調する。同じメッセージへもう一度移っても反応するよう、遷移ごとに `jumpKey` を変える
- **Mermaid 図はタップで全画面表示する**（`components/mermaid-diagram.tsx`）。md4c では描画できないため、本文最上位の ```` ```mermaid ```` を `splitMermaidSegments` で本文から分けてカードにし、全画面の WebView で Web と同じ設定の mermaid を描画する。mermaid は Web と同じバージョンに固定して CDN から Subresource Integrity 付きで読み込むため、Web の mermaid を上げたら `lib/mermaid-html.ts` のバージョンと integrity も更新する

## 開発

Web 側（`pnpm dev` と Supabase）を先に起動しておく。Expo Go は使わず expo-dev-client を使う。

```bash
cp apps/mobile/.env.local.example apps/mobile/.env.local  # ANON_KEY のみ。IP の書き換えは不要
cd apps/mobile
pnpm ios       # iOS シミュレータ（初回はネイティブビルド）
pnpm android   # Android エミュレータ
pnpm dev       # 2回目以降、ネイティブ依存に変更がなければ Metro 起動だけでよい
```

- ネイティブビルドのやり直しが要るのは、ネイティブモジュールの追加や `app.json` のネイティブ設定を変えたときだけ。JS の変更は Metro のホットリロードで反映される
- 実機は `pnpm dev` の QR を、インストール済みの開発クライアントで読み込む。Xcode / Android Studio がないメンバーには EAS の `development`（シミュレータ）/ `development-device`（実機）プロファイルで開発クライアントを配布できる
- `ios/` `android/` は `app.json` から再生成できる成果物なのでコミットしない。ネイティブプロジェクトがあると runtime version のポリシーが使えないため、`runtimeVersion` は固定文字列で管理し、**ネイティブモジュールを追加・更新したら手動で上げる**（古いネイティブビルドに非互換な EAS Update が届くのを防ぐ）
- ネイティブ側の接続先 URL は `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_API_BASE_URL` が未設定なら Metro の接続先ホストから自動導出する（`apps/mobile/lib/env.ts`。シミュレータは `localhost`、実機は LAN IP、Android エミュレータは `10.0.2.2`）。固定 URL に向けたいときだけ `.env.local` で設定する

### 実機で WebView が真っ白になるとき

- **`pnpm setup:mobile-lan` を実行する**: WebView 内の Next.js バンドルに埋め込まれた `NEXT_PUBLIC_SUPABASE_URL` が `127.0.0.1` のままだと端末から繋がらない。ミドルウェアの `getUser()` がタイムアウトして `/auth/login` へ飛び、それを検知したネイティブまでサインアウトする。このコマンドで `apps/web/.env.local` を LAN IP に書き換える（Wi-Fi 切替時は再実行）
- **`allowedDevOrigins` を確認する**: Next.js 15 の開発サーバーは `localhost` 以外からの `/_next/*` をブロックする。`apps/web/next.config.ts` が LAN IP を自動設定しているが、ターミナルに `Cross origin request detected from <IP> to /_next/* resource` が出ていれば効いていない

## チャットの画面遷移

- `app/(app)/chats/_layout.tsx` は Stack で、一覧の上に詳細を重ねる。iOS の標準のスワイプで戻る途中も背面に一覧が見える。チャットのタブを押すと一覧へ戻る
- 通知などから詳細を直接開いても戻り先があるよう、`unstable_settings.anchor` を `index` にしている。詳細の戻るボタンは `router.dismissTo` で一覧まで戻す
- 詳細は `getId` で 1 画面に固定する。DM やスレッド、通知で別のチャットへ移っても画面は重ならず、同じ画面の params が変わるだけなので、戻り先は常に一覧になる
- チャット情報（i アイコン）は `components/chat-info-drawer.tsx` のネイティブのドロワーで、見出し・ステータス・説明・タスク・ファイル・メンバーを表示する。タスクの完了や追加、ファイル名の変更、招待などの編集は「その他の操作」やタスクのタップから既存の Web パネル（`/chats/{id}?nativeAux=1&panel=info`）で行う。次の画面はドロワーが閉じきってから開く（iOS は閉じかけの Modal の上に出した画面が一緒に閉じられる）

## ビルド・配布

- EAS Build profile は `apps/mobile/eas.json` で `development` / `preview` / `production` の同名 EAS Environment へ明示的に対応づける。ローカル `.env.local` をクラウドビルドや EAS Update の接続先に使わない
- **ストア版の Android は `production` profile の AAB**（`pnpm build:production:android`）。`app.config.ts` の `android.adaptiveIcon`、`app.json` の `blockedPermissions` / `expo-notifications` plugin が Play 向けの設定で、Push 通知の FCM 設定（`google-services.json`）は EAS の file 型シークレット `GOOGLE_SERVICES_JSON` から `app.config.ts` が渡す。手順は [`play-store-submission.md`](play-store-submission.md)
- **本番 API に向いた APK を実機へ直接入れるときは `production-apk` profile**（`eas build --platform android --profile production-apk`）。production と同じ環境・キーストアで APK を作り、versionCode は増やさない。ストア用スクリーンショットの撮影や、Play を経由しない本番相当の確認に使う
- **Internal Distribution は `preview` profile**（Android は APK、iOS は登録済み端末向け Ad Hoc）。ローカルコマンドまたは手動の `.github/workflows/mobile-internal-build.yml` から起動し、`ios` / `all` build は `--refresh-ad-hoc-provisioning-profile` で登録済み端末を反映する。`app.config.ts` で `Cairn Dev` / `Cairn Preview` / `Cairn` の URL scheme と bundle/package ID を分離し、同一端末に共存させる
- **PR の Mobile Preview**（`.github/workflows/mobile-preview.yml`）は Vercel Deployment Protection を避けるため `https://develop.oss-cairn.com` を Web / API 接続先にする。この URL と共有 Supabase Preview 設定を EAS の `preview` 環境へ同期し、PR 固有 branch へ Development Build 用 QR を発行すると同時に `preview` channel へ OTA を配信する
  - 自動配信はモバイル関連 PR の作成時だけ。以降は権限のあるメンバーによる完全一致の `@eas update` コメントで最新 SHA を再配信する
  - 同一 PR の古い実行はキャンセルし、異なる PR は EAS 同期直前の FIFO ゲートで直列化する。このゲートは PR 配信同士を対象とし、develop からの配信とは独立して動く
- **develop から Preview 端末への OTA**（`.github/workflows/mobile-preview-update.yml`）は `develop` への push ごとに自動実行し、実行開始時点の `develop` の先頭を EAS の `preview` 環境の値で `preview` channel へ配信する（手動実行も可）。`EXPO_TOKEN` は GitHub の `Preview` Environment に置く。PR の Mobile Preview も同じ channel へ配信するため、PR 更新または develop 更新のどちらが後に完了したかで Preview 端末の最新版が変わる
- **ストア版への OTA**（`.github/workflows/mobile-production-update.yml`）は `main` への push ごとに自動実行し（paths は変更ファイル 300 件までしか見ず大きなリリースで起動漏れするため絞らない）、実行開始時点の `main` の先頭を EAS の `production` 環境の接続先で `production` channel へ配信する（手動実行も可）。届くのは `runtimeVersion` が一致するストア版だけなので、ネイティブモジュールを変えた PR は `runtimeVersion` を上げてから `main` へ入れ、ストア版を作り直す。`EXPO_TOKEN` は GitHub の `production` Environment に置く
- **OTA は前面復帰でも適用する**（`hooks/use-ota-foreground-update.ts`）。expo-updates の既定は「起動時にダウンロードし次のコールドスタートで適用」で、iOS はアプリを裏で何日も保持するため修正が届かない（Realtime の購読数削減後も旧版が全チャンネルを購読し続けた）。前面復帰時にダウンロード済みの更新があれば `reloadAsync()` で適用し、無ければ確認・ダウンロードだけして次の前面復帰で適用する。再読み込みは 15 分以上裏にいたときだけ（写真の選択・共有・ブラウザから戻った直後を避ける）、確認は 30 分に1回まで。ネイティブチャットの下書きは端末に保存していないため、未送信の入力・添付がある間は `useHoldOtaReload` で止める。再読み込みで失われる状態を持つ画面を足したら同じく保留する
- **アイコン・スプラッシュ・未ログイン画面の配色は環境で分ける**（`development` / `preview` は白＋青、`production` は紺＋緑）。`app.config.ts` がビルド環境から既定アイコン（`assets/app-icons/`）とスプラッシュを選び、ログイン・サインアップ画面は `lib/auth-palette.ts` の同じ配色を使う。画像は `node scripts/generate-icons.mjs` で再生成する
- **ログイン後のホーム画面アイコンは外観設定（テーマ・アクセント）に連動する**（`expo-alternate-app-icons`、14 種をネイティブに同梱）。初期値（システム＋エメラルド）は未設定と区別できないため環境別の既定アイコンのまま。テーマが「システム」なら OS のライト／ダークに合わせる。iOS は前面にいる間に切り替え、そのたびに OS のアラートが出る。Android は使用中に起動口を切り替えるとタスクが閉じることがあるため、バックグラウンドへ移るときに反映する。別アイコン中は `MainActivity` が無効になるので、OAuth のリダイレクト用 scheme を `android.intentFilters` で activity-alias にも付けている
- **`app.json` の `userInterfaceStyle` は `automatic`**（Android は `expo-system-ui` が必要）。`light` に固定すると `useColorScheme()` が常に light を返し、テーマ「システム」が OS のダークモードに追従しない。ステータスバーの文字色は `AppearanceProvider` がテーマに合わせる
- **Android の自動バックアップは無効（`android.allowBackup: false`）**。チャット本文を含む端末キャッシュ（SQLite）と共有の受信箱が平文のまま Google のバックアップへ載らないようにするため。端末を移行してもキャッシュと未送信の受信箱は引き継がれず、サインインからやり直す
- App Store / TestFlight は `pnpm build:production:ios` / `pnpm submit:ios:latest` / `pnpm release:testflight:ios`。手順は [`app-store-submission.md`](./app-store-submission.md)

## 他アプリからの共有の受け取り（Android のみ）

Android の共有メニューから Cairn へ画像・書類・URL・テキストを送る。ライブラリは `expo-sharing` の受け取り機能（SDK 55 では experimental）で、判定と受信箱は `lib/share-receive.ts`、ネイティブとの接続は `hooks/use-share-receive.ts`、画面は `app/(app)/share/index.tsx`。

- **iOS は入れていない**。Share Extension から本体を開く手段は responder chain 経由の `UIApplication.open` しかなく、Apple はサポートしておらず（Expo の docs も非公式で将来壊れうると明記）、App Review Guideline 2.5.1 に触れるリスクがある。ストア版の審査を危険にさらすより Android だけで出すと判断した。plugin は `ios.enabled: false` なので、拡張ターゲット・App Group・`appExtensions` は生成されず、Apple Developer 側の作業も要らない。iOS では `+native-intent` が受け取り画面へ向けず、画面への導線もない
- **`expo-share-intent` は採用しなかった**。SDK 55 対応の最終版（6.1.1）に path traversal の修正がなく（修正は SDK 57 向けの 8.0.1 以降）、共有のたびに該当処理が走る
- **Intent は `app.config.ts` の `android.intentFilters` に書く**。plugin の filter は `MainActivity` にしか付かず、外観連動の別アイコン中は共有先に出ない。`android.intentFilters` は `expo-alternate-app-icons` が全 alias へ複製する。plugin の MIME を空にしているので `MainActivity` にデータなしの空の filter が残るが、MIME 付きの共有には一致しない。plugin を有効にしているのは `share_into_scheme`（共有時に開く URL の scheme）を生成するため
- **`*/*` で受け、形式と大きさはアプリで判定する**（`shareRejectReason`）。絞ると画像と PDF を混ぜた複数共有が候補に出ない。許可外・50 MB 超・読めないファイル・添付の上限（10 件）を超えた分は、受け取り画面に理由を表示して送らない。形式と上限は `apps/web/src/lib/attachments.ts` に揃え、テストで一致を確認する。プランごとの上限はサーバーが判定する
- **遷移**: 共有は `<scheme>://expo-sharing` で開き、`app/+native-intent.ts` が `/share` へ向ける。OAuth のコールバックや開発ビルドの URL は素通しする
- **受信箱**: Intent はメモリにしかなくプロセス終了で消えるので、受け取ったらファイルを `documentDirectory/share-inbox` へ移し、内容を AsyncStorage（`cairn:share-inbox:v1`）に保存する。残すのは最後の 1 件で、新しい共有は未送信の前の共有を置き換える。送信後・取り消し・サインアウト・別ユーザーへの切り替えで消す。ログイン前に受けた共有はログイン後に、送らずに終了した共有は次の起動で画面が開く
- **ファイルの解決は共有がファイルのときだけ**。`getResolvedSharedPayloadsAsync` は URL も取得しに行くので、`useIncomingShare` は使わない
- **`patches/expo-sharing@55.0.24.patch`**: 共有元が決める表示名でキャッシュ外へ書き込めないよう、basename 化・`""` `.` `..` の拒否・`canonicalPath` の確認を入れた。同名ファイルが上書きし合わないようファイルごとに別ディレクトリへコピーし、コピーの失敗を握りつぶさず JS へ返す。`EXTRA_TEXT` のない `text/plain`（.txt ファイルの共有）もファイルとして読む
- **送信**: 添付は `useAttachmentUpload`、本文はオフラインキューの既存経路。ローカル添付の後送は未対応なので、圏外や失敗ではキューへ入れず画面にエラーを出す。ファイルは受信箱に残り、送信を押し直すと成功済みを除いて再開する。本文だけならキューが圏外でも預かる
- **宛先の並び**: 一覧 API は最終投稿日時を返さないため、端末に保存した直近の共有先（ユーザーごとに 10 件）、未読のある宛先の順に出す。アクティブなワークスペースのチャットだけが対象

## ジェスチャーとハプティクス

- **ジェスチャーは Gesture Handler、アニメーションは Reanimated。`PanResponder` を新規に使わない**。ルートに `GestureHandlerRootView` を置き、`Modal` の中にも置く（Android の `Modal` は別のウィンドウなのでルートの分が届かない）
- タップを奪わず条件を満たしてから応答するドラッグは `hooks/use-drag-pan.ts` を使う。手動の `activate` は JS スレッドから呼ぶと効かない（`runOnJS(true)` が使えない）ため、開始判定は UI スレッドで動かす。判定の純関数には `'worklet'` を付ける（`isVerticalSheetDrag` は `@cairn/shared` にあるが、Web では意味を持たない）。離したときの速度は `PanResponder` と同じ px/ms で渡す（Gesture Handler の値は px/s）
- `react-native-worklets` の Babel プラグインは `babel-preset-expo` が自動で入れるため、`babel.config.js` は置かない
- **メッセージを左へスワイプすると返信を始める**（`components/swipe-to-reply.tsx`）。56pt で軽く振動し、離すとスプリングで戻る。縦に動いたら一覧のスクロールに譲り、画面右端（24pt）から始まる指は Android のジェスチャーナビの戻るに譲る。左向きなのは LINE などと同じ操作に揃え、iOS の標準のスワイプ戻りと向きを分けるため。表とコードブロックはライブラリ内部のネイティブの横スクロールで読み進める向きが重なり、内部のスクロールビューにはジェスチャーの優先順位を付けられないので、これらを含むメッセージはスワイプの対象外にして長押しから返信する。閾値と条件は `lib/swipe-reply.ts`。長押しメニューの「返信」とスワイプは同じ `canReplyToMessage` で決め、本文を隠しているブロック中のメッセージだけは長押しメニューからの返信に限る。削除済みのメッセージは API が返さない。Web の `/chats` はホバーの「返信」ボタンのままで、変更しない
- **ハプティクスは `lib/haptics.ts` の用途別の関数から鳴らす**（`expo-haptics` を画面から直接呼ばない）。長押しメニューの表示・スワイプ返信の閾値は軽い衝撃、リアクション追加の成功・プルリフレッシュの開始は選択、送信完了は成功、送信失敗はエラー。タブ切替では鳴らさない。送信はオフラインキューの実際の完了で鳴らし、自動で再送する通信障害では鳴らさない。まとめて再送したときも1回の処理につき1度だけ。Web とテストでは何もせず、再生の失敗で画面を止めない（ログだけ残す）

## ホーム画面のクイックアクション

iOS の Home Screen Quick Actions / Android の App Shortcuts に「タスクを作成」「AI に聞く」「DM を送る」を出す（`expo-quick-actions`、`lib/quick-actions.ts` / `hooks/use-quick-actions.ts`）。

- **項目は動的登録（`setItems`）だけで作り、静的定義（iOS の `UIApplicationShortcutItems`、Android の `shortcuts.xml`）は使わない**。両 OS とも静的項目は動的項目で置き換えられず並んで出るため、`profiles.locale` に合わせた差し替えと両立しない。代わりに i18n カタログの文言を使え、`app.config.ts` に文言を持たずに済む。インストール後に一度も起動していない間は項目が出ない。未ログインでも端末の言語で登録し、サインアウトしても消さない
- ID だけを OS に渡し、`cairn://` URL を使わないので 3 バリアントの scheme の違いに影響されない
- **Android のショートカットは有効な起動口を指す必要がある**。外観連動の別アイコン中は `MainActivity` が無効で、`expo-quick-actions` の既定（`currentActivity` のクラス＝常に `MainActivity`）の Intent では起動できない。`patches/expo-quick-actions@6.0.2.patch` で宛先を `getLaunchIntentForPackage` の結果（いま有効な alias を含む起動口）に変えている。ライブラリを上げるときはパッチの要否を確認する
- **固定の非ランチャー alias を宛先にしない**。`expo-alternate-app-icons` は起動に使われた activity の名前から現在のアイコンを判定し、切り替え時にその activity を無効化するため、別の入口から起動するとアイコンの判定が壊れる
- 動的ショートカットは登録時点の起動口に結び付き、切り替えで無効になる（OS の仕様）。アイコンの切り替え成功時（`use-app-icon-sync.ts`）と Android の前面復帰時に登録し直す。バックグラウンドでの登録に失敗しても前面復帰で戻る
- 押された操作は `use-quick-actions.ts` が預かり、`(app)` レイアウトがログイン後に `followNotification` の経路で開く（未ログインならログインとオンボーディングの後に再開する）。冷起動の `initial` はプロセス中ずっと同じ値を返すので 1 回だけ読む
- タスク作成は `/(app)/tasks?new=1&open=<nonce>` → Web `/tasks?new=1` で作成モーダルを開く
- **`new=1` / `focus=1` は一度きりの指示で、Web が `open` を消費する**（`apps/web/src/lib/one-shot-request.ts`）。ネイティブで params を消すと WebView の path が変わって再読み込みされ、開いたモーダルや会話が閉じるため、消さない。URL はタブに残って WebView を作り直すと再び読み込まれるので、実行済みの `open` を localStorage に記録して同じ値では実行しない。押すたびに `open` が変わるので、もう一度押せば開き直す。`taskId` は対象を開くだけの指示で従来どおり
- AI は `/(app)/ai?focus=1&open=<nonce>` → Web `/ai?focus=1`。入力欄は会話の中にしかないため、直近の会話が空ならそれを使い回し、空でなければ新しい会話を始めて入力欄へフォーカスする（`ai-focus-step.ts`）。iOS は `keyboardDisplayRequiresUserAction` を外してキーボードを出す。Android の WebView は操作なしの `focus()` でキーボードを出さないことがあり、その場合は入力欄をタップする
- DM は `/(app)/chats?dm=1&open=<nonce>` でチャット一覧の相手選択シートを開く（`POST /api/workspaces/dms` の既存の流れ）。`FEATURE_FLAGS.dm` が無効なら項目を登録しない。ブロックなどの最終判定はサーバー

## オフライン・送信

- **端末キャッシュ基盤は `expo-sqlite`、回線復帰検知は `expo-network`**。SQLite は WAL / foreign keys を初期化する。全チャンネル検索は未実装
- **チャンネル一覧・直近 50 件のメッセージ・通知を端末に残し、圏外でも読める**（`lib/offline-cache.ts` が判定・直列化・SQL、`lib/offline-cache-store.ts` が接続、`hooks/use-offline-read.ts` が画面への適用）
  - 書き込みは取得に成功したときだけ（write-through）。読み出しは `expo-network` が明示的に圏外か、通信失敗・5xx でデータが無いときだけで、オンラインで取得できたときはキャッシュを見せない。401 / 403 / 404 はサーバーの判定なのでキャッシュで覆さず、403 / 404 は端末の行も消す
  - キャッシュは React Query のデータへ混ぜず、画面の直前で切り替える。既読化・チャンネル購読・通知遷移が古いデータで動かないようにするため
  - 古いデータを見せている間は一覧の上に「オフライン・最終同期 HH:mm」を出す（前日以前は日付も出す。複数の一覧を並べる画面はいちばん古い時刻）。キャッシュが無ければ既存のエラーを出し、空の一覧にしない。追加ページの失敗は読み込み済みのデータの鮮度と関係ないのでオフライン扱いにせず、従来のエラー表示のままにする。古い通知を見せている間は「すべて既読」を無効にする
  - メッセージは行単位でなくチャンネルごとに JSON で持ち、最近同期した 50 チャンネルだけを残す。表示は取得時のままで、削除・編集は次の同期まで反映されない。添付の本体はキャッシュしないので、画像は読み込み失敗の表示になり、本文の画像リンクはタップしても開けない
  - キャッシュのキーはユーザー × ワークスペース（メッセージはユーザー × チャンネル）。サインアウトと別ユーザーへの切り替え（QueryClient を破棄する境界）でそのユーザーの行を消し、サインイン時に他のユーザーの行も消す。書き込みと削除は 1 本の列で実行し、取得中にユーザーやワークスペースが変わった結果は書かない
  - 回線復帰イベントと前面復帰で一覧・メッセージ・通知・アカウントを invalidate する（`OfflineMessageQueueProvider`）。タイマーでの再取得はしない
  - 圏外の起動: アクセストークンが切れていると supabase-js は更新に失敗して保存を残したまま null を返し、更新の再試行で約 25 秒止まる（後続の呼び出しも認証ロックで直列に待ち、それぞれ同じだけ止まる）。明示的に圏外なら SecureStore の保存済みセッションで先に進み、通信できず更新に失敗しただけのときもサインアウト扱いにしない（`AuthGuard`）。`/api/auth/setup` に届かなくても、キャッシュがあるユーザーは一覧へ進める。アカウント情報が無い間のテーマ・言語は端末の既定に従う
  - 圏外の API: 明示的に圏外なら `apiFetch` は `getSession` を呼ばず、fetch の失敗と同じ形で即失敗する。判定は呼び出しごとに `getNetworkStateAsync`（モジュールに状態を持つと、イベントの取りこぼしで全 API が止まりかねないため）
  - 圏外の WebView タブ: ログインへ飛ばさず、オフラインでは使えない旨と再試行を出す
  - 圏外のサインアウト: `signOut` は通信に失敗しても例外を投げず、`scope: 'local'` でも保存を残す。`signOutFromDevice` は失敗時（明示的に圏外なら送る前に）SecureStore の保存を消して端末からサインアウトする。この場合サーバー側のセッションは失効させられず、refresh token の期限まで残る
  - 起動時のサインアウト: セッションが無いと確定したら（`SIGNED_OUT` か、通信失敗でない `getSession` の null）`cached_*` の全行を消す。前回の起動より後に失効した場合に行を残さないため。通信できず更新に失敗しただけのときと、圏外の起動で保存済みセッションを信用したときは消さない
- **OTA を戻しても起動できるよう、schema の版は `PRAGMA user_version` で持つ**。ストア版の内蔵バンドルと既存の OTA は `offline_schema_migrations` の最大値が 1 を超えると例外を投げ、`SQLiteProvider` が描画中に再送出するため、この表へ 2 を書くと古いバンドルへ戻した端末が起動できなくなる。この表は 1 のまま増やさない（古いバンドルは `cached_*` の表を無視して動く）。アプリより新しい `user_version` はキャッシュを捨てて作り直す。`SQLiteProvider` は開けないと例外か空描画になるため使わず、`openDatabaseAsync` で起動と独立に開き、失敗してもキャッシュなしとして動かす
- **本文・返信の送信は必ずオフラインキューを経由する**。初回 POST より前にユーザー別 AsyncStorage へ保存し、保存完了後に即時送信、失敗時は8秒間隔・前面復帰時に自動再送する。`expo-network` が明示的に圏外なら POST を抑止し、復帰イベントで即時再送する アカウント切り替え時には以前のキューの送信を止め、送信時に本人のセッションを照合して使う。
- クライアント生成 UUID を `messages.id` として API へ渡して再送を冪等化し、通信障害時は後続送信を止めて順序を維持する。完全オフラインで選択したローカル添付ファイルの後送は未対応（共有の受け取りも同じ）

## 認証

- WebView はワンタイムトークンハンドオフ方式（refresh_token 共有は禁止）。詳細は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md)
- **Google ログインはネイティブ実装**: `expo-web-browser` で認可コードを受け取り、Supabase の PKCE フロー（`exchangeCodeForSession`）で交換する（`apps/mobile/lib/oauth.ts`）。redirect 先 `cairn://auth/callback` は Supabase の許可リストに登録が必要（ローカルは `supabase/config.toml` の `additional_redirect_urls`、本番はダッシュボードの Redirect URLs）。初回ログイン時も `/api/auth/setup` で profiles を作成する
- **Apple / Google の追加ログイン手段は設定から手動連携**: 同一メールの自動紐付けに加え、設定 → アカウント → ログイン方法で `linkIdentity` により明示連携できる（Apple relay email 対応）。ローカルは `enable_manual_linking = true`、Preview / Production は Dashboard で Manual Linking を有効化する。Expo の設定 WebView は bridge（`link-apple-identity` / `link-google-identity`）経由で連携する

## プッシュ通知

- 起動時に OS の通知許可を求め（ダイアログは初回だけ）、許可されていれば Expo push token を `/api/push/subscribe` に登録する
- 通知一覧（スライドインと通知画面）の上部の「Push通知」スイッチは「OS が許可済み」かつ「この端末でオフにしていない」ときにオン。オフにした記録は AsyncStorage にユーザーごと（`cairn:push_enabled_mobile:<userId>`）に残し、起動時の登録も止める。オフは解除が成功するまで `off-pending` として保存し、起動時と表示更新のたびに解除を送り直す（アプリの終了や通信失敗でサーバーに登録が残らないように）。スライドインと通知画面のスイッチは、保存時の通知で互いに読み直す。オフでは `DELETE /api/push/subscribe` にこの端末のトークンを送り、サーバーの登録を外す。登録と解除は1本の列で順に実行し、送る直前に始めたユーザーのままサインインしているか確かめてそのセッションで送る（途中で別アカウントへ切り替わったら送らない）。登録は順番が来た時点でオフの記録を確かめ直す（遅れて届いた登録がオフ後に購読を作り直さないように）
- オンにしたとき OS が未許可なら許可ダイアログを出す。iOS の一度拒否・Android 13+ の2回拒否・端末設定やチャンネルでのオフはダイアログで戻せないため、設定アプリを開く。戻ると（AppState が active）許可状態を取り直して登録する
- トークン取得は iOS で APNs の応答が無いと決着しないことがあるため、取得と登録に時間切れを付け（サーバーへの送信は時間切れでリクエスト自体を中断し、遅れて届いた送信が登録・解除の順序を逆転させないようにする）、失敗は通知一覧にエラーと再試行として出す
- **Push の宛先は、その端末で最後に登録したユーザーだけ**。一意制約は `(user_id, expo_token)` で同じ端末のトークンが複数ユーザーに残りうるため、そのままだと前のユーザー宛ての通知本文とバッジが端末に届き続ける。`POST /api/push/subscribe` は同じトークンの他ユーザーの行を消し、アプリのサインアウトは `signOut` より前に `unregisterPushTokenForSignOut` で登録を外す（登録・解除と同じ列で実行）。解除の失敗・圏外・時間切れ（5 秒）ではサインアウトを止めずログだけ残す。この場合、次にその端末で別のユーザーが登録するまで前のユーザーの登録が残る

## アプリアイコンのバッジ

- **数字の定義は Web Push と同じ `getUnreadNotificationCount`（全ワークスペース横断、非活性ワークスペースを除く未読のアプリ内通知の数）**。OS のアイコンにワークスペースの概念がないため。チャットの未読は混ぜない。ベルの数字はアクティブワークスペース単位なので一致しないことがある（`useUnreadNotificationCount` はバッジに使わない）
- **サーバー値が真で、クライアントは追従するだけ**。`hooks/use-app-badge-sync.ts` が `GET /api/notifications/badge-count` の値を `setBadgeCountAsync` で反映する。契機は起動時・前面復帰時・既読化後・Realtime の通知更新後で、後の2つは `['notifications']` の invalidate に乗る。タイマーの再取得は置かない
- アプリが背景にいる間は Expo Push の `badge`（iOS）が数字を更新する。別の端末で既読にした分は、Push が来ないため次に前面へ戻るまで減らない（割り切り）。閲覧中のメンションの Push は `updateAppBadge: false` で `badge` を付けない
- 取得に失敗しても 0 にせず、今の数字を据え置いて `console.warn` に記録する。アイコンの数字に画面はないため、既存のバッジを誤って消さないことを優先する（Web の `AppBadgeSync` と同じ）
- サインアウト・別ユーザーへの入れ替え・未ログインの起動では 0 にする（`app/_layout.tsx` のアカウントの境界）
- **「Push通知」スイッチがオフでもバッジの同期は続ける**。スイッチは Push の配信だけを止める。Push が届かないので背景では更新されず、前面にいる間だけ追従する
- Android はランチャーによって数字が出ない（ドットだけ・表示なし）。`setBadgeCountAsync` が `false` を返してもエラーにしない。iOS でもバッジの許可がなければ表示されない
- **Android の `setBadgeCountAsync(0)` は expo-notifications の実装上、通知トレイのこのアプリの通知もすべて消す**（`NotificationManager.cancelAll()`）。未読 0 はトレイの通知がすべて既読という意味なので許容している。同期は前面でしか走らないため、背景で届いた通知は開くまで消えない

JS のみの変更で、runtimeVersion は変えない。同じ runtimeVersion のビルドへ EAS Update で配信できる。

配信順: Expo Push に `badge` を載せる Web 変更を先にデプロイし、その後に OTA を配信する。DB マイグレーションは不要。

## リアクションの選択

チャットのクイック選択は、追加に成功したリアクションの使用順に6件を表示する。履歴は AsyncStorage に端末内・ユーザーごとに最大32件保存し、不足分は既定の6種類で補う。取り消しや送信失敗では更新しない。クイック選択の下の「もっと見る」（またはシート上部の上スワイプ）で Web と同じ `@emoji-mart/data` に基づく一覧を開き、英語名・絵文字で検索、カテゴリ・肌の色を選択できる。下スワイプで一覧をたたみ、たたんだ状態なら閉じる。検索と一覧はオフラインでも使える。履歴の並べ方・絞り込み・スワイプ判定は `@cairn/shared` の `reactions.ts` を Web と共有する（Web の履歴はブラウザの localStorage に保存し、アプリとは共有しない）。

追加依存は絵文字データのみで、ネイティブモジュールと runtimeVersion は変更しない。同じ runtimeVersion のビルドへ EAS Update で配信できる。

配信順: 結合絵文字（家族・複数の肌の色など）を扱うため、リアクションAPIの長さ上限を32 UTF-16コード単位へ拡張するWeb変更を先にデプロイし、その後にOTAを配信する。DBマイグレーションは不要。
