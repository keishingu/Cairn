# モバイルネイティブ化 完成定義・現状監査・バックログ

> **ステータス**: 現行リファレンス（作成: 2026-07-05）
> このドキュメントが「ネイティブアプリの完成の定義」の唯一の正。
> 自動化ループ（[`docs/prompts/mobile-loop/README.md`](./prompts/mobile-loop/README.md)）の QA / Builder エージェントは本書を仕様として参照する。
> 実装が進んだら本書のチェックリスト・バックログを**同じ PR 内で**更新すること。

---

## 1. 目標アーキテクチャ（確定）

**ネイティブ（React Native）で実装するのは 4 つだけ。他はすべて WebView。**

| 領域 | 実装 | 理由 |
|---|---|---|
| 認証（メール・Google OAuth） | ネイティブ | Web のリダイレクト方式が WebView で使えない |
| ナビバー（フッタータブ） | ネイティブ | オフライン時もナビゲーションが生きる・ネイティブチャットへの到達経路 |
| チャット（一覧 + スレッド） | ネイティブ | 圏外での閲覧・送信キュー・バックグラウンドアップロードが必要 |
| ログアウト | ネイティブ | ネイティブ・WebView 両方のセッション破棄が必要 |
| プロジェクト / タスク / 通知 / AI / ファイル / 設定 等 | WebView | Web 版をそのまま表示（ワンタイムトークンハンドオフで認証） |

関連する確定済み技術判断は [`CLAUDE.md`](../CLAUDE.md) を正とする（WebView 認証ハンドオフ・Google ログインのネイティブ実装・Bearer 認証）。

---

## 2. 現状監査（2026-07-05 時点）

### できていること ✅

- ネイティブ認証: メール（`(auth)/login.tsx` / `signup.tsx`）+ Google OAuth（`lib/oauth.ts`, PKCE + `cairn://auth/callback`）
- WebView 認証ハンドオフ（`components/app-webview.tsx` + `POST /api/auth/webview-handoff`、リトライ 1 回・オリジン検証つき）
- WebView 画面: projects / projects/[id] / tasks / notifications / ai
- ネイティブのチャンネル一覧（`(app)/chats/index.tsx`、未読バッジつき）
- ネイティブのログアウト（`(app)/menu/index.tsx`）
- Push 通知: トークン登録（`POST /api/push/subscribe`）・通知タップでタブへ遷移
- PR ごとの EAS Update プレビュー（`.github/workflows/mobile-preview.yml`、QR コード付き PR コメント）
- CI: ルート `pnpm typecheck` が `@cairn/mobile` を含む

### 頓挫している点（＝本ループが解消する対象）❌

1. **ネイティブタブバーが無効化されている**。`(app)/_layout.tsx` が `tabBarStyle: { display: 'none' }` でタブを隠し、ナビゲーションを WebView 内の Web フッター（`MobileNav`）に委ねている。このため:
   - ネイティブのチャット一覧・メニュー（ログアウト）に通常操作で**到達できない**（Push 通知タップ経由のみ）
   - オフライン時にナビゲーションが死ぬ
2. **ネイティブチャットスレッド画面が存在しない**。`chats/index.tsx` はチャンネルタップで `/projects/[id]`（WebView）へ飛ばしている。`hooks/use-messages.ts`（`useMessages` / `useSendMessage` / `useMarkChannelRead`）は実装済みだが、使う画面がない。
3. **Web 側の WebView 判定が未消費**。`middleware.ts` は `?webview=1` で `x-webview: 1` ヘッダーをセットするが、どこも読んでいない（WebView 内で Web フッターが出続ける）。
4. 上記 1 の仕様を定義した PR #129（フッターのネイティブ化仕様書）が unmerged のまま close され、作業が浮いた。

---

## 3. 受け入れチェックリスト（完成の定義）

「完成度 = 下表の PASS 率」。QA エージェントは S1 から順に検証し、FAIL / BLOCKED を issue 化する。
検証環境: iOS シミュレータ（優先）/ Android エミュレータ、ローカル `supabase start` + `pnpm dev` + expo-dev-client。

| ID | シナリオ | 合格条件 | 状態 (2026-07-05) |
|---|---|---|---|
| S0 | テストアカウント準備 | サインアップ画面から新規登録 → `/api/auth/setup` で profiles 作成 → ワークスペースに入れる | 未検証 |
| S1 | メールログイン | ログイン → プロジェクト一覧（WebView）が表示される | 未検証 |
| S2 | Google ログイン | `expo-web-browser` → `cairn://auth/callback` → セッション確立（ローカルは `supabase/config.toml` の redirect 許可が前提） | 未検証 |
| S3 | WebView ハンドオフ | ログイン後、WebView 内でログイン画面が出ない。ハンドオフ失敗時は 1 回だけ自動リトライ | 未検証 |
| S4 | ネイティブタブバー | タブバーが**ネイティブで常時表示**され、全タブを切替できる。WebView 内の Web フッターは表示されない | **FAIL**（タブ非表示） |
| S5 | チャンネル一覧 | チャットタブでチャンネル一覧・未読バッジが表示される | **FAIL**（到達不能） |
| S6 | ネイティブチャット送信 | チャンネルタップ → **ネイティブ**スレッド画面 → 過去メッセージ表示・送信 → Web 版にも反映 | **FAIL**（画面なし） |
| S7 | チャット受信 | 他クライアント（Web）からの送信が、スレッド表示中 or 復帰時に反映される | **FAIL**（画面なし） |
| S8 | WebView 画面群 | projects / tasks / notifications / ai が表示され、内部遷移・戻るが機能する | 未検証 |
| S9 | ログアウト | メニュー → サインアウト → ログイン画面へ。再度ログインすると WebView も新セッション | 未検証 |
| S10 | Push 通知 | 許可ダイアログ → トークンが `push_subscriptions` に登録。通知タップで該当タブへ遷移（実機のみ。シミュレータは登録 API 呼び出しまで確認） | 未検証 |
| S11 | セッション永続 | アプリ強制終了 → 再起動でログイン状態が維持される（expo-secure-store） | 未検証 |
| S12 | オフライン送信キュー | 機内モードで送信 → 「送信失敗・再送」表示 → 電波回復で自動送信 | N/A（M3 未実装） |

「未検証」は QA エージェントの初回走査で PASS / FAIL に確定させる。

---

## 4. 残作業バックログ（優先順）

Builder エージェントは `mobile` + `ready-for-ai` ラベルの issue がないとき、この表の上から着手する。
1 PR = 1 項目（または項目内の 1 ステップ）を厳守する。

| ID | 内容 | 対応シナリオ | 備考 |
|---|---|---|---|
| M1 | **ネイティブタブバー有効化**: `tabBarStyle` の非表示を外し 5 タブ + メニューを表示。Web 側は `x-webview` ヘッダー（または `?webview=1` を sessionStorage 維持）で `MobileNav` を非表示化。WebView 内のチャット導線タップはネイティブへ委譲 | S4, S5 | 旧 PR #129 の仕様を吸収。Web/ネイティブ両側の変更 |
| M2 | **ネイティブチャットスレッド画面** `chats/[channelId].tsx`: `useMessages` / `useSendMessage` / `useMarkChannelRead` を使い、表示・送信・既読まで。添付は M5 | S6, S7 | `docs/archive/prompts/phase2b-5-native-chat.md` の前段 |
| M3 | オフライン送信キュー（AsyncStorage + NetInfo） | S12 | `docs/archive/prompts/phase2b-5-native-chat.md` |
| M4 | Push 深リンク: 通知タップで該当チャンネルのスレッドへ直行 | S10 | M2 完了後 |
| M5 | チャット添付: 画像表示・送信、バックグラウンドアップロード | S6 | |
| M6 | 配布準備: ストア公開 | — | インフラは整備済み（`app.config.ts` 化・EAS production プロファイル・Mobile Release workflow）。残りは [`mobile-store-release.md`](./mobile-store-release.md) §2 の初回セットアップ（人間）と、旧 PR #84（/api/version・互換性チェック）の再実装判断 |

---

## 5. 散在 PR の棚卸し（2026-07-05）

| PR | 状態 | 処置 |
|---|---|---|
| #129 フッターのネイティブ化仕様書 | closed（unmerged） | 仕様は本書 M1 に吸収済み。再オープン不要 |
| #84 iOS 配布戦略・/api/version | closed（unmerged） | M6 として本書に登録。実装は配布着手時に再判断 |
| #96 EAS Update プレビュー | merged | 稼働中（mobile-preview.yml） |
| #128 Google OAuth ネイティブ | merged | 稼働中 |
| #230 / #239 等の「モバイル」PR | open | **Web 版モバイルシェル**の話でネイティブアプリとは別トラック。本ループの対象外 |

> 注意: `docs/08_expo_roadmap.md` の Phase 2-B 進捗表は古い（2-4 WebView 化は実施済み）。ネイティブ化の現状は本書を正とする。
