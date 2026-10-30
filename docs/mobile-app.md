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
- ネイティブチャットも Web と同じ private Realtime Broadcast（`user:{userId}` / `channel:{channelId}`）で更新し、ポーリングは使わない
- **チャット添付の画像・PDF・Markdown はアプリ内のモーダルで開き、ピンチで拡大できる**（`chat-image-viewer.tsx` / `chat-pdf-viewer.tsx` / `chat-markdown-viewer.tsx`）。画像は iOS では `ScrollView` の拡大（PDF・Office と同じ UIScrollView）、`ScrollView` が拡大に対応しない Android ではキャッシュしたファイルを WebView で表示して拡大する。Markdown はネイティブの描画を拡大すると文字がぼやけ Android では拡大もできないため、Web と同じ mdast 系で HTML にして（生の HTML は文字に、画像は自動取得しないリンクに変える）JavaScript を無効にした WebView で表示する（`attachment-viewer-html.ts`）。判定は Web のテキストプレビューと同じく `text/markdown` か `.md` / `.markdown` で、`.txt` は除く。変換は JS スレッドで同期的に走りモーダルを閉じられなくなるため、300KB を超えるファイルは描画せず他のアプリで開く導線を出す。PDF の取得は共有シートと同じ `attachment-cache.ts` のキャッシュを使い、描画は `pdf-document-view.tsx` が端末ごとに切り替える。iOS は `react-native-pdf`（PDFKit）で、長押しで文字を選択・コピーできる。Android の `react-native-pdf`（Pdfium）はページを画像として描くだけで文字を選べないため、`pdf-document-view.android.tsx` で pdf.js（`pdfjs-dist` の legacy ビルド）を WebView で動かし、テキストレイヤーで選択・コピーできるようにしている。ネイティブ依存を足さず EAS Update で配れるよう、pdf.js 本体・worker・CMap（フォントを埋め込まない日本語 PDF 用）・画像復号の wasm は `metro-pdfjs-transformer.js` が `lib/pdfjs-assets.js` を置き換えて JS バンドルへ同梱する（CDN からは読まない。Android のバンドルだけに入る）。WebView にはファイルの読み取り権限を与えず、CSP で外部への接続も止め、PDF 本体は pdf.js が要求した範囲だけをアプリが表示中のファイルから読んで渡す。PDF 内の JavaScript は実行しない（pdf.js の sandbox は同梱しない）。大きな PDF でもメモリが溢れないよう、ページは画面の前後1画面分だけ描画し、3画面分より離れたら描画を捨てる。拡大は WebView のピンチで、拡大後は見えているページを細かく描き直す。埋め込みのない欧文の標準フォントは端末のフォントで代用する。iOS では Word / Excel / PowerPoint も `chat-office-viewer.tsx` で開く。WKWebView が OS 標準のプレビューで Office ファイルを描画できるため、ネイティブ依存を足さずに同じキャッシュのファイルを `file://` で読み込む（Android の WebView は描画できないため共有シートのまま）。WebView は描画方法をファイルの拡張子で決めるため、Office 判定は MIME ではなく拡張子だけで行い、読み取りは表示中のファイルだけに絞って JavaScript を無効にする（MIME だけ Office の HTML などをキャッシュ内の他ファイルが読める状態で描画させない）。それ以外の形式は共有シートで外部アプリに渡す。PDF と Office ファイル内のリンクはチャット本文と同じ `resolveMobileMarkdownLink` で判定する
- **チャット本文の Markdown は `react-native-enriched-markdown` でネイティブ描画する**（`mobile-markdown.tsx`）。パーサー（md4c）はネイティブ側にあるため、メンション・画像の自動取得禁止・長い URL の省略・`||` と HTML のエスケープは `lib/mobile-markdown-source.ts` で、Web と同じ mdast（GFM）の構文木の上で適用してから Markdown に戻す。コードハイライト・数式・動画はルートと `apps/mobile` の `package.json` の `enriched-markdown` ブロックで無効にし、install 時のネイティブ資産ダウンロードも止めている。表示規則は [`.interface-design/system.md`](../.interface-design/system.md) の「React NativeチャットのMarkdown本文」
- **ネイティブチャットの長押しメニューの並びは、返信 →（自分のメッセージなら）編集 → テキストをコピー → テキストを選択 → タスク化 → ブックマーク → リアクション → 共有 →（可能なら）スレッドに切り出す → 末尾に削除（自分）/報告（他者）**。ブロック済みユーザーのメッセージは「一時的に表示」を返信の直後に置き、コピー・選択は出さない。コピーは `expo-clipboard` でメンションを `@表示名` に直した本文を書き込み、「テキストを選択」は `components/text-select-sheet.tsx` の全画面（iOS は読み取り専用の複数行 `TextInput`、Android は `selectable` な `Text`）で OS の選択メニューを使う。本文自体は `selectable={false}` のまま。メニューにブロックは置かず、報告の送信後のダイアログから「このユーザーをブロック」を出す（App Store 1.2）
- **ネイティブチャットでは、メッセージの送信者のアイコン・名前をタップすると下シートのプロフィール（`components/user-profile-sheet.tsx`）が開く。人単位の操作（メッセージを送る＝DM、メンション、ブロック／ブロック解除）の置き場で、本文の長押しメニューはメッセージ単位の操作のまま**。プロフィール情報（ワークスペースのロール・参加月・プロフィール属性）は `GET /api/workspaces/members` から引き、取得できないときは代替表示せずエラーを出す。出す操作は `lib/user-profile-actions.ts` で決める（自分には出さない、`FEATURE_FLAGS.dm` が無効なら DM を隠す、ブロック中は DM の代わりに解除、メンションは入力欄の候補と同じ集合に限る）。ブロック中かどうかはメッセージの `blocked` ではなく `GET /api/me/blocks`（自分 → 相手の向きだけ）で判定する（`blocked` は相手からのブロックでも立ち、解除できないブロックに「解除」を出してしまうため）。DM はサーバーが双方向のブロックで拒否するため、`blocked` が立っていれば DM は出さない。最終判定は常にサーバー。システムメッセージは開かない
- **「スレッドに切り出す」はネイティブチャットの長押しメニューにあり、範囲は「このメッセージだけ」「このメッセージ以降すべて」の2つに限る**（`components/move-to-thread-sheet.tsx`）。複数選択（チェックボックス）は Web のみ。API は Web と同じ `POST /api/channels/{id}/move-to-thread`。ネイティブには `?m=` のメッセージジャンプがなく、リンクや検索・ブックマークからの移動は WebView の Web 版が担うため、リンク・検索・ブックマークでの移動済みメッセージの解決（`GET /api/messages/{id}/location`）は Web 側で行う。通知（Push・通知一覧・通知パネル）だけはネイティブでも同じ API で移動先を確認して開き、見つからない・確認できないときは古いチャンネルを開かずにエラーを表示する（`lib/follow-notification.ts`）
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
- **アイコン・スプラッシュ・未ログイン画面の配色は環境で分ける**（`development` / `preview` は白＋青、`production` は紺＋緑）。`app.config.ts` がビルド環境から既定アイコン（`assets/app-icons/`）とスプラッシュを選び、ログイン・サインアップ画面は `lib/auth-palette.ts` の同じ配色を使う。画像は `node scripts/generate-icons.mjs` で再生成する
- **ログイン後のホーム画面アイコンは外観設定（テーマ・アクセント）に連動する**（`expo-alternate-app-icons`、14 種をネイティブに同梱）。初期値（システム＋エメラルド）は未設定と区別できないため環境別の既定アイコンのまま。テーマが「システム」なら OS のライト／ダークに合わせる。iOS は前面にいる間に切り替え、そのたびに OS のアラートが出る。Android は使用中に起動口を切り替えるとタスクが閉じることがあるため、バックグラウンドへ移るときに反映する。別アイコン中は `MainActivity` が無効になるので、OAuth のリダイレクト用 scheme を `android.intentFilters` で activity-alias にも付けている
- App Store / TestFlight は `pnpm build:production:ios` / `pnpm submit:ios:latest` / `pnpm release:testflight:ios`。手順は [`app-store-submission.md`](./app-store-submission.md)

## オフライン・送信

- **端末キャッシュ基盤は `expo-sqlite`、回線復帰検知は `expo-network`**。SQLite は WAL / foreign keys を初期化し、メッセージキャッシュ・全チャンネル検索は schema migration で追加する
- **本文・返信の送信は必ずオフラインキューを経由する**。初回 POST より前にユーザー別 AsyncStorage へ保存し、保存完了後に即時送信、失敗時は8秒間隔・前面復帰時に自動再送する。`expo-network` が明示的に圏外なら POST を抑止し、復帰イベントで即時再送する
- クライアント生成 UUID を `messages.id` として API へ渡して再送を冪等化し、通信障害時は後続送信を止めて順序を維持する。完全オフラインで選択したローカル添付ファイルの後送は未対応

## 認証

- WebView はワンタイムトークンハンドオフ方式（refresh_token 共有は禁止）。詳細は [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md)
- **Google ログインはネイティブ実装**: `expo-web-browser` で認可コードを受け取り、Supabase の PKCE フロー（`exchangeCodeForSession`）で交換する（`apps/mobile/lib/oauth.ts`）。redirect 先 `cairn://auth/callback` は Supabase の許可リストに登録が必要（ローカルは `supabase/config.toml` の `additional_redirect_urls`、本番はダッシュボードの Redirect URLs）。初回ログイン時も `/api/auth/setup` で profiles を作成する
- **Apple / Google の追加ログイン手段は設定から手動連携**: 同一メールの自動紐付けに加え、設定 → アカウント → ログイン方法で `linkIdentity` により明示連携できる（Apple relay email 対応）。ローカルは `enable_manual_linking = true`、Preview / Production は Dashboard で Manual Linking を有効化する。Expo の設定 WebView は bridge（`link-apple-identity` / `link-google-identity`）経由で連携する

## プッシュ通知

- 起動時に OS の通知許可を求め（ダイアログは初回だけ）、許可されていれば Expo push token を `/api/push/subscribe` に登録する
- 通知一覧（スライドインと通知画面）の上部の「Push通知」スイッチは「OS が許可済み」かつ「この端末でオフにしていない」ときにオン。オフにした記録は AsyncStorage にユーザーごと（`cairn:push_enabled_mobile:<userId>`）に残し、起動時の登録も止める。オフは解除が成功するまで `off-pending` として保存し、起動時と表示更新のたびに解除を送り直す（アプリの終了や通信失敗でサーバーに登録が残らないように）。スライドインと通知画面のスイッチは、保存時の通知で互いに読み直す。オフでは `DELETE /api/push/subscribe` にこの端末のトークンを送り、サーバーの登録を外す。登録と解除は1本の列で順に実行し、送る直前に始めたユーザーのままサインインしているか確かめてそのセッションで送る（途中で別アカウントへ切り替わったら送らない）。登録は順番が来た時点でオフの記録を確かめ直す（遅れて届いた登録がオフ後に購読を作り直さないように）
- オンにしたとき OS が未許可なら許可ダイアログを出す。iOS の一度拒否・Android 13+ の2回拒否・端末設定やチャンネルでのオフはダイアログで戻せないため、設定アプリを開く。戻ると（AppState が active）許可状態を取り直して登録する
- トークン取得は iOS で APNs の応答が無いと決着しないことがあるため、取得と登録に時間切れを付け（サーバーへの送信は時間切れでリクエスト自体を中断し、遅れて届いた送信が登録・解除の順序を逆転させないようにする）、失敗は通知一覧にエラーと再試行として出す

## リアクションの選択

チャットのクイック選択は、追加に成功したリアクションの使用順に6件を表示する。履歴は AsyncStorage に端末内・ユーザーごとに最大32件保存し、不足分は既定の6種類で補う。取り消しや送信失敗では更新しない。クイック選択の下の「もっと見る」（またはシート上部の上スワイプ）で Web と同じ `@emoji-mart/data` に基づく一覧を開き、英語名・絵文字で検索、カテゴリ・肌の色を選択できる。下スワイプで一覧をたたみ、たたんだ状態なら閉じる。検索と一覧はオフラインでも使える。履歴の並べ方・絞り込み・スワイプ判定は `@cairn/shared` の `reactions.ts` を Web と共有する（Web の履歴はブラウザの localStorage に保存し、アプリとは共有しない）。

追加依存は絵文字データのみで、ネイティブモジュールと runtimeVersion は変更しない。同じ runtimeVersion のビルドへ EAS Update で配信できる。

配信順: 結合絵文字（家族・複数の肌の色など）を扱うため、リアクションAPIの長さ上限を32 UTF-16コード単位へ拡張するWeb変更を先にデプロイし、その後にOTAを配信する。DBマイグレーションは不要。
