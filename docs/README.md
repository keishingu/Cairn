# docs インデックス

このディレクトリのドキュメント一覧と、各文書の信頼度（ステータス）。

> **大原則: ドキュメントと実装が矛盾する場合、コードと [`CLAUDE.md`](../CLAUDE.md) を正とする。**

## 種別の意味

- **現行リファレンス** — 実装に追従して更新される規約・仕様。信頼してよい
- **設計時スナップショット** — 設計フェーズの記録。意図・経緯の理解には有用だが、実装の現状を保証しない
- **記録** — 日付付きの議論・調査のスナップショット。作成日時点の事実
- **アーカイブ** — 過去の一回性の作業資料。現状把握には使わない

## 現行リファレンス

| ファイル | 内容 | 最終更新 |
|---|---|---|
| [`api-conventions.md`](./api-conventions.md) | API ルート実装規約・認証・サインアップフロー | 2026-06-10 |
| [`frontend-guidelines.md`](./frontend-guidelines.md) | コンポーネント設計・Domain Hook パターン・UIディレクトリ構成 | 2026-06-10 |
| [`notification-design.md`](./notification-design.md) | 通知・未読の現行仕様 | 2026-06-10 |
| [`notification-ux-redesign.md`](./notification-ux-redesign.md) | 通知・未読・Push の再設計案（Realtime 移行を含む） | 2026-06 |
| [`10_ai_member_design.md`](./10_ai_member_design.md) | AIメンバー設計（構想段階の現行合意。実装着手時に更新する） | 2026-06-11 |
| [`scheduled-jobs-design.md`](./scheduled-jobs-design.md) | 定期ジョブ（cron・自然言語で定義）+ アプリ内投票機能の設計（構想段階） | 2026-06-25 |
| [`production-deployment.md`](./production-deployment.md) | 本番環境構成・残タスク・一般公開に向けた設定 | 2026-06-21 |
| [`pricing-plan-design.md`](./pricing-plan-design.md) | 料金プラン設計（Free / Solo / Team / Expedition、ケルン消費モデル） | 2026-06-16 |
| [`billing-implementation-design.md`](./billing-implementation-design.md) | 課金の実装設計（クレジット台帳・ストレージ家賃・風化・Stripe統合） | 2026-06-16 |
| [`keyboard-shortcuts.md`](./keyboard-shortcuts.md) | キーボードショートカット設計（3層モデル・全画面マッピング・Vim モード。第1段のみ実装済み） | 2026-06-16 |

## 設計時スナップショット

| ファイル | 内容 | 作成 |
|---|---|---|
| [`01_product_requirements.md`](./01_product_requirements.md) | プロダクト要件（初期構想。未実装機能を含む） | 2026-05-22 |
| [`03_technical_architecture.md`](./03_technical_architecture.md) | 技術要件（確定判断は CLAUDE.md が正） | 2026-05-22 |
| [`05_infrastructure.md`](./05_infrastructure.md) | インフラ要件 | 2026-05-22 |
| [`06_integration_strategy.md`](./06_integration_strategy.md) | 外部連携方針（Slack / Teams / Outlook は未実装） | 2026-05-22 |
| [`07_notifications_and_unread.md`](./07_notifications_and_unread.md) | 通知・未読の設計検討 → 現行仕様は `notification-design.md` | 2026-05-27 |
| [`user-deactivation-design.md`](./user-deactivation-design.md) | ユーザー非活性化・退会設計（卒業生対応・GDPR 消去権の整理・匿名化） | 2026-06-22 |
| [`sentry-error-automation-design.md`](./sentry-error-automation-design.md) | Sentry エラー検知 → GitHub issue → 修正PR 自動化設計（`ai-self-improvement-loop.md` の姉妹文書） | 2026-07-01 |
| [`08_expo_roadmap.md`](./08_expo_roadmap.md) | Expo ネイティブ化ロードマップ（一部実施済み） | 2026-05-27 |

## 記録

| ファイル | 内容 | 作成 |
|---|---|---|
| [`09_product_strategy_notes.md`](./09_product_strategy_notes.md) | 展開戦略・魅力向上の優先課題の議論記録 | 2026-06-11 |

## アーカイブ

[`archive/`](./archive/README.md) — 一回性の作業資料（UIデザインプロンプト、設計時スキーマSQL、Phase 2-B 作業指示書）。現状を反映しない。

## 運用ルール

- ファイル名に日付は入れない（リンク安定性のため）。作成日・ステータスは各文書冒頭のヘッダに書き、履歴は Git に任せる
- 番号付きファイル（`01_`〜）は設計フェーズのスナップショットとして凍結する。今後の現行リファレンスは番号なし・説明的な名前で作成する（`04` は設計時スキーマSQLで、`archive/` に移動済み）
- 設計時スナップショットは原則編集しない。仕様が変わったら現行リファレンス側を更新し、必要ならスナップショットのヘッダから誘導する
- 新しいドキュメントを追加・移動したら、このインデックスを更新する
