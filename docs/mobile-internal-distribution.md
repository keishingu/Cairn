# モバイル Internal Distribution・オフライン基盤

- 状態: **実装済み・現行リファレンス**
- 最終更新: 2026-07-23

## 目的

`preview` 環境へ接続する Cairn を iOS / Android 実機へ直接配布し、Metro を起動していない状態でも検証できるようにする。今後の全チャンネル検索・ブックマーク・メッセージキャッシュを EAS Update で追加できるよう、必要なネイティブモジュールも先にバイナリへ含める。

## 配布版の区分

| EAS profile                          | 表示名        | URL scheme      | iOS bundle ID           | Android package         | 用途                             |
| ------------------------------------ | ------------- | --------------- | ----------------------- | ----------------------- | -------------------------------- |
| `development` / `development-device` | Cairn Dev     | `cairn-dev`     | `com.oss-cairn.dev`     | `com.oss_cairn.dev`     | Metro に接続する開発クライアント |
| `preview`                            | Cairn Preview | `cairn-preview` | `com.oss-cairn.preview` | `com.oss_cairn.preview` | Internal Distribution            |
| `production`                         | Cairn         | `cairn`         | `com.oss-cairn`         | `com.oss_cairn`         | ストア配布                       |

識別子と native URL scheme は `EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV` をもとに `apps/mobile/app.config.ts` が決める。OAuth callback は OTA manifest ではなく、端末に実際にインストールされた bundle/package ID から選ぶ。これにより複数variantを同時インストールした場合や Development Build にpreview updateを載せた場合も、callbackが別アプリへ渡らない。EAS の各 build profile は同名の EAS Environment とこの値を明示しているため、ローカル `.env.local` をクラウドビルドへ持ち込まない。

## ビルド

`preview` の EAS Environment に API / Supabase の接続先が登録済みであることを確認してから、`apps/mobile` で実行する。

```bash
# Android: インストール可能な APK
pnpm build:internal:android

# iOS: 登録済み端末向け Ad Hoc build
pnpm build:internal:ios
```

GitHub Actions の `Mobile Internal Distribution` から `android` / `ios` / `all` を選んで手動実行してもよい。workflow は GitHub の Preview environment にある API / Supabase 設定を検証して EAS の `preview` environment へ同期してから build をキューへ投入する。`ios` / `all` では `--refresh-ad-hoc-provisioning-profile` を付け、EAS に登録済みの端末を provisioning profile へ反映する。成果物とインストール用リンクは Expo dashboard で確認する。

共有 Supabase Preview の Auth Redirect URLs には `cairn-preview://auth/callback`、開発用には `cairn-dev://auth/callback` を登録する。ローカル Supabase の許可URLは `supabase/config.toml` で管理する。

## iOS 実機の登録

iOS の Internal Distribution は Ad Hoc provisioning のため、インストール対象端末の UDID を事前登録する。

```bash
cd apps/mobile
pnpm device:register:ios
pnpm build:internal:ios
```

新しい端末を登録しただけでは既存 build の provisioning profile は変わらない。登録後に iOS build を作り直す。GitHub Actions の `ios` / `all` build は provisioning profile の端末一覧を更新してから build するため、EAS に保存済みの App Store Connect API key が必要になる。初回の証明書・API key・provisioning 設定と端末登録は、管理者がローカルの EAS CLI で行う。

## ネイティブ runtime と EAS Update

`expo-sqlite` と `expo-network` を含む最初の runtime version は `1.1.0`。ネイティブ依存または `app.json` のネイティブ設定を変更した場合は、次の両方が必要になる。

1. `app.json` の `runtimeVersion` を上げる
2. Development Build / Internal Distribution build を作り直して端末へ再インストールする

JS / TypeScript だけの変更で runtime に互換性がある場合は、新しい実機 build は不要で EAS Update を利用できる。Mobile Preview workflow はPR固有branchに加えて `preview` channelへも同じrevisionを配信するため、Internal Distribution buildは次回起動時に最新の成功済みPR更新を取得する。

ローカルの `ios/` / `android/` が既に存在する場合、`app.config.ts` の識別子や config plugin の変更は `expo run:*` だけでは残存することがある。次のように生成物を作り直してからローカルビルドする。

```bash
cd apps/mobile
pnpm exec expo prebuild --clean --platform ios
pnpm ios
```

## オフライン基盤

- `expo-sqlite`: `cairn-offline.db` を起動時に開き、WAL と foreign keys を有効化する。現在は schema migration の土台までで、メッセージキャッシュと FTS 検索テーブルは次の機能 PR で追加する。FTS はネイティブ build で有効化済み
- `expo-network`: 明示的に圏外またはインターネット到達不可の間は、送信 outbox の無駄な POST を抑止する。回線復帰イベントを受けたら8秒の定期処理を待たず即時再送する
- AsyncStorage: 既存の未送信本文・返信 outbox はこのPRでは移行しない。POST より先に保存する現在の保証を保ち、SQLite への移行はデータ移行とロールバックを設計してから行う

完全オフラインで選択したローカル添付ファイル自体の後送は、引き続き未対応。
