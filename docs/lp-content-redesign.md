# LP コンテンツ再構築（三人称順・誠実コピー）

- **ステータス**: 実装済み
- **作成**: 2026-07-03
- **更新**: 2026-08-27
- **対象**: `apps/web/public/index.html` / `apps/web/public/cairn-lp.css` / `apps/web/public/cairn-lp.js`（静的 LP）

> 実装と矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。
> ルーティング（`/` への公開化）は [`landing-page-routing-design.md`](./landing-page-routing-design.md) を参照。


## 1. 背景

旧 LP の訴求軸は「100% Open Source / Self-Hosted / Bring Your Own AI / Extensible」と技術者向けに偏っており、導入を決める一般利用者に刺さらなかった。その後の再構築（2026-07）は「One Project. One Place」と 6 機能カタログ、`?p=team|alpineclub` のペルソナ切替を主物語にした。

2026-08 の再構築は、そのカタログ物語をやめて **一枚のページを三人の読み順** にする。公開 LP は初回訪問者向けであり、実装していない能力・競合製品名・人数課金・ケルン課金 UX を出さない。


## 2. 三人の読み順（現行の主物語）

`?p=team|alpineclub` は **主物語にしない**。JS は古い URL 互換のため `data-persona` を残すが、コピーは切替に依存しない。現場の例はイラストとして出してよい（競合製品名は付けない）。

| 順 | 読み手 | セクション | 伝えること |
|---|---|---|---|
| 1 | 一般メンバー（全員が得する） | Hero `#stay` | 案件のコメントスレッドがリアルタイムチャットとして進む。話したことは消えない。仕事として残る。人数では料金が増えない。有料は大きなファイルと、自分から使う AI だけ。会話は無料。CTA は「無料で始める」 |
| 2 | これまで「まとめ役」だった人 | `#admin` | 遅れを指摘しなくていい。進捗を聞きに回る時間をやめられる。管理ツールの売り込みにしない。短い |
| 3 | エンジニア / アーリーアダプターだけ | `#ai` | ネイティブのチーム AI（MCP を知らない人向け）が先。会話とファイルを読んで出典つきで答える。チャットの ☑ がタスクになる。能動利用は有料。MCP は任意でその下。Claude / Cursor からタスクとメッセージを読み書きできる |

Hero と最終 CTA のラベルは「**無料で始める / Start for free**」。`/auth/login` に `data-cta` と `?utm_source=lp&utm_content=<cta-id>`（`nav` / `hero` / `final` / `footer-product`）。

GitHub リンクは維持する。Hero の二次 CTA も実リポジトリへ向ける。


## 3. 誠実化（Soul ゲート）

公開 LP に書いてよいのは、**本番で動いていること**だけ。望む一文が未出荷なら、いちばん近い本当のループに落とす。

### 書いてよい（コードで確認済み）

| コピー | 根拠 |
|---|---|
| 案件コメントがリアルタイムチャットになる | `RealtimeProvider` + `realtime.broadcast_changes()`。ポーリングなし |
| チャットの ☑ がタスクになる | `parseCheckboxes` → プロジェクトチャンネル投稿時にタスク化（`post-message.ts`） |
| `/ai` がファイル・会話を読み、出典つきで答える | RAG `rag-sources` + 読み取り専用 research tools。書き込み・自動リスケはしない |
| リモート MCP でタスクとメッセージの読み書き | `GET`/`POST /api/mcp`。`list_my_tasks` / `create_task` / `complete_task` / `search_messages` / `post_message` ほか |
| 会話メンバーは人数無制限。人数では課金しない | [`pricing-plan-design.md`](./pricing-plan-design.md)（メンバー数 / チャット履歴 / ゲストは全プラン無制限） |
| 有料 = 大きなファイル + 能動 AI | [`billing-implementation-design.md`](./billing-implementation-design.md)。能動 AI は `/ai` 依頼。チャット本文は無料 |
| ゲストはリンク招待（メール不要） | 招待リンク。ゲストは参加プロジェクトのみ |
| スマホと PC、同じ場所 | Web / iOS / Android / Desktop |
| Apache-2.0 / GitHub | 公開リポジトリ |
| セルフホストは事実ベース | ローカルは `git clone` + `supabase start && pnpm dev`。Docker / On-Premise は `roadmap` |

### 書いてはいけない

- **未出荷の約束**: 自律エージェント、予定の自動変更、チャンネル内 AI メンバー、Bring Your Own AI、動く `docker compose up`
- **AI PMO / 監視**: 「誰が遅いか」ダッシュボード、遅れの自動指摘を売りにしない（`FEATURE_FLAGS.aiPmo` は production で `false`。受動ナッジを LP の機能として出さない）
- **人数課金**: per-seat / 席課金の暗示も禁止
- **ケルン課金 UX**: 石積み・風化・Solo プラン名は初回訪問者向け LP に出さない。入口では「会話は無料、大きなファイルと能動 AI だけ有料」まで
- **競合製品名**: Backlog / Chatwork / Slack / Notion / LINE 等を LP に書かない
- **非公開の顧客名**: パブリックリポジトリのため固有名詞を出さない
- **MCP の実装詳細を Hero に置かない**: OAuth / PAT / API / `/api/mcp` は Hero 禁止。MCP 自体はセクション 3 の任意枠だけ
- **機能カタログを主物語にしない**: Chat / Tasks / Calendar / Files / Gallery / AI の 6 枚並べは廃止。Gallery は「残ることの証拠」として降格


## 4. 降格して残すもの

主物語のあと、小さめに残す。

- ゲスト招待（リンク、メール不要）
- スマホと PC、同じ場所
- Apache-2.0 / GitHub
- Gallery は機能一覧ではなく、「写真も会話の隣に残る」証拠
- セルフホストは事実ベース / roadmap
- 法人向けサポート（フッター近く）


## 5. 履歴（2026-07 の再構築）

当時の二段構え（小さなチームが主役、山岳部は `?p=alpineclub`）と 6 機能カタログは、2026-08 の三人称順に置き換えた。CTA ラベル「無料で始める」、UTM、GitHub 実リンク、BYO AI 削除、偽 `docker compose up` 削除は維持している。

当時の機能→PR 対応表は参考用:

| 体験 | 根拠 PR |
|---|---|
| Chat: 返信・ブックマーク・下書き自動保存 | #225, #106, #76 |
| Tasks: チャットの ☑ がタスクに同期 | #112 |
| Calendar: Google カレンダー読込・タイムライン・ドラッグ作成 | #121, #146 |
| Files & Search: 最新版フラグ・全チャンネル横断検索 | #155, #89, #237 |
| Gallery: プロジェクトごとのアルバム | 既存 + #92 |
| AI: ファイル・Google Docs を読み出典つきで回答 | #59, #263 |
| Everywhere: Web / iOS / Android / Desktop | Expo, #115, #130 |
| Guests & Roles: 招待リンク・ゲスト制限・ロール権限 | #120, #140, #93, #102 |


## 6. CTA とパラメータ規約

- 主要 CTA: 「**無料で始める / Start for free**」→ `/auth/login?utm_source=lp&utm_content=<cta-id>`
- `data-cta`: `nav` / `hero` / `final` / `footer-product`（フッターアイコン・コミュニティは要望受付ワークスペース招待）
- 計測（PostHog 集約イベント）は後回し。導入時はこの `data-cta` / UTM をイベントプロパティに使う
- 認証ルーティングとアプリ本体の UI は LP 再構築の対象外（[`landing-page-routing-design.md`](./landing-page-routing-design.md)）


## 7. 今後

- LP コピーの PDCA 運用（実験カード issue・`marketing.policy.yaml`）は PR #282 のスコープ。ペルソナ別 CVR 比較の受け皿として `?p=` は残っているが、**現行コピーはペルソナ切替を使わない**
- BYO AI・Docker セルフホストが実装されたら、事実として昇格させてよい
- AI PMO を production で出すまでは、受動 AI を LP の機能として書かない
- OGP 画像・canonical・robots・sitemap は整備済み
