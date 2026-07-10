# App Store / Google Play リリース運用

> **ステータス**: 現行リファレンス（作成: 2026-07-05）
> ストア公開の初回セットアップと、2 回目以降の「ほぼワンクリック」リリース手順。
> ネイティブ化の完成定義は [`mobile-native-completion.md`](./mobile-native-completion.md)（本書はバックログ M6 の実体）。

---

## 1. 全体像 — 自動化の境界

| 作業 | 担当 | 頻度 |
|---|---|---|
| Apple / Google の開発者アカウント作成・支払い | **人間** | 初回のみ |
| ストアのアプリ登録・掲載情報・プライバシー申告 | **人間**（下書きは AI に依頼可） | 初回のみ + 変更時 |
| 証明書・署名・ビルド番号の管理 | **EAS が全自動**（`eas credentials` で初回設定） | — |
| 本番ビルド → ストアへの提出 | **GitHub Actions「Mobile Release」**（ワンクリック） | リリース毎 |
| JS のみの修正配信（OTA） | **同ワークフローの `ota-update`**（審査不要・即時） | 随時 |
| TestFlight / Play internal → 公開への昇格 | **人間**（ストアのボタンを押すだけ） | リリース毎 |
| 審査リジェクトへの対応 | 人間が issue 化 → Builder ループが修正 | 発生時 |

リリースの流れ（2 回目以降）:

```
develop → main へ promote（既存の Release workflow）
  ↓
Actions →「Mobile Release」→ Run workflow（branch: main, mode: build-and-submit）
  ↓ EAS がビルド番号を自動採番してビルド → ストアへ自動提出
TestFlight（iOS）/ Play internal track（Android）に自動で届く
  ↓
人間: ストアコンソールで「公開」（Play は track 昇格）を押す
```

---

## 2. 初回セットアップ（人間・一度だけ）

### 2-0. 共通

1. **EAS の production 環境変数**を登録する（ビルド時に自動注入される。`eas.json` の `"environment": "production"`）:
   ```bash
   cd apps/mobile
   eas env:create --environment production \
     --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <本番SupabaseのanonキーをダッシュボードのAPI設定から>
   ```
   URL 系（`EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`）は公開情報のため `eas.json` に直書き済み。
2. **GitHub の `Production` environment に `EXPO_TOKEN` を登録**する（`mobile-preview.yml` が使っている Preview 環境と同じトークンでよい。https://expo.dev/settings/access-tokens で発行）。
3. **本番 Supabase ダッシュボードの Redirect URLs に `cairn://auth/callback` を登録**する（Google ログインのコールバック先。preview ビルドを検証環境に向ける場合は検証側に `cairn-preview://auth/callback` も登録）。

### 2-1. iOS（App Store）

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録（年 $99・審査に 1〜2 日）
2. [App Store Connect](https://appstoreconnect.apple.com/) で新規アプリを作成:
   - Bundle ID: `com.oss-cairn`（`app.config.ts` の production と一致させる。**公開後は変更不可**）
   - 名前: Cairn / プライマリ言語: 日本語
3. 作成後の URL `https://appstoreconnect.apple.com/apps/<数字>/` の数字（App ID）を `apps/mobile/eas.json` の `submit.production.ios.ascAppId`（現在 `TODO_ASC_APP_ID`）に記入して PR
4. 署名と提出用 API キーを EAS に預ける（対話式・各 1 回）:
   ```bash
   cd apps/mobile
   eas credentials --platform ios   # Distribution Certificate / Provisioning Profile を EAS 管理に
   # App Store Connect API Key もこの中で作成・保存できる（eas submit が使う）
   ```
5. **Push 通知**: `eas credentials` で APNs キーも EAS 管理にする（expo-notifications の本番動作に必須）
6. **審査用デモアカウント**: 本番環境にレビュアー用のワークスペース・アカウントを用意し、App Review 情報に記載する（チャットアプリは必須級）

### 2-2. Android（Google Play）

1. [Google Play Console](https://play.google.com/console/) にデベロッパー登録（初回 $25）
2. アプリを作成（パッケージ名 `com.oss_cairn`）
3. **初回の AAB だけは手動アップロード**（Google の仕様。以降は自動提出できる）:
   ```bash
   cd apps/mobile
   eas build --platform android --profile production   # 完了後 .aab をダウンロード
   ```
   Play Console → 内部テスト → 新しいリリース → AAB をアップロード
4. 自動提出用のサービスアカウントを作成し、EAS に預ける:
   - Play Console → 設定 → API アクセス → サービスアカウント作成（権限: リリース管理）
   - JSON キーをダウンロードし `eas credentials --platform android` で EAS に保存（リポジトリにはコミットしない）

### 2-3. ストア掲載情報（両ストア共通）

- スクリーンショット: QA エージェント（[`prompts/mobile-loop/qa-codex.md`](./prompts/mobile-loop/qa-codex.md)）がシミュレータ走査で保存する `~/cairn-qa/*.png` を流用できる（iOS は 6.7" と 5.5" 相当が必要）
- 説明文・キーワード: Builder / Claude に下書きを依頼してよい（`docs/lp-soul-page-copy.md` のトーンに合わせる）
- **プライバシーポリシー URL が必須**（両ストア）。`oss-cairn.com` 配下に公開ページがなければ先に用意する
- プライバシー申告（Apple「App のプライバシー」/ Google「データセーフティ」）: 収集するのはアカウント情報（メール）・ユーザーコンテンツ（メッセージ・ファイル）・Push トークン。トラッキングなし

---

## 3. リリース手順（2 回目以降）

1. `develop` → `main` を promote（既存の **Release** workflow → PR マージ）
2. Actions → **Mobile Release** → Run workflow（**branch: main** を選ぶこと）
   - `mode: build-and-submit` / `platform: all`
   - ビルド番号は EAS の `autoIncrement` が自動採番。人間のバージョン操作は不要
3. 30〜60 分後、TestFlight と Play internal track に自動で届く（EAS の Builds ページで進捗確認）
4. 動作確認して、App Store Connect「審査へ提出」/ Play Console「トラック昇格」を押す

### JS のみの修正（OTA・審査なし）

ネイティブ依存（`package.json` のネイティブモジュール・`app.config.ts`・Expo SDK）に触れていない修正は、ストア審査なしで配信できる:

- Actions → **Mobile Release** → `mode: ota-update`（main から実行）
- 起動中/次回起動時にアプリへ反映される。`runtimeVersion`（= アプリの `version`）が一致するビルドにのみ届く

### アプリバージョンを上げるとき

`app.config.ts` の `version` を上げる = `runtimeVersion` が変わる = **OTA が届かなくなる**ため、必ず `build-and-submit` でストア更新する。目安: ネイティブ依存の追加・Expo SDK 更新・大きな機能区切りで minor を上げる。

---

## 4. 開発への影響（app.config.ts 化に伴う注意）

- `app.json` は `app.config.ts` に置き換えた。`APP_VARIANT`（development / preview / production）でアプリ名と bundle ID が分岐し、**同一端末に dev・preview・本番を共存インストールできる**
- ローカルの `pnpm ios` / `pnpm android` は自動的に development（`com.oss-cairn.dev`）になる。**切替後の初回は dev client の再ビルドが必要**（bundle ID が変わるため。旧 `com.oss-cairn` のアプリは端末から削除してよい）
- PR の EAS Update プレビュー（`mobile-preview.yml`）の挙動は不変

## 5. 自動化ループとの関係

- 本書のセットアップで残っている TODO（`ascAppId` の記入等）や審査リジェクト対応は、`mobile` + `ready-for-ai` の issue にすれば Builder ループが処理する（アカウント作成・支払い・コンソール操作は人間のみ）
- ストアリリース自体（Mobile Release の起動・公開ボタン）は課金と外部公開を伴うため**自動トリガーにしない**。人間の明示操作を最終ゲートとして残す
