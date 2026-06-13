# Phase 2-B Session 5: ネイティブチャット強化（オフライン・バックグラウンドアップロード）

## 背景と方針

Session 4 でプロジェクト・タスク・通知を WebView 化したが、チャット画面はネイティブのまま維持している。
理由: 電波が悪い環境・ファイル送信中のアプリ終了に対応するため、チャットはネイティブ機能が必要。

このセッションでは現在のチャット（PR #68 実装）に以下を追加する:
- **オフライン時の送信キュー**: 送信に失敗したメッセージをキューに積み、電波回復時に自動リトライ
- **バックグラウンドファイルアップロード**: アプリを閉じても転送が継続する

参照ドキュメント:
- `CLAUDE.md` — リポジトリ全体の規約・方針（**必ず読む**）
- `apps/mobile/app/(app)/chats/` — 現在のネイティブチャット実装
- `apps/mobile/hooks/use-messages.ts` — メッセージ取得・送信フック
- `apps/web/src/app/api/channels/[channelId]/messages/route.ts` — メッセージ送信 API
- `apps/web/src/app/api/attachments/upload/route.ts` — ファイルアップロード API

---

## 作業 1: オフライン送信キュー

### 設計

```
ユーザーが送信ボタンを押す
  ↓
メッセージをローカルキュー（AsyncStorage）に積む
  ↓ 楽観的 UI 更新（送信中表示）
  ↓
POST /api/channels/:id/messages を試みる
  ├── 成功 → キューから削除、確定表示
  └── 失敗（ネットワークエラー）→ キューに残す、"送信失敗・タップで再送" 表示
        ↓
  電波回復時（NetInfo で検知）→ キューを順番に再送
```

### 実装

`@react-native-community/netinfo` を追加:
```json
"@react-native-community/netinfo": "11.x"
```

`apps/mobile/lib/message-queue.ts`:
- `AsyncStorage` でキューを永続化
- `enqueue(channelId, content, tempId)` — 送信前にキューに積む
- `dequeue(tempId)` — 送信成功時に削除
- `getAll(channelId)` — チャンネルの未送信メッセージ一覧

`apps/mobile/hooks/use-message-queue.ts`:
- `NetInfo.addEventListener` で接続状態を監視
- 接続回復時にキューを自動リトライ
- 楽観的 UI: 送信中メッセージを通常メッセージと混在表示（`tempId` で識別）

### UI 表示

- 送信中: グレーのテキスト + 時計アイコン
- 送信失敗: 赤いテキスト + 「タップして再送」
- 送信成功: 通常表示

---

## 作業 2: バックグラウンドファイルアップロード

### 設計

`expo-file-system` の `FileSystem.createUploadTask()` を使う。
これはアプリがバックグラウンドに移動しても転送を継続できる。

```ts
import * as FileSystem from 'expo-file-system'

const uploadTask = FileSystem.createUploadTask(
  `${API_BASE}/api/attachments/upload`,
  localFileUri,
  {
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    headers: { Authorization: `Bearer ${accessToken}` },
  },
  (progress) => {
    // progress.totalBytesSent / progress.totalBytesExpectedToSend
  }
)

const result = await uploadTask.uploadAsync()
```

`expo-file-system` は既存の依存に含まれている場合があるが、なければ追加する。

### UI

- ファイル選択: `expo-image-picker`（画像）と `expo-document-picker`（任意ファイル）
- アップロード進捗バー表示
- アプリがバックグラウンドに移動した場合、通知で進捗を表示（`expo-notifications` で local notification）
- 完了時: メッセージに添付として表示

### アップロードフロー

```
1. ファイル選択（expo-image-picker / expo-document-picker）
2. FileSystem.createUploadTask() で Supabase Storage へアップロード
3. アップロード完了後、返却された fileId を使って POST /api/channels/:id/messages に添付
```

`POST /api/channels/:id/messages` のリクエストボディに `attachmentIds: string[]` を含める形式は
Web 版の実装に合わせる（`apps/web/src/app/api/channels/[channelId]/messages/route.ts` を参照）。

---

## やらないこと

- オフライン時の受信メッセージキャッシュ（Supabase Realtime 導入まで保留）
- ファイルの暗号化ローカルキャッシュ
- 送信失敗メッセージの無限リトライ（最大3回でエラー表示に落とす）

---

## 完了の定義

- 機内モードで送信したメッセージが、電波回復後に自動送信されること
- ファイルアップロード中にアプリをバックグラウンドにしても転送が完了すること
- 送信中・失敗・成功の UI 状態が正しく表示されること
