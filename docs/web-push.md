# Web Push 通知（VAPID）

- 状態: **現行リファレンス**（通知の仕様は [`notification-design.md`](./notification-design.md)）

メンション・タスク割り当て時にブラウザへプッシュ通知を送る。VAPID キーが未設定なら通知なしで動作する。Electron 版も Chromium の Web Push をそのまま使う（[`desktop-app.md`](./desktop-app.md)）。

## キーの生成と設定

```bash
npx web-push generate-vapid-keys
```

| 変数名 | 説明 |
|---|---|
| `VAPID_PUBLIC_KEY` | 生成した公開鍵 |
| `VAPID_PRIVATE_KEY` | 生成した秘密鍵（機密情報） |
| `VAPID_SUBJECT` | 管理者連絡先。`mailto:admin@example.com` 形式 |

- ローカル: `apps/web/.env.local` に追記する
- Vercel: Project → Settings → Environment Variables に追加する（`VAPID_PRIVATE_KEY` は Sensitive）
- **VAPID キーを変えると既存の全購読が無効になる**。生成は一度だけにし、本番・Preview で同じキーを使う

## ローカルでの確認

1. `.env.local` にキーを設定して dev サーバーを再起動する
2. 通知パネル（ベルアイコン）右上の「ON」でブラウザの通知を許可する
3. Supabase Studio（`http://localhost:54323`）の `push_subscriptions` に行が増えることを確認する
4. Inngest Dev UI（`http://localhost:8288`）から `message/created` イベントを送る

```json
{
  "name": "message/created",
  "data": {
    "messageId": "00000000-0000-0000-0000-000000000001",
    "channelId": "<チャンネルUUID>",
    "workspaceId": "<ワークスペースUUID>",
    "senderId": "<別ユーザーのUUID>",
    "senderName": "テストユーザー",
    "content": "@<自分の表示名> テスト",
    "attachmentFileIds": []
  }
}
```

タブが前面にある間は OS 通知が出ない（仕様）ので、別タブで試す。
