# iOS App Store申請手順

> 対象: `apps/mobile` のCairn本番アプリ（Bundle ID: `com.oss-cairn`）

## リポジトリ内で準備済みのもの

- `apps/mobile/assets/icon-ios.png`: 1024×1024、非透過の本番アイコン
- `apps/mobile/eas.json`: `production` build / submit profile
- `apps/mobile/store.config.json`: 日本語のApp Storeメタデータ
- `apps/mobile/.eas/workflows/submit-ios.yml`: 手動起動するTestFlight workflow
- `apps/mobile/store/screenshots/README.md`: スクリーンショット仕様と撮影リスト
- `https://oss-cairn.com/privacy` / `https://oss-cairn.com/terms`: 公開法務ページ（mainへのデプロイ後）

## 初回のみ必要な外部設定

1. Apple Developer Programの契約と最新Agreementを確認する
2. Certificates, Identifiers & Profilesで `com.oss-cairn` のApp IDを確認する
3. App Store Connectで新規アプリを作成する
   - プラットフォーム: iOS
   - 名前: Cairn
   - プライマリ言語: 日本語
   - Bundle ID: `com.oss-cairn`
   - SKU: `cairn-ios`
4. App Informationに表示されたApple IDを、`apps/mobile/eas.json` の `submit.production.ios.ascAppId` に追加する
5. `apps/mobile` で `eas credentials --platform ios` を実行し、production profile用のDistribution Certificate、Provisioning Profile、App Store Connect API Keyを設定する
6. EASの `production` Environmentに本番の `EXPO_PUBLIC_API_BASE_URL`、`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY` があることを確認する

App Store Connect API Keyや審査アカウントのパスワードはリポジトリへコミットしない。

## App Store Connectメタデータ

`store.config.json` の内容を検証してから同期する。

```bash
cd apps/mobile
eas metadata:lint
eas metadata:push
```

EAS Metadataはベータ機能であり、App Privacy、スクリーンショット、審査用連絡先など一部の項目はApp Store Connectで手動入力する。

### 審査用連絡先・アカウント

App Store ConnectのApp Review Informationに次を設定する。

- 担当者の氏名
- Appleから連絡可能なメールアドレスと国番号付き電話番号
- 本番環境で有効な専用審査アカウントのメールアドレスとパスワード
- 審査中はパスワード、権限、ワークスペースを変更しない

審査アカウントには、個人情報を含まないサンプルワークスペースを用意する。

- サンプルプロジェクト
- 担当者と期限が入ったタスク
- 複数人の会話に見えるサンプルチャット
- 画像・PDFなどのサンプルファイル
- 通知を確認できるメンション

Review Notesには次を記載する。

- Cairnはチーム向けのプロジェクト管理・チャットアプリであり、主要機能にはログインが必要
- チャット以外の一部画面は、同じCairnサービスのWeb画面を安全な認証ハンドオフで表示する
- Googleカレンダー連携、AI、決済など、審査アカウントで有効にしていない任意機能を明記する
- 主要な確認導線（プロジェクト → チャット → タスク → ファイル → 設定）

## App Privacyの申告候補

実際の本番設定と各SDKの最新仕様を確認したうえで、少なくとも以下を検討する。

| データ種別                                       | 用途                       | 利用者との関連付け |
| ------------------------------------------------ | -------------------------- | ------------------ |
| 氏名・メールアドレス                             | アプリ機能、アカウント管理 | あり               |
| ユーザーID                                       | アプリ機能、認証、分析     | あり               |
| メッセージ、写真、ファイル等のユーザーコンテンツ | アプリ機能                 | あり               |
| 購入・購読情報                                   | アプリ機能、請求           | あり               |
| 製品操作・利用状況                               | 分析、品質改善             | あり               |
| クラッシュ・診断情報                             | 品質改善                   | 構成を確認         |

広告目的のクロスサービス追跡は行わない前提だが、PostHogなど本番SDKの設定を確認してから「トラッキングなし」を確定する。App Privacyには、アプリ本体だけでなく第三者SDKの取扱いも含める。

## スクリーンショット

`apps/mobile/store/screenshots/README.md` の構成で、TestFlightの本番ビルドから日本語スクリーンショットを撮影する。iPhone 6.9インチは1〜10枚が必要。iPad対応を有効にする場合は、13インチiPad用スクリーンショットも別途必要になる。

## TestFlight

### ローカルコマンド

```bash
cd apps/mobile

# production buildのみ
pnpm build:production:ios

# build完了後にApp Store Connectへ送る
pnpm submit:ios:latest

# buildとTestFlightへの送信を連続実行する
pnpm release:testflight:ios
```

またはEAS Workflowを手動実行する。

```bash
cd apps/mobile
eas workflow:run submit-ios.yml
```

EAS SubmitはApp Store Connect / TestFlightへのアップロードまでを行う。App Reviewへの提出と公開はApp Store Connectから手動で行う。

### 本番相当の確認項目

- 新規インストール、メールアドレスログイン、Googleログイン、サインアウト
- プロジェクト・チャット・タスク・カレンダー・ファイル・ギャラリーの主要導線
- 写真権限を許可／拒否した場合の添付操作
- 通知権限を許可／拒否した場合、およびバックグラウンドでのPush通知
- WebView画面の認証ハンドオフと、前面復帰・トークン更新
- オフライン送信キュー、回線復帰時の再送、二重送信が起きないこと
- ダーク／ライトテーマ、文字サイズ、主要画面のVoiceOverラベル
- プライバシーポリシー、利用規約、サポートへの導線
- クラッシュ、白画面、開発用URL・テストデータ・秘密情報が表示されないこと

## App Review送信前のブロッカー

- [ ] アプリ内からアカウント削除を開始できる機能を実装する
- [ ] ユーザー投稿型チャットについて、報告・ブロック・モデレーションの要否と実装を確認する
- [ ] 運営者の正式名称、非公開問い合わせ先、法務文面を最終確認する
- [ ] App Store ConnectのApp Privacyを本番構成に合わせて公開する
- [ ] 専用審査アカウントとサンプルワークスペースを作成する
- [ ] TestFlightの内部テスターで本番相当チェックを完了する
- [ ] 6.9インチiPhone用スクリーンショットをアップロードする
- [ ] Apple Developer / App Store Connectの契約、年齢区分、価格・配信地域を確定する
