# Google Play ストア申請手順

> 対象: `apps/mobile` の Cairn 本番アプリ（Android package: `com.oss_cairn`）。iOS は [`app-store-submission.md`](app-store-submission.md)。

iOS は App Store 公開済みだが、Android はまだ Google Play に登録していない。この文書は、Play Console の開発者登録から内部テスト → 製品版公開までの手順と、リポジトリ側で済んでいるものを分けて書く。Play Console の仕様・ポリシーは変わるため、作業時は各項目を Play Console の画面と [Play Console ヘルプ](https://support.google.com/googleplay/android-developer) で確認する。

## リポジトリ内で準備済みのもの

- `apps/mobile/app.json`
  - `android.adaptiveIcon`: `assets/adaptive-icon.png`（前景、1024×1024、セーフゾーン内にロゴ）+ 背景色 `#0B1622`。Play のアイコン審査（マスク形状で切れない）に対応
  - `android.blockedPermissions`: Expo のテンプレートが足す `RECORD_AUDIO` / `SYSTEM_ALERT_WINDOW` を除去。Cairn は録音もオーバーレイも使わないため、Data safety とマニフェスト審査で説明不要にする
  - `expo-notifications` plugin: ステータスバー用の単色通知アイコン `assets/notification-icon.png` とアクセント色。未設定だとアプリアイコンが白い四角として表示される
  - 残る権限は `INTERNET` / `ACCESS_NETWORK_STATE` / `VIBRATE` / `DOWNLOAD_WITHOUT_NOTIFICATION`（添付ファイルの保存）/ Android 12 以下限定の `READ_EXTERNAL_STORAGE` `WRITE_EXTERNAL_STORAGE`（`maxSdkVersion=32`）。Android 13 以降は写真ピッカーを使うため `READ_MEDIA_*` を要求せず、Play の「写真と動画の権限」ポリシーの申告対象にならない
- `apps/mobile/app.config.ts`: `GOOGLE_SERVICES_JSON` 環境変数（EAS の file 型シークレット）から `android.googleServicesFile` を渡す
- `apps/mobile/eas.json`: `submit.production.android`（`internal` トラック、`releaseStatus: draft`）。`eas submit` は build profile の `env` を読まず `app.config.ts` が開発用の package に解決してしまうため、`applicationId: com.oss_cairn` を固定して本番の認証情報を引けるようにしている
- `apps/mobile/package.json`: `build:production:android` / `submit:android` / `submit:android:latest` / `release:play:android`
- `apps/mobile/.eas/workflows/submit-android.yml`: 手動起動する「本番ビルド → 内部テストへ提出」の EAS Workflow
- `apps/mobile/store/play-listing.ja.md`: Play Console へ貼り付ける日本語の掲載文と素材仕様
- `https://oss-cairn.com/privacy` / `https://oss-cairn.com/terms`: 公開法務ページ
- アプリ内のアカウント削除（設定 → アカウント → アカウントを削除）、メッセージ報告・ユーザーブロック（UGC ポリシー対応）

## 全体の流れ

1. Google Play デベロッパー アカウントを作成し、本人確認を終える
2. Firebase プロジェクトを作り、FCM V1 の認証情報を EAS へ登録する（Push 通知）
3. `eas build --platform android --profile production` で署名鍵（upload key）を EAS に作らせ、AAB を得る
4. Play Console でアプリを作成し、**最初の AAB は手動でアップロード**して内部テストを開始する
5. 掲載情報・アプリのコンテンツ（データ セーフティ、コンテンツのレーティング、アプリのアクセス権 など）を埋める
6. Play Console でサービス アカウントに権限を付け、以降は `pnpm submit:android:latest` / EAS Workflow で提出する
7. クローズド テスト（個人アカウントの場合は必須要件あり）→ 製品版の審査に送る

## 1. デベロッパー アカウント

- [Play Console](https://play.google.com/console) で登録する。登録料は 1 回限り（US$25）。
- **個人アカウントか組織アカウントかを先に決める。** 2023 年 11 月以降に作成した個人アカウントは、製品版へ出す前に「クローズド テストで 12 人以上のテスターが 14 日間連続でオプトイン」した実績と、製品版アクセスの申請が必要。組織アカウント（D-U-N-S 番号で法人確認）はこの要件がないが、法人確認に日数がかかる。Cairn は OSS として「Cairn Project」名義で配布しているため、どちらで出すか（表示されるデベロッパー名・住所・連絡先メールも公開される）を決めてから登録する。
- 本人確認（身分証、電話番号、メール）を完了しないとアプリを公開できない。
- Apple と同様、審査用アカウントのパスワード・サービス アカウント鍵・keystore はリポジトリに入れない。

## 2. Push 通知（FCM V1）

Expo Push Service は Android では FCM 経由で配信するため、**FCM の設定が無いと `getExpoPushTokenAsync()` が失敗し、本番 Android では通知が一切届かない**。iOS の APNs 鍵とは別に次を用意する。

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作り、Android アプリを `com.oss_cairn` で追加する（preview 版の通知も確認するなら `com.oss_cairn.preview` も同じプロジェクトに追加する）。
2. `google-services.json` をダウンロードし、**コミットせず**に EAS の Environment へ file 型のシークレットとして登録する。

   ```bash
   cd apps/mobile
   eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --visibility secret --value ./google-services.json
   # preview 版でも通知を確認するなら同じ名前で preview 環境にも登録する
   ```

   `app.config.ts` が `GOOGLE_SERVICES_JSON` を `android.googleServicesFile` に渡す。

3. Firebase の「プロジェクトの設定 → サービス アカウント」から秘密鍵（JSON）を生成し、`eas credentials --platform android` → production → `Google Service Account` → `FCM V1` でアップロードする。これは Expo Push Service がサーバー側で FCM を叩くための鍵で、手順 6 の Play 提出用サービス アカウントとは別物。
4. 本番ビルドを Android 実機に入れ、通知一覧のスイッチをオンにして `push_subscriptions` に `ExponentPushToken[...]` が保存され、メンションで通知が届くことを確認する。

Web 側（`apps/web/src/lib/push/send.ts`）は Expo Push Service へ送っているだけなので変更不要。

## 3. 署名鍵と本番ビルド

```bash
cd apps/mobile
pnpm build:production:android
```

- 初回は「Generate a new Android Keystore?」と聞かれるので **Yes** を選ぶ。EAS が upload key を生成・保管する。ローカルに keystore を持たないため、`eas credentials --platform android` 以外で取り出さない。
- Play Console 側は **Play App Signing** を使う（アプリ作成時に自動で有効）。Google が配布用の署名鍵を持ち、EAS の鍵は upload key として登録される。upload key を失っても Play Console から再設定を申請できる。
- バージョンは `appVersionSource: remote` + `autoIncrement` のため、`versionCode` は EAS が自動で増やす。`versionName` は `app.json` の `version`（iOS と共通）。
- 成果物は AAB（`.aab`）。実機で動作確認したいときは Play Console の内部テスト経由で配る（`preview` profile の APK は package が `com.oss_cairn.preview` で別アプリになる）。

## 4. Play Console でアプリを作成し、最初の AAB を手動アップロード

1. Play Console →「アプリを作成」
   - アプリ名: Cairn
   - デフォルトの言語: 日本語（日本）
   - アプリ / ゲーム: アプリ、無料
   - デベロッパー プログラム ポリシーと米国輸出法の確認にチェック
2. 「テストとリリース → 内部テスト → 新しいリリースを作成」で、EAS からダウンロードした AAB をアップロードする。**EAS Submit は Play Console に 1 つ以上のビルドが存在しないと使えない**ため、最初だけ手動で行う。
3. テスターのメーリングリストを作り、開発者自身と検証端末のアカウントを登録する。内部テストは審査なしで配信され、最大 100 人まで。
4. リリース名・リリースノート（日本語）を入れて「リリースを確認」→「内部テストとして公開を開始」。

無料アプリでも「有料アプリ」から無料には戻せても逆はできないので、価格設定は無料のままで良いか確認する。

## 5. ストアの掲載情報とアプリのコンテンツ

### メインのストアの掲載情報

[`apps/mobile/store/play-listing.ja.md`](../apps/mobile/store/play-listing.ja.md) の文面と素材を Play Console に入力する。EAS Metadata（`store.config.json`）は App Store 専用で Play には同期できない。

- アプリアイコン 512×512（`assets/icon.png`）
- フィーチャー グラフィック 1024×500（**必須**。まだ作っていない）
- スマートフォン用スクリーンショット 2〜8 枚（内部テスト版の本番ビルドから撮る）
- カテゴリ「仕事効率化」、連絡先メール、ウェブサイト、プライバシー ポリシー URL

### アプリのコンテンツ（ポリシー → アプリのコンテンツ）

すべて埋めないと製品版に送れない。Cairn の実装に合わせた回答の起点は次のとおり。

| 項目                                                    | Cairn の回答の起点                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| プライバシー ポリシー                                   | `https://oss-cairn.com/privacy`                                                                                                                                                                                                                                                                                                                             |
| アプリのアクセス権                                      | 「すべての機能または一部の機能が制限される」を選び、審査用アカウント（メール・パスワード）とログイン手順を登録する。iOS の App Review Information と同じ専用アカウント・サンプルワークスペースを使う                                                                                                                                                        |
| 広告                                                    | 広告なし                                                                                                                                                                                                                                                                                                                                                    |
| コンテンツのレーティング                                | IARC アンケート。「ユーティリティ / 仕事効率化 / コミュニケーション」カテゴリ。ユーザー間のやり取り（チャット、ファイル共有）あり、個人情報の共有あり、と正直に回答する                                                                                                                                                                                     |
| ターゲット ユーザーとコンテンツ                         | 18 歳以上（子ども向けではない）。13 歳未満を対象に含めない                                                                                                                                                                                                                                                                                                  |
| ニュース アプリ / COVID-19 / 政府機関 / 金融機能 / 健康 | いずれも該当なし（請求機能はサブスクリプションであり金融サービスではない）                                                                                                                                                                                                                                                                                  |
| データ セーフティ                                       | 下記                                                                                                                                                                                                                                                                                                                                                        |
| ユーザー生成コンテンツ（UGC）                           | 該当あり。アプリ内の報告（メッセージ長押し → 報告）、ブロック（同操作 → ブロック、解除は設定 → 安全・サポート）、運営者による削除を申告する                                                                                                                                                                                                                 |
| アカウントの削除                                        | 「アカウントを作成できる」を選び、アプリ内の導線（設定 → アカウント → アカウントを削除）と、**Web でアカウント削除を依頼できる URL** を登録する。Web 版の設定画面（ログイン後）が該当するが、Play はログインなしで到達できる説明ページを求めることがあるため、`https://oss-cairn.com/privacy#account-deletion` のような説明セクションを用意してから登録する |

### データ セーフティの申告候補

iOS の App Privacy（[`app-store-submission.md`](app-store-submission.md#app-privacyの申告候補)）と同じ内容を Play の分類に写す。本番の SDK 構成（PostHog 等）を確認してから確定する。

| データ種別                                           | 収集 / 共有 | 用途                         | 備考                     |
| ---------------------------------------------------- | ----------- | ---------------------------- | ------------------------ |
| 氏名、メールアドレス                                 | 収集        | アプリの機能、アカウント管理 | 必須                     |
| ユーザー ID                                          | 収集        | アプリの機能、分析           |                          |
| メッセージ、写真、ファイル（ユーザー生成コンテンツ） | 収集        | アプリの機能                 | ユーザーが任意で送信     |
| 購入履歴                                             | 収集        | アプリの機能                 | サブスクリプション契約時 |
| アプリの操作、診断情報                               | 収集        | 分析、品質改善               | 分析 SDK の有無で確定    |
| 端末 ID（Push トークン）                             | 収集        | アプリの機能（通知）         | 通知をオンにした端末のみ |

「送信中に暗号化」「ユーザーがデータ削除を依頼できる」は「はい」。第三者への「共有」は、Supabase / Expo Push / AI プロバイダなどのサービス プロバイダ利用はデータ セーフティ上の「共有」に当たらない（委託先）が、Play の定義を読んで判断する。

## 6. EAS Submit の設定（2 回目以降の提出を自動化）

1. Google Cloud Console で Firebase とは別でも同じでもよいプロジェクトにサービス アカウントを作り、JSON 鍵をダウンロードする。
2. Play Console →「ユーザーと権限 → 新しいユーザーを招待」でそのサービス アカウントのメールを招待し、アプリ単位で「リリースを管理」権限（テスト トラックへの公開、製品版への公開）を付ける。
3. `apps/mobile` で `eas credentials --platform android` → production → `Google Service Account` → `Play Store Submissions` に JSON をアップロードする。`eas.json` に `serviceAccountKeyPath` を書かず、EAS 側に保存した鍵を使う（鍵をリポジトリに置かないため）。
4. 以降は次のいずれかで提出する。

   ```bash
   cd apps/mobile
   pnpm submit:android:latest      # 直近の production ビルドを内部テストへ
   pnpm release:play:android       # ビルドと提出を連続実行
   eas workflow:run submit-android.yml
   ```

`eas.json` の `releaseStatus` は、**アプリが一度も製品版公開されていない間は `draft` でないと API が拒否する**ため `draft` にしてある。Play Console でドラフトのリリースを開いて「公開」する運用になる。製品版公開後に `completed` へ変えると、提出と同時に内部テストへ配信される。

## 7. クローズド テスト → 製品版

- 個人アカウントの場合は「クローズド テスト」トラックを作り、12 人以上のテスターに 14 日間連続でオプトインしてもらってから「製品版アクセスを申請」する。テスターは Google グループまたはメールリストで管理し、オプトイン URL を共有する。
- 製品版の初回審査は数日〜1 週間程度かかる。審査中にアプリのコンテンツの回答や審査用アカウントを変えない。
- 公開国・地域は日本から始め、必要に応じて広げる（法務ページは日本語のみ）。
- 公開後の OTA は iOS と同じ `.github/workflows/mobile-production-update.yml`（`main` への push）で `production` channel に届く。`runtimeVersion` が一致するストア版だけに届くため、ネイティブモジュールを変えたら iOS と同様に `runtimeVersion` を上げてから Android も作り直す。

## 本番相当の確認項目（Android 固有）

[`app-store-submission.md`](app-store-submission.md#本番相当の確認項目) の共通項目に加えて次を確認する。

- Android 13 以降で通知権限の許可ダイアログが出て、許可後に Push が届く。拒否 2 回目以降や通知チャンネルをオフにした状態で、通知一覧のスイッチから端末の設定アプリへ誘導される
- バックグラウンド・端末再起動後も通知が届き、通知タップで該当チャットが開く
- 写真ピッカー（Android 13 以降は権限ダイアログなし、12 以下はストレージ権限）で画像を添付できる
- PDF がアプリ内（Pdfium）で開き、Office ファイルが共有シートへ渡る
- Google ログイン（`expo-web-browser` → `cairn://auth/callback`）がブラウザから戻ってくる。Chrome 以外の既定ブラウザでも確認する
- 戻るジェスチャー / ボタンで WebView の履歴とネイティブ画面の遷移が破綻しない
- 画面回転・フォントサイズ最大・ダークテーマ・TalkBack の主要導線
- Play Console の「リリース前レポート」（内部テスト公開後に自動で走る）でクラッシュ・アクセシビリティ・セキュリティの警告がないこと

## 製品版送信前のブロッカー

- [x] Play デベロッパー アカウント: クラウド版の運営者である株式会社オリカタ（orikata, Inc.）の組織アカウントで、アプリ「Cairn」（`com.oss_cairn`）を作成済み
- [x] Firebase プロジェクト `cairn-9f6f3`（Analytics オフ）に Android アプリ `com.oss_cairn` を登録し、`google-services.json` を EAS production の `GOOGLE_SERVICES_JSON` に登録済み
- [ ] FCM V1 サービス アカウント鍵を `eas credentials` で登録し、本番ビルドで通知が届くことを確認する
- [ ] `pnpm build:production:android` で upload key を生成し、AAB を Play Console に手動アップロードして内部テストを開始する
- [x] フィーチャー グラフィック（1024×500）を作成・アップロード済み
- [ ] スマートフォン用スクリーンショットを内部テスト版から撮影してアップロードする
- [x] アカウント削除 URL に `https://oss-cairn.com/privacy#retention` を登録済み（ログイン不要）。Play は保持期間の明記を求めるため、バックアップの保持期間を具体的な日数で追記するとより確実
- [x] データ セーフティ、コンテンツのレーティング（IARC 12 歳以上相当）、ログインの詳細（iOS と同じ審査用アカウント）、ターゲット ユーザー（18 歳以上）、広告・広告 ID・行政・金融・健康の申告を完了
- [ ] Play 提出用サービス アカウントを招待し、EAS に鍵を登録して `pnpm submit:android:latest` が通ることを確認する
- [ ] 個人アカウントの場合、クローズド テストで 12 人 × 14 日の要件を満たして製品版アクセスを申請する
