# キーボードショートカット設計

> ステータス: **現行リファレンス（第1段のみ実装済み）**（2026-06-16）。第2段以降は設計案
> ドキュメントと実装が矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。

Cairn の Desktop（Electron）/ Web のキーボードショートカット設計。Microsoft Teams の規律（修飾キーで操作の作用範囲を分ける）を下敷きにしている。

---

## 1. 哲学：修飾キー＝「誰の操作か」

覚える軸を「**この操作は誰のものか**」の1本に揃える。

| 修飾キー（Mac） | レイヤー | 作用範囲 | アプリの扱い |
|---|---|---|---|
| **Ctrl** | システム動作 | macOS（Mission Control・Spaces・emacs 式テキスト編集） | **触らない（不可侵）** |
| **⌘** | アプリの操作 | Cairn 全体（ページ移動・グローバルコマンド） | 主役 |
| **⌥ Option** | コンテキストの操作 | 今いる画面 / スレッド（ビュー切替・順送り・作成） | 主役 |

各レイヤー内で **Shift がサブ階層**を作る：

- `⌘` … 場所・主要コマンド / `⌘⇧` … 横断・破壊的・状態変更
- `Esc` / `Enter` / `⌘Enter` … レイヤーをまたぐ共通動作（閉じる / 開く・送信 / 確定）

### OS 別バインド

Mac は Ctrl が OS 予約だらけ（`⌃↑↓←→`＝Mission Control/Spaces、`⌃A/E/K/F…`＝全テキスト欄の emacs 編集）なので二次修飾に使えない。Windows/Linux にはその予約が無いぶん 1 段ズレる。**抽象アクションを定義し、OS ごとに修飾キーを割り当てる**。

| レイヤー | Mac | Windows / Linux |
|---|---|---|
| システム | Ctrl（OS が占有・アプリは未使用） | Win キー（OS） |
| アプリ | **⌘** | **Ctrl** |
| コンテキスト | **⌥** | **Alt** |

---

## 2. 名前空間（既定 ON・全ユーザー）

| 名前空間 | Mac | Win/Linux | 役割 |
|---|---|---|---|
| 数字ナビ | `⌘`+数字（Web は `⌘⌥`+数字） | `Ctrl`+数字（Web は `Ctrl⇧`+数字） | サイドメニューのページ移動 |
| グローバル操作 | `⌘⇧`+英字 | `Ctrl⇧`+英字 | パレット・横断検索・ヘルプ（全画面で不変） |
| 順送り | `⌥↑` `⌥↓` | `Alt↑` `Alt↓` | スレッド/チャンネル/会話/メッセージの前後（Teams 準拠） |
| 画面内操作 | `⌥`+英字 | `Alt`+英字 | 今の画面のビュー切替・作成・フィルタ |

### 予約・回避

- **`⌘F` はブラウザのネイティブ検索に温存**（アプリ内検索に奪わない）。
- **Web の `⌘`+数字（1–9）はタブ切替に取られる**ため、サイドメニューは修飾を足して退避。ただし Mac の `⌘⇧3`〜`⌘⇧6` はスクリーンショットとして OS がグローバル予約しブラウザに届かないため、**Mac Web は `⌘⌥`+数字**、**Win/Linux Web は `Ctrl⇧`+数字**（スクショ予約が無く安全）に分ける。Desktop は素の `⌘`/`Ctrl`+数字（ネイティブメニュー）。
- **Win の `Alt`+英字はメニューニーモニックと衝突**しうるため、`D / E / F / Home` は使わず `M / W / V / N / T` 等の空き英字に限定。
- `⌥`+英字は Mac では入力欄で特殊文字（µ, ∑…）になるため、**入力欄フォーカス中・IME 変換中は無効化**（`e.code` で判定）。

---

## 3. 全画面マッピング

### 数字ナビ（`⌘`数字 / Desktop 素・Web は `⌘⇧`数字）

| キー | 遷移先 |
|---|---|
| `1` | プロジェクト一覧 |
| `2` | カレンダー |
| `3` | カンバン |
| `4` | マイタスク |

※番号は**サイドメニューの表示順と一致**させる（Teams の強さの本質）。

### グローバル操作（`⌘⇧`英字）

| キー | 操作 |
|---|---|
| `⌘K` | コマンドパレット（Web の本命。`⌘⇧P` は Firefox のプライベートウィンドウと衝突のため不採用） |
| `⌘⇧F` | 横断検索（全チャンネル / 全会話 / 全ファイル） |
| `?` | ショートカット一覧 |

### 画面内操作（`⌥`／全画面共通の語彙）

| キー | 操作 |
|---|---|
| `⌥↑` `⌥↓` | 順送り（スレッド / チャンネル / 会話 / メッセージ） |
| `⌥M` `⌥W` `⌥T` | カレンダー 月 / 週 / タイムライン |
| `⌥V` | 一覧 グリッド ⇔ 表 |
| `⌥N` | 新規作成（その画面の主役を作る） |
| `⌥F` | フィルタ popover を開く |

### 画面ごとの適用

| 画面 | 主なショートカット |
|---|---|
| Projects（一覧/カレンダー/カンバン） | `⌥N`新規プロジェクト、`⌥V`グリッド⇔表、`⌥M/W/T`月/週/タイムライン、`⌥↑↓`月送り、`⌥F`フィルタ |
| Tasks（マイタスク） | `⌥N`新規タスク、`⌥F`フィルタ |
| Chats | `⌥N`新規チャンネル、`⌥↑↓`チャンネル/メッセージ順送り、`⌘⇧F`横断検索、`Enter`/`Shift+Enter`送信/改行、`Esc`composer 離脱 |
| Files | `⌥F`フィルタ、`⌘⇧F`横断検索 |
| Gallery | `←`/`→`前後、`Esc`閉じる（既存維持） |
| AI | `⌥N`新規会話、`⌥↑↓`会話切替、`⌘⇧F`会話横断検索、`Enter`/`Shift+Enter`送信/改行 |
| Members | `⌥F`ロールフィルタ、`⌥N`/`i`招待（admin のみ・権限で無効化）、`Esc`パネル閉じる |
| Settings | `⌘Enter`保存、`Esc`ダイアログ閉じる |

> Chats / AI は「会話スレッドを並べる画面」として**完全パラレル**にする（`⌥N`作成 / `⌘⇧F`横断 / `⌥↑↓`順送り を共有）。

---

## 4. Vim モード（設定で On/Off・既定 Off）

単キー操作はライトユーザーには誤爆が怖いので、**修飾キー層だけで全機能に到達できる**ことを前提に、単キー層は opt-in の「加速レーン」とする。Off の間は単キーを一切発火させない。

| キー | 操作 |
|---|---|
| `j` `k` | 一覧 / メッセージの上下移動 |
| `gg` `G` | 先頭 / 末尾へ |
| `/` | この画面の検索にフォーカス |
| `c`（or `n`） | 新規作成（`⌥N` の単キー版） |
| `x` / `space` | 選択 / 完了トグル |
| `i` / `Esc` | チャット composer へ入る / 抜ける（modal） |

### チャットの modal（Vim モード時）

- 打鍵 = composer（insert）。`Esc` で normal へ抜けると `j/k`・`⌥↑↓`・`c` 等が有効化。
- `/` は normal モードでのみ「検索フォーカス」。composer 内（insert）では `/` はスラッシュコマンド用にそのまま入力。

---

## 5. 実装アーキテクチャ（メモ）

「**1 つの `dispatchShortcut(action)` に、Web のキーハンドラと Desktop のネイティブメニューの両入口を流し込む**」構成。

```
[Desktop] ネイティブ Menu(⌘1..) ─webContents.send─▶ preload ─window event─┐
                                                                          ├─▶ dispatchShortcut(action)
[Web]     keydown(⌘⇧数字 / ⌥英字 / ⌥↑↓) ───────────────────────────────────┘        │
                                                                  navigate() / setProjectsView() / setCalView()
```

- **Desktop（`apps/desktop/src/main.js`）**: `globalShortcut` は使わず（非フォーカス時も奪うため）、`Menu` + `MenuItem` の `accelerator: 'CmdOrCtrl+1'` を使う。`⌘W`/`⌘M` 等 OS 既定と被るキーもメニュー登録で上書き可。リモート URL を読む構成なので `preload.js` + `contextBridge` で `window.cairnDesktop.onNavigate(cb)` を生やし、`webContents.send('cairn:navigate', action)` → preload → `window` の CustomEvent で Web に届ける。`contextIsolation` は維持。
- **Web（`apps/web`）**: `lib/shortcuts.ts`（action 定義 + `dispatchShortcut`）と `hooks/use-app-shortcuts.ts`（keydown 登録）を新設し `PCShell` でマウント。`navigate()` / `setProjectsView()` を流用。
- **散在ハンドラの集約**: 現状 gallery（矢印・Esc）/ chat（Esc・Enter）/ ai（Enter）に個別の keydown があるので、共通フックに巻き取って `Esc`=閉じる / `Enter`=開く・送信 / `⌘Enter`=確定 を全画面で統一する。
- **カレンダー月/週の連携**: `calView` は現在 `projects-calendar.tsx` のローカル state。`STORAGE_KEYS.calendar_view` を追加して localStorage 永続化 + CustomEvent で通知し、ショートカットから操作可能にする（既存の localStorage パターンと整合）。
- **権限**: guest/admin で出せないアクション（招待等）はショートカットも同様に無効化。サーバ側チェックは常に必須（UI ガードは補助）。

---

## 6. 段階導入

1. **第1段（◎・実装済み）**: 数字ナビ + `⌥M/W/T`カレンダービュー + `⌥↑↓`順送り（カレンダー期間・Chats チャンネル・AI 会話）+ `Esc`=閉じる + ショートカットヒント表示。
   - Web: `apps/web/src/hooks/use-app-shortcuts.ts`（`PCShell` でマウント）。`⌥M/W/T` は `calendar_view` を localStorage 永続化し `cairn:cal-view` を発火、`⌥↑↓` は `cairn:seq` を発火。`PageCalendar` / `PageChat` / `PageAI` が `cairn:seq` を購読し、それぞれ期間・チャンネル・会話を前後に送る。
   - Desktop: `apps/desktop/src/main.js` のネイティブメニュー（`CmdOrCtrl+1..4`）→ `apps/desktop/src/preload.js` の `window.cairnDesktop.onNavigate` → Web の同フックが受ける。
   - `Esc`: shell（`PCShell`）レベルで最前面のオーバーレイ（通知 → 詳細パネル）を1つ閉じる。`onEscape` を `use-app-shortcuts` に渡す。入力欄にフォーカスがある時は各自の Esc 挙動を尊重して素通り。
   - ヒント表示（cmux/vimium 風）: `apps/web/src/components/app/shortcut-hints.tsx`。⌘（Mac）/ Ctrl（Win）または ⌥/Alt を約 350ms 押し続けると、次に押せるキーと操作を画面下中央に一覧表示。実キー押下・修飾キー解放・フォーカス喪失で消える。表示専用で実行はフックが担う。
   - **未了（次段送り）**: `Enter`=開く/送信の全画面統一は、リスト内フォーカス（`j/k`）の概念が要るため Vim モード（第3段）と併せて実装する。
2. **第2段（○）**: `⌥N`作成 / `⌥V` / `⌥F` / `⌘K`パレット / `⌘⇧F`横断検索 / `?`ヘルプ。
3. **第3段（△）**: Vim モード（設定トグル + 単キー層 + チャット modal + `Enter`=開く統一）。

---

## 7. 未決事項

- Vim モードの「作成」単キーを `c`（Gmail/Linear 互換）にするか `n`（new・vim と非衝突）にするか。
- コマンドパレット（`⌘K`）の中身（クイック検索 / アクション実行）の範囲。現状 cmdk 等のライブラリ未導入のため、導入時に別途設計。
