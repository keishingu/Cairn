# キーボードショートカット設計

> ステータス: **現行リファレンス**。キーの割り当て一覧は [`apps/web/src/lib/commands.ts`](../apps/web/src/lib/commands.ts)（`COMMANDS`）が正本で、本書には載せない。アプリ内では `?` のショートカット一覧・`⌘K` のコマンドパレットで確認できる。

Desktop（Electron）/ Web（PC シェル）のキーボードショートカットの設計方針。Microsoft Teams の規律（修飾キーで操作の作用範囲を分ける）を下敷きにしている。

## 1. 哲学：修飾キー＝「誰の操作か」

覚える軸を「**この操作は誰のものか**」の1本に揃える。コマンドの `layer` がこれに対応する。

| layer | 作用範囲 | Mac | Win / Linux |
|---|---|---|---|
| （OS） | Mission Control・Spaces・emacs 式テキスト編集 | Ctrl（**不可侵**） | Win キー |
| `app` | アプリ全体の場所移動（数字ナビ・通知・設定・サイドバー等） | `⌘⌥` | `Ctrl⇧` |
| `global` | 全画面で不変のコマンド（パレット `⌘K`・横断検索 `⌘⇧F`） | `⌘`（+`⇧`） | `Ctrl`（+`⇧`） |
| `context` | 今いる画面の操作（作成・ビュー切替・フィルタ・順送り） | `⌥` | `Alt` |

- Mac の Ctrl は OS 予約（`⌃↑↓←→`、`⌃A/E/K…`）だらけなので二次修飾に使わない。抽象アクションを定義し、OS ごとに修飾キーを割り当てる
- `Esc` / `Enter` / `⌘Enter` はレイヤーをまたぐ共通動作（閉じる / 開く・送信 / 確定）。`?` は修飾なしでヘルプ
- 数字ナビの番号は**サイドメニューの表示順と一致**させる（チャット `1`、プロジェクト一覧・カレンダー・カンバン・マイタスク `2`〜`5`）
- 軸の使い分け: 時間の前後は水平 `⌥←→`（カレンダー期間）、縦に並ぶリストの前後は垂直 `⌥↑↓`（チャンネル / 会話）
- 同じキーの多義（`⌥T` = Projects テーブル表示 / Calendar 今日）は `when` の異なる別コマンドで表現する
- Chats と AI は「会話スレッドを並べる画面」として同じ語彙を共有する（`⌥N` 作成 / `⌥↑↓` 順送り）

## 2. 予約・回避

- **`⌘F` はブラウザのネイティブ検索に温存**する
- **Web の `⌘`+数字はブラウザのタブ切替**に取られるため修飾を足す。Mac の `⌘⇧3`〜`6` は OS のスクリーンショット予約でブラウザに届かないため、**Mac Web は `⌘⌥`+数字、Win/Linux Web は `Ctrl⇧`+数字**。Desktop は素の `⌘` / `Ctrl`+数字（ネイティブメニュー）
- Desktop は上記に加え、ネイティブメニューで数字ナビ・設定を素の `⌘` / `Ctrl`+数字・`,`、サイドバーを `⌘B` で受ける（`⌘0` はズームリセットと衝突するため割り当てない）
- `⌘⇧P` は Firefox のプライベートウィンドウと衝突するためパレットは `⌘K`
- **Win の `Alt`+英字はメニューニーモニックと衝突**しうるため `D / E / F / Home` 等を避けて空き英字を選ぶ
- `⌥`+英字は Mac の入力欄で特殊文字（µ, ∑…）になるため、**入力欄フォーカス中・IME 変換中は context 層を無効化**し、キーは `e.code` で判定する
- Desktop 特権: ブラウザが奪う `Ctrl+Tab` / `Ctrl+Shift+Tab` を Electron の `before-input-event` で横取りし、チャンネル・会話の順送りに使う

## 3. 実装アーキテクチャ（コマンドレジストリ）

キー処理・コマンドパレット・ヘルプ・ヒント表示はすべて単一のカタログから派生する。定義の二重管理・死にショートカット・表記ズレを構造的に防ぐため。

```
catalog（lib/commands.ts）= id / title / layer / key / when / hintKeys
        ├─ use-command-dispatcher  keydown → matchCommand → registry.invoke(id)
        ├─ command-palette / shortcut-help / shortcut-hints ← catalog から表示を生成
[各ページ] useCommand(id, handler) → registry にハンドラを登録（未登録なら no-op + dev 警告）
[Desktop]  preload(onNavigate / onSeq / onToggleSidebar) → registry.invoke(id)
```

- **キー解決（`lib/command-keys.ts`）**: OS 別の修飾判定・表示文字列・入力欄ガード。`matchCommand(e, page, mac)` が keydown を1コマンドに解決する
- **レジストリ（`lib/command-registry.tsx`）**: `CommandProvider` が `Map<id, handler>` を保持。`useCommand` / `useCommands` で登録
- **ディスパッチャ（`hooks/use-command-dispatcher.ts`）**: `app/(app)/_shells/pc-shell.tsx` でマウント。keydown とネイティブメニューの両入口を `invoke(id)` に流す。Esc は「閉じたら preventDefault」の特殊挙動のためコマンド化せず `onEscape` で扱う
- **Desktop（`apps/desktop/src/main.js` + `preload.js`）**: `Menu` の `accelerator`（`CmdOrCtrl+1` 等）を使う。`globalShortcut` は非フォーカス時もキーを奪うため使わない
- **リスト選択（`hooks/use-list-selection.ts`）**: 素の `↑/↓` で行選択し、`data-list-index` の行を `scrollIntoView` で追従。削除・再インデックス・完了トグル等の context コマンドは選択中の行が対象。Chats のメッセージ選択中は単キー（`e` 編集 / `r` リアクション / `d` 削除）
- **権限**: 出せないアクションはハンドラ登録側でガードする。サーバー側チェックは常に必須

## 4. 未実装

- **Vim モード**（設定で On/Off・既定 Off）: 単キー層（`j/k`・`gg/G`・`/`・作成・`x`）を opt-in の加速レーンとして追加する構想。修飾キー層だけで全機能に到達できることが前提。作成キーを `c`（Gmail/Linear 互換）と `n` のどちらにするかは未決
- Desktop のグローバルクイックキャプチャ・トレイ常駐
