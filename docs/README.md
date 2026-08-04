# docs インデックス

このディレクトリのドキュメント一覧と、各文書の信頼度（ステータス）。

> **大原則: ドキュメントと実装が矛盾する場合、コードと [`CLAUDE.md`](../CLAUDE.md) を正とする。**

## 種別の意味

- **現行リファレンス** — 実装に追従して更新される規約・仕様。信頼してよい
- **設計時スナップショット** — 設計フェーズの記録。意図・経緯の理解には有用だが、実装の現状を保証しない
- **記録** — 日付付きの議論・調査のスナップショット。作成日時点の事実
- **アーカイブ** — 過去の一回性の作業資料。現状把握には使わない

## 作業別の参照ガイド

| 作業 | 最初に読む | 補助（設計意図・経緯） |
|---|---|---|
| API ルートの追加・変更 | `api-conventions.md` | — |
| フロントエンド・UI 実装 | `frontend-guidelines.md` | `ui-consistency-checklist.md`（統一の進捗） |
| 通知・未読・Push・Realtime | `notification-design.md`（現行仕様） | `notification-ux-redesign.md`（Phase 設計・Realtime 方針の根拠）、`07_notifications_and_unread.md` |
| モバイル（Expo） | CLAUDE.md「決定済みの技術判断」、`mobile-internal-distribution.md` | `08_expo_roadmap.md`、`mobile-webview-auth-handoff.md`（WebView 認証） |
| キーボードショートカット | `keyboard-shortcuts.md` | — |
| デプロイ・リリース・本番設定 | `production-deployment.md` | — |
| 課金（Phase 1 実装済み） | `billing-implementation-design.md`（現行の実装・運用） | `pricing-plan-design.md`（プラン意図）、`billing-minigame-design.md`（Phase 3 の石積みミニゲーム）、`prototypes/stone-stacking-sandbox.html`（触感検証モック） |
| マイルストーン（未実装・設計のみ） | `milestone-design.md`（差分分析・実装計画） | `07_notifications_and_unread.md`（エンティティ=チャンネル思想） |
| AI メンバー・定期ジョブ（未実装・設計のみ） | `10_ai_member_design.md` / `scheduled-jobs-design.md` | `ai-self-improvement-loop.md` |
| AI常駐PMO・プライベートナッジ（未実装・設計のみ） | `ai-pmo-design.md` | `ai-era-pm-strategy.md`（戦略背景）、`10_ai_member_design.md`（Stage 3 との関係） |
| MCP サーバ・外部エージェント連携 | `mcp-server-design.md`（リモート MCP + PAT の現行仕様） | `ai-era-pm-strategy.md`（座取りの合意） |
| LP・マーケティング | `lp-content-redesign.md` | `landing-page-routing-design.md`、`lp-soul-page-copy.md` |

## 現行リファレンス

| ファイル | 内容 | 最終更新 |
|---|---|---|
| [`api-conventions.md`](./api-conventions.md) | API ルート実装規約・認証・サインアップフロー | 2026-07-03 |
| [`frontend-guidelines.md`](./frontend-guidelines.md) | コンポーネント設計・Domain Hook パターン・UIディレクトリ構成 | 2026-06-10 |
| [`notification-design.md`](./notification-design.md) | 通知・未読の現行仕様 | 2026-07-03 |
| [`notification-ux-redesign.md`](./notification-ux-redesign.md) | 通知・未読・Push の再設計。**Phase 1〜3 実装済み**（現行 Realtime 方針 = Broadcast from Database はここの Phase 2）。Phase 4〜5 は構想 | 2026-07-03 |
| [`mobile-webview-auth-handoff.md`](./mobile-webview-auth-handoff.md) | モバイル WebView 認証のワンタイムトークンハンドオフ（実装済み） | 2026-07-03 |
| [`mobile-chat-parity-checklist.md`](./mobile-chat-parity-checklist.md) | モバイルWebとExpoネイティブチャットの表示同等性チェックリスト | 2026-07-12 |
| [`mobile-internal-distribution.md`](./mobile-internal-distribution.md) | Expo Internal Distribution とオフライン基盤の運用手順 | 2026-07-23 |
| [`10_ai_member_design.md`](./10_ai_member_design.md) | AIメンバー設計（構想段階の現行合意。実装着手時に更新する） | 2026-06-11 |
| [`ai-pmo-design.md`](./ai-pmo-design.md) | AI常駐PMO設計（ハートビート巡回 + 本人だけに見えるプライベートナッジ。実装未着手） | 2026-07-17 |
| [`mcp-server-design.md`](./mcp-server-design.md) | リモート MCP + PAT の現行仕様（stdio/npm 版は後続） | 2026-08-04 |
| [`scheduled-jobs-design.md`](./scheduled-jobs-design.md) | 定期ジョブ（cron・自然言語で定義）+ アプリ内投票機能の設計（構想段階） | 2026-06-25 |
| [`milestone-design.md`](./milestone-design.md) | マイルストーン機能の実装設計（現実装との差分分析・DB/API/UI 設計・フェーズ計画。実装未着手） | 2026-07-09 |
| [`production-deployment.md`](./production-deployment.md) | 本番環境構成・残タスク・一般公開に向けた設定 | 2026-06-21 |
| [`pricing-plan-design.md`](./pricing-plan-design.md) | 料金プラン設計（Free / Solo / Team / Expedition、ケルン消費モデル。Team / Expedition は未実装） | 2026-07-24 |
| [`billing-implementation-design.md`](./billing-implementation-design.md) | 課金の実装設計（Phase 1 のクレジット台帳・ストレージ家賃・風化・Stripe統合は実装済み） | 2026-07-24 |
| [`billing-minigame-design.md`](./billing-minigame-design.md) | 課金体験の石積みミニゲーム設計（貢献レイヤー・持ち越しキュー・2D物理。実装未着手、Phase 3） | 2026-07-20 |
| [`keyboard-shortcuts.md`](./keyboard-shortcuts.md) | キーボードショートカット設計（3層モデル・全画面マッピング。第2.5段まで実装済み、Vim モードは未実装） | 2026-06-17 |
| [`landing-page-routing-design.md`](./landing-page-routing-design.md) | ランディングページ導入とルーティング再構成（`/` を公開 LP 化。実装済み） | 2026-07-03 |
| [`lp-content-redesign.md`](./lp-content-redesign.md) | LP コンテンツの利用者ファースト化（ペルソナ切替 `?p=`、誠実化、CTA/UTM 規約） | 2026-07-03 |
| [`ui-consistency-checklist.md`](./ui-consistency-checklist.md) | UI 一貫性統一の進捗管理チェックリスト（方針本文は `frontend-guidelines.md`） | 2026-06 |
| [`performance-improvement-plan.md`](./performance-improvement-plan.md) | フロントエンド体感速度の改善施策（認証往復・認可クエリ・API集約のボトルネック分析と実施計画。実装未着手） | 2026-07-12 |

## 設計時スナップショット

| ファイル | 内容 | 作成 |
|---|---|---|
| [`01_product_requirements.md`](./01_product_requirements.md) | プロダクト要件（初期構想。未実装機能を含む） | 2026-05-22 |
| [`03_technical_architecture.md`](./03_technical_architecture.md) | 技術要件（確定判断は CLAUDE.md が正） | 2026-05-22 |
| [`05_infrastructure.md`](./05_infrastructure.md) | インフラ要件 | 2026-05-22 |
| [`06_integration_strategy.md`](./06_integration_strategy.md) | 外部連携方針（Slack / Teams / Outlook は未実装） | 2026-05-22 |
| [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) | 通知・未読の設計検討 → 現行仕様は `notification-design.md` | 2026-05-27 |
| [`user-deactivation-design.md`](./user-deactivation-design.md) | ユーザー非活性化・退会設計（卒業生対応・GDPR 消去権の整理・匿名化）。スキーマのみ実装済み、遮断・API・UI は未着手 | 2026-06-22 |
| [`08_expo_roadmap.md`](./08_expo_roadmap.md) | Expo ネイティブ化ロードマップ（WebView 化・Push まで実施済み） | 2026-05-27 |
| [`ai-self-improvement-loop.md`](./ai-self-improvement-loop.md) | AI 自己改善ループ（提案 → issue → AI 実装 → SOUL 審査 → 人間 merge）の設計メモ（実装前） | 2026-07-03 |
| [`lp-soul-page-copy.md`](./lp-soul-page-copy.md) | Soul ページ（Open Soul Software / SOUL.md）のコピー案ドラフト（ページ未実装） | 2026-07-03 |

## 記録

| ファイル | 内容 | 作成 |
|---|---|---|
| [`09_product_strategy_notes.md`](./09_product_strategy_notes.md) | 展開戦略・魅力向上の優先課題の議論記録 | 2026-06-11 |
| [`telecom-business-filing-research.md`](./telecom-business-filing-research.md) | 電気通信事業の届出要否・タイミングの調査記録 | 2026-06-17 |
| [`ai-era-pm-strategy.md`](./ai-era-pm-strategy.md) | AI時代のPM ツール戦略（3つの逆転）の合意記録: 会話ソース連携・カレンダー経由の紐付け・出席者承認・MCPサーバーとしての座取り・沈黙の設計 | 2026-07-17 |

## アーカイブ

[`archive/`](./archive/README.md) — 一回性の作業資料（UIデザインプロンプト、設計時スキーマSQL、Phase 2-B 作業指示書）。現状を反映しない。

## 運用ルール

- ファイル名に日付は入れない（リンク安定性のため）。作成日・ステータスは各文書冒頭のヘッダに書き、履歴は Git に任せる
- 番号付きファイル（`01_`〜）は設計フェーズのスナップショットとして凍結する。今後の現行リファレンスは番号なし・説明的な名前で作成する（`04` は設計時スキーマSQLで、`archive/` に移動済み）
- 設計時スナップショットは原則編集しない。仕様が変わったら現行リファレンス側を更新し、必要ならスナップショットのヘッダから誘導する
- 新しいドキュメントを追加・移動したら、このインデックスを更新する
