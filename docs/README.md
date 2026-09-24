# docs インデックス

作業に関係する文書だけを読む。**ドキュメントと実装が矛盾する場合はコードと [`AGENTS.md`](../AGENTS.md) を正とする。**

種別: **現行** = 実装に追従する規約・仕様 / **設計** = 設計時の記録で、現状を保証しない / **構想** = 未実装 / **記録** = 日付時点の調査・合意

## 作業別

| 作業 | 最初に読む | 補助 |
|---|---|---|
| API ルート | `api-conventions.md`（現行） | — |
| フロントエンド・UI | `frontend-guidelines.md`（現行）、`../.interface-design/system.md` | — |
| 通知・未読・Push・Realtime | `notification-design.md`（現行） | `archive/notification-ux-redesign.md`（再設計の経緯。Phase 4〜5 は構想） |
| モバイル（Expo） | `../apps/mobile/AGENTS.md`、`mobile-app.md`（現行の設計判断） | `mobile-internal-distribution.md`（配布・オフライン基盤）、`mobile-webview-auth-handoff.md`（WebView 認証）、`app-store-submission.md`（ストア提出） |
| デプロイ・リリース・本番設定 | `production-deployment.md`（現行） | `resend-email-provider.md`（認証メールの SMTP 配送） |
| プロフィール属性・メンバー表示 | `profile-attributes-design.md`（現行） | `user-deactivation-design.md`（非活性メンバー。実装済み） |
| マイルストーン | `milestone-design.md`（実装状況・設計判断・残課題） | — |
| 課金 | `billing-implementation-design.md`（Phase 1/2 実装済み） | `pricing-plan-design.md`（プラン意図）、`billing-minigame-design.md`（Phase 3 構想）、`prototypes/stone-stacking-sandbox.html` |
| `/ai`・AI メンバー | `10_ai_member_design.md`（3つの AI サーフェスの責務境界） | `scheduled-jobs-design.md`（ユーザー定義 cron・投票の構想） |
| `/ai` のプロダクトヘルプ | `../apps/web/src/lib/ai/product-help.ts`（正本。方式と更新ルールは冒頭コメント） | — |
| AI 常駐 PMO | `ai-pmo-design.md`（Phase 1/2 実装済み） | `ai-era-pm-strategy.md`（戦略の合意記録） |
| MCP・外部エージェント連携 | `mcp-server-design.md`（現行） | — |
| キーボードショートカット | `keyboard-shortcuts.md`（設計方針。割り当ては `lib/commands.ts`） | — |
| LP・マーケティング | `lp-content-redesign.md`（現行） | `landing-page-routing-design.md`（`/` の LP 配信と middleware） |
| パフォーマンス | `performance-improvement-plan.md`（残作業） | — |
| DM の法令対応 | `telecom-business-filing-research.md`（記録） | — |

## アーカイブ

[`archive/`](./archive/README.md) — 初期の要件・技術/インフラ設計、実施済みのロードマップ・作業指示書・チェックリスト、未着手の構想メモなど。**現状把握には使わない。**

## 運用ルール

- ファイル名に日付は入れない。ステータスは各文書冒頭に書き、履歴は Git に任せる
- 実装が終わった計画・チェックリスト・経緯の説明は現行文書に残さず、要点を現行文書へ移してから `archive/` へ移す
- 設計時の文書は原則編集しない。仕様が変わったら現行文書を更新する
- 文書を追加・移動したらこのインデックスと `archive/README.md` を更新する
