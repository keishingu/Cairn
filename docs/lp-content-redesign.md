# LP コンテンツ再構築（利用者ファースト化）

- **ステータス**: 実装済み
- **作成**: 2026-07-03
- **対象**: `apps/web/public/index.html` / `apps/web/public/cairn-lp.css` / `apps/web/public/cairn-lp.js`（静的 LP）

> 実装と矛盾する場合はコードと [`CLAUDE.md`](../CLAUDE.md) を正とする。
> ルーティング（`/` への公開化・`/lp` 集約）は [`landing-page-routing-design.md`](./landing-page-routing-design.md) を参照。


## 1. 背景

旧 LP の訴求軸は「100% Open Source / Self-Hosted / Bring Your Own AI / Extensible」と技術者向けに偏っており、導入を決める一般利用者（部活・サークル・小さなチーム）に刺さらなかった。また `docker compose up` や Bring Your Own AI など**実装と乖離した記述**があり、[`09_product_strategy_notes.md`](./09_product_strategy_notes.md) と [PR #282](https://github.com/keishingu/Cairn/pull/282)（マーケ自己改善ループ設計）が指摘する「嘘広告リスク」の解消が集客の前提だった。

マージ済み PR の機能群から「利用者に刺さる体験」を選び、LP を利用者ファーストに再構築した。


## 2. ターゲット（二段構え）

- **主役**: 汎用の小さなチーム（イベント運営・制作進行）
- **サブ**: 現場のあるチーム（山岳部・サークル・地域団体）。Cairn の出自（山岳部の山行計画）を必要に応じて見せる

### ペルソナ切替パラメータ

言語切替（`data-lang` / `data-i`）と同じ CSS 方式で、**`?p=team|alpineclub`** による文言切替を実装した。

- ルート要素に `data-persona` 属性（デフォルト `team`）、可変文言に `data-p="team|alpineclub"` を付与
- 切替箇所: ヒーローのリード文・ヒーロー内の製品サンプル・Problem 導入文・Gallery カード・Everywhere / Guests セクションの説明文
- PR #282 の LP コピー PDCA で、ペルソナ別 CVR を比較する A/B の受け皿になる。山岳部向けは `?p=alpineclub` で表示する（旧 `?p=club` も後方互換として受け付ける）


## 3. 機能訴求の根拠（マージ済み PR → LP コピー）

| LP の訴求 | 根拠 PR |
|---|---|
| Chat: 返信・ブックマーク・下書き自動保存 | #225, #106, #76 |
| Tasks: チャットの ☑ がタスクに同期 | #112 |
| Calendar: Google カレンダー読込・タイムライン・ドラッグ作成 | #121, #146 |
| Files & Search: 最新版フラグ・全チャンネル横断検索 | #155, #89, #237 |
| Gallery: プロジェクトごとのアルバム | 既存 + #92 |
| AI: ファイル・Google Docs を読み出典つきで回答 | #59, #263 |
| Everywhere: Web / iOS / Android / Desktop・閲覧中は鳴らない Push | Expo, #115, #130 |
| Guests & Roles: 招待リンク・ゲスト制限・ロール権限・リンク無効化 | #120, #140, #93, #102 |


## 4. 誠実化（Soul ゲート対応）

PR #282 の原則「実装と乖離した約束の禁止」に基づく修正:

- **Bring Your Own AI を LP から削除**（実装は OpenAI のみ）。ただし **BYO AI は引き続きロードマップ目標**であり、[`09_product_strategy_notes.md`](./09_product_strategy_notes.md) の優先課題 2（AI のプロバイダ非依存化）として維持する。実装され次第 LP に復帰させる
- **Self-Hosted は事実ベースに軟化して存続**（FDE 戦略・カスタマイズ訴求として重要なため削除しない）: `docker compose up` の偽ターミナルを実際に動く `git clone` + `supabase start && pnpm dev` に差し替え、Docker / On-Premise は `roadmap` 表記に変更
- フッターの Documentation / Release Notes / Issues は実在する GitHub リンクへ接続（旧: ページ内アンカーの空リンク）
- GitHub リンク（`href="#"` だった箇所含む）を実リポジトリ URL に接続

## 5. CTA とパラメータ規約（#282 の PDCA 下地）

- 主要 CTA ラベルは「クラウド版を試す」→「**無料で始める / Start for free**」に変更（[`landing-page-routing-design.md`](./landing-page-routing-design.md) §3.4 の決定を上書き。Free プランの存在を訴求する方が非技術者に刺さるため）
- `/auth/login` CTA に `data-cta` 属性と `?utm_source=lp&utm_content=<cta-id>` を付与: `nav` / `hero` / `final` / `footer-product`
- フッターの Cairn アイコンと Community の `Cairn Cloud` は、要望受付ワークスペースの招待リンクへ接続する
- 計測（PostHog 集約イベント）は**後回し**と決定。導入時はこの `data-cta` / UTM をそのままイベントプロパティに使う


## 6. 今後

- LP コピーの PDCA 運用（実験カード issue・`marketing.policy.yaml`）は PR #282 のスコープ
- OGP 画像・canonical・robots・sitemap は整備済み。ペルソナ別 OGP が必要になった場合は、静的 HTML ではなくリクエストパラメータに応じて `<head>` を出し分ける構成を検討する
- BYO AI・Docker セルフホストが実装されたら LP の該当記述を復帰・昇格させる
