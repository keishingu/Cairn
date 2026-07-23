# モバイル Internal Distribution・オフライン基盤

- 状態: **実装済み・現行リファレンス**
- 最終更新: 2026-07-23

## 目的

`preview` 環境へ接続する Cairn を iOS / Android 実機へ直接配布し、Metro を起動していない状態でも検証できるようにする。今後の全チャンネル検索・ブックマーク・メッセージキャッシュを EAS Update で追加できるよう、必要なネイティブモジュールも先にバイナリへ含める。

## 配布版の区分

| EAS profile                          | 表示名        | iOS bundle ID           | Android package         | 用途                             |
| ------------------------------------ | ------------- | ----------------------- | ----------------------- | -------------------------------- |
| `development` / `development-device` | Cairn Dev     | `com.oss-cairn.dev`     | `com.oss_cairn.dev`     | Metro に接続する開発クライアント |
| `preview`                            | Cairn Preview | `com.oss-cairn.preview` | `com.oss_cairn.preview` | Internal Distribution            |
| `production`                         | Cairn         | `com.oss-cairn`         | `com.oss_cairn`         | ストア配布                       |

識別子は `EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV` をもとに `apps/mobile/app.config.ts` が決める。EAS の各 build profile は同名の EAS Environment とこの値を明示しているため、ローカル `.env.local` をクラウドビルドへ持ち込まない。

## ビルド

`preview` の EAS Environment に API / Supabase の接続先が登録済みであることを確認してから、`apps/mobile` で実行する。

```bash
# Android: インストール可能な APK
pnpm build:internal:android

# iOS: 登録済み端末向け Ad Hoc build
pnpm build:internal:ios
```

GitHub Actions の `Mobile Internal Distribution` から `android` / `ios` / `all` を選んで手動実行してもよい。workflow は EAS build をキューへ投入して終了し、成果物とインストール用リンクは Expo dashboard で確認する。

## iOS 実機の登録

iOS の Internal Distribution は Ad Hoc provisioning のため、インストール対象端末の UDID を事前登録する。

```bash
cd apps/mobile
pnpm device:register:ios
pnpm build:internal:ios
```

新しい端末を登録しただけでは既存 build の provisioning profile は変わらない。登録後に iOS build を作り直す。非対話の GitHub Actions は既に用意された署名情報を使うため、初回の証明書・provisioning 設定や端末追加は管理者がローカルの EAS CLI で行う。

## ネイティブ runtime と EAS Update

`expo-sqlite` と `expo-network` を含む最初の runtime version は `1.1.0`。ネイティブ依存または `app.json` のネイティブ設定を変更した場合は、次の両方が必要になる。

1. `app.json` の `runtimeVersion` を上げる
2. Development Build / Internal Distribution build を作り直して端末へ再インストールする

JS / TypeScript だけの変更で runtime に互換性がある場合は、新しい実機 build は不要で EAS Update を利用できる。

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
