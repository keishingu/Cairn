# Electron デスクトップアプリ

- 状態: **現行リファレンス**

[`apps/desktop/`](../apps/desktop/) は、デプロイ済みの Web 版 URL を読み込むだけの薄い Electron シェル。静的ファイルはバンドルせず、常にネット経由で接続する（オフライン非対応）。Chromium ベースのため、Web Push（VAPID + Service Worker）をそのまま使える。

| 環境 | URL | アイコン |
|---|---|---|
| prod | `https://oss-cairn.com` | `icon-emerald-dark-512.png`（濃紺 + 緑） |
| dev | `https://develop.oss-cairn.com` | `icon-blue-light-512.png`（白 + 青） |

## コマンド（リポジトリルートで実行）

```bash
pnpm desktop:dev          # dev URL を読み込み、DevTools を自動で開く
pnpm desktop:build:prod   # prod URL + emerald-dark アイコン（mac はユニバーサル版。署名は CSC_LINK 等が必要。無しで試すなら CSC_IDENTITY_AUTO_DISCOVERY=false）
pnpm desktop:build:dev    # dev URL + blue-light アイコン
pnpm --filter @cairn/desktop generate-icons  # apps/web/public/ の PNG から .icns / .ico / .png を再生成
```

アイコンは `apps/desktop/resources/icons/{prod,dev}/` に生成される。

実行中の Dock / タスクバーのアイコンは Web の外観設定（テーマ・アクセント）に連動する。Web が `cairnDesktop.setAppIcon` で設定を送り、main（`src/app-icon.js`）が `src/assets/app-icons/` の PNG を選んで差し替える。初期値（システム＋エメラルド）のままなら上の表の環境別アイコンを使う。Finder・Launchpad・スタートメニューに出る同梱アイコンは変わらない。

## Web Push の確認

1. `pnpm desktop:dev` で起動する
2. DevTools のコンソールで `'serviceWorker' in navigator && 'PushManager' in window` が `true` になることを確認する
3. 通知パネル（ベルアイコン）の ON/OFF で、通知許可ダイアログが出ることを確認する

## リリースと自動更新

`apps/desktop/**` を変えて main へマージすると、[`desktop-build.yml`](../.github/workflows/desktop-build.yml) がビルドして公開する。

- **リリースごとに `apps/desktop/package.json` の `version` を上げる**。`desktop-vX.Y.Z` が公開済みならワークフローはエラーで止まる。main 宛ての PR では [`desktop-version-check.yml`](../.github/workflows/desktop-version-check.yml) がマージ前に同じ確認をする
- 公開先:
  - `desktop-latest`: 常に最新版を置くローリング Release。ダウンロードリンクはここ（`https://github.com/keishingu/Cairn/releases/tag/desktop-latest`）
  - `desktop-vX.Y.Z`: バージョンごとの履歴
- mac: Developer ID で署名・公証したユニバーサル版（Apple Silicon / Intel 両対応）の dmg と、自動更新用の zip。**署名用 Secrets が無ければエラーで止め、署名なしでは配布しない**（mac の自動更新は署名が必須）
- Windows: 当面は署名なしの NSIS インストーラ（SmartScreen の警告が出る）。自動更新は署名なしでも動く
  - 署名なしのため、electron-updater はインストーラの発行元を検証できない。`desktop-latest` に書き込める人・トークンが差し替えると、インストール済みの全端末が自動で入れてしまう。このリスクは受け入れたうえで自動更新を有効にしている。署名を入れたら `win.publisherName` を設定して検証を有効にする

### 自動更新

本番ビルドのインストール版だけが、起動時と6時間ごとに `desktop-latest` の `latest.yml` / `latest-mac.yml` を確認する（electron-updater の generic provider。Web のリリース `release-YYYY-MM-DD` と同じリポジトリにあるため、GitHub の「Latest release」は使わない）。新しい版をダウンロードし終えると再起動を促し、「あとで」なら次の終了時に入れ替わる。メニューの「アップデートを確認…」（mac はアプリメニュー、Windows はヘルプ）から手動でも確認でき、失敗したときはエラーをダイアログで出す。定期確認の失敗はダイアログを出さずログにだけ残す。

v0.1.0 以前のビルドには自動更新が入っていないため、一度だけ手動で入れ直してもらう必要がある。

### 署名用 Secrets の設定（初回のみ）

1. GitHub の Settings → Environments で `desktop-release` を作り、Deployment branches を **`main` のみ**にする（`production` は PR の merge ref にも許可しているため、署名証明書は置かない）
2. Apple Developer で **Developer ID Application** 証明書を作り、キーチェーンから `.p12` で書き出す
3. App Store Connect → ユーザとアクセス → 統合 → App Store Connect API で、公証用の API キー（`.p8`）を発行する
4. `desktop-release` Environment に次の Secrets を登録する

| Secret | 値 |
|---|---|
| `MAC_CSC_LINK` | `.p12` を base64 にしたもの（`base64 -i cert.p12 \| pbcopy`） |
| `MAC_CSC_KEY_PASSWORD` | `.p12` の書き出し時のパスワード |
| `APPLE_API_KEY_P8` | `.p8` ファイルの中身（`-----BEGIN PRIVATE KEY-----` から） |
| `APPLE_API_KEY_ID` | API キーの Key ID |
| `APPLE_API_ISSUER` | Issuer ID |
