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
pnpm desktop:build:prod   # prod URL + emerald-dark アイコン
pnpm desktop:build:dev    # dev URL + blue-light アイコン
pnpm --filter @cairn/desktop generate-icons  # apps/web/public/ の PNG から .icns / .ico / .png を再生成
```

アイコンは `apps/desktop/resources/icons/{prod,dev}/` に生成される。

実行中の Dock / タスクバーのアイコンは Web の外観設定（テーマ・アクセント）に連動する。Web が `cairnDesktop.setAppIcon` で設定を送り、main（`src/app-icon.js`）が `src/assets/app-icons/` の PNG を選んで差し替える。初期値（システム＋エメラルド）のままなら上の表の環境別アイコンを使う。Finder・Launchpad・スタートメニューに出る同梱アイコンは変わらない。

## Web Push の確認

1. `pnpm desktop:dev` で起動する
2. DevTools のコンソールで `'serviceWorker' in navigator && 'PushManager' in window` が `true` になることを確認する
3. 通知パネル（ベルアイコン）の ON/OFF で、通知許可ダイアログが出ることを確認する
