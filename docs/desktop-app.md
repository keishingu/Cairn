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

## Web Push の確認

1. `pnpm desktop:dev` で起動する
2. DevTools のコンソールで `'serviceWorker' in navigator && 'PushManager' in window` が `true` になることを確認する
3. 通知パネル（ベルアイコン）の ON/OFF で、通知許可ダイアログが出ることを確認する
