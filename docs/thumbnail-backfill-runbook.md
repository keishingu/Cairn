# 添付画像サムネイルのバックフィル手順

ステータス: 現行リファレンス
作成: 2026-07-03

## 背景

PR #153 でチャット添付画像のサムネイル生成が追加された。新規アップロード画像は `/api/attachments/finalize` で `files.metadata.thumbnailPath` が保存されるが、リリース前から存在する画像にはサムネイルがない。

既存画像へサムネイルを後付けするには、管理者がバックフィル用の Inngest イベントを起動する。

## 実行条件

- 対象環境に PR #153 以降の `develop` がデプロイ済みであること
- Inngest が対象環境の `/api/inngest` と同期済みで、`backfill-thumbnails` 関数が表示されていること
- Cairn に workspace admin 以上のアカウントでログインできること

## 起動方法

対象 workspace にログインした状態で、ブラウザの DevTools Console から実行する。

```js
await fetch('/api/admin/backfill-thumbnails', {
  method: 'POST',
}).then(async r => ({ status: r.status, body: await r.json() }))
```

期待するレスポンス:

```js
{ status: 200, body: { started: true } }
```

この API はログイン中の workspace だけを対象に `attachments/backfill-thumbnails` を enqueue する。複数 workspace の既存画像を対象にする場合は、workspace を切り替えて同じ手順を繰り返す。

## 処理内容

Inngest 関数 `backfillThumbnails` は次の条件に合う `files` レコードを 50 件ずつ処理する。

- `fileType = 'image'`
- `storagePath` がある
- `metadata.thumbnailPath` が未設定
- `gallery_items` に紐づく画像ではない

処理に成功した画像は、同じ `chat-attachments` bucket 内の `thumb/` 配下へ JPEG サムネイルを保存し、`files.metadata.thumbnailPath` に保存先を追記する。

## 失敗時の扱い

破損画像や Storage オブジェクト欠落などでサムネイル生成に失敗した行は、その回ではスキップされる。ジョブは `afterId` を使って後続レコードへ進むため、失敗行だけでバッチが詰まり続けることはない。

一時的な Storage 障害などで失敗した可能性がある場合は、同じ workspace で再度バックフィルを起動すれば、`metadata.thumbnailPath` が未設定の行だけが再処理される。

## 確認方法

Inngest の実行ログで `backfill-thumbnails` の戻り値を確認する。

- `processed`: 処理対象として取得した件数
- `generated`: サムネイル生成と metadata 更新に成功した件数
- `failed`: サムネイル生成またはアップロードに失敗した件数
- `done`: 追加バッチが不要なら `true`

アプリ上では、チャット添付画像やファイル一覧の画像表示が `/api/attachments/{fileId}?thumb=1` 経由で軽量化される。
