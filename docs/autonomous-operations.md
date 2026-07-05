# 自律運用（Autonomous Operations）

> ステータス: 現行リファレンス（最終更新: 2026-07-05）
> 目的: メンテナ（人間）が開発リソースをほぼ割けなくても、開発・リリース・グロースが止まらずに回る仕組みの全体像と運用方法。
> 関連: [`ai-self-improvement-loop.md`](./ai-self-improvement-loop.md)（提案 intake〜Soul 審査の設計思想）、[`production-deployment.md`](./production-deployment.md)（デプロイ構成）

---

## 1. 全体像

人間が担っていた「PR の承認・マージ」「リリース操作」を、機械可読なガードレール（`soul.policy.yaml`）付きの自動化に置き換える。人間の役割は「例外時の拒否権」だけになる。

```text
[intake]  定期コード/GUI チェック（既存・リポジトリ外）─┐
          health-check.yml（週次・壊れ検知）           ├─▶ issue（ready-for-ai）
          growth-review.yml（月次・グロース棚卸し）     │
          自動化ワークフロー自身の失敗（source:ops）     ┘
          dependabot（週次）──────────────────────▶ 依存更新 PR
                                  │
                    AI エージェント（OpenCraw）が issue を処理し PR 作成
                                  │
                    CI（typecheck / lint / test）
                                  │
          autonomous-merge.yml（毎時スイープ）
            ├─ forbidden_zones 接触 → risk:high + needs-human（人間マージ待ち）
            └─ 低リスク & CI green → develop へ自動マージ ──▶ develop.oss-cairn.com
                                  │
          release.yml（月曜朝・自動）: Release PR + AI リリースノート + Draft Release
                                  │
          autonomous-merge.yml: 24h ソーク → フル検証 → main へ自動マージ
                                  │                        └▶ oss-cairn.com（本番）
                                  └─ Draft Release を自動 Publish（＝チェンジログ公開）
```

## 2. コンポーネント一覧

| コンポーネント | 頻度 | 役割 |
|---|---|---|
| 定期コード / GUI チェック（既存） | 定期 | コード・UI を点検し issue を起票。AI エージェント（OpenCraw）が処理して PR 化 |
| [`soul.policy.yaml`](../soul.policy.yaml) | — | 機械可読ガードレール。non_goals / principles / forbidden_zones / 自動マージ設定 |
| [`ci.yml`](../.github/workflows/ci.yml) | push / PR | typecheck・lint・test。自動マージの必須チェック |
| [`autonomous-merge.yml`](../.github/workflows/autonomous-merge.yml) | 毎時 | リスク分類・ラベリング・develop への自動マージ・main への自動リリースマージ・Release Publish |
| [`release.yml`](../.github/workflows/release.yml) | 週次（月曜朝）+ 手動 | Release PR と Draft Release の作成（AI がリリースノート生成） |
| [`health-check.yml`](../.github/workflows/health-check.yml) | 週次（土曜朝） | push が無くても develop の健全性（ビルド・テスト・脆弱性）を検査し、失敗を issue 化 |
| [`growth-review.yml`](../.github/workflows/growth-review.yml) | 月次（1 日朝） | グロース定常タスク（LP 追い付き・誠実化・棚卸し）を issue 化 |
| [`dependabot.yml`](../.github/dependabot.yml) | 週次 | 依存更新 PR。minor/patch はグループ化され自動マージ、メジャーは needs-human |

## 3. リスク階層と自動マージの条件

`autonomous-merge.yml` は develop 宛の open PR を毎時スイープし、次の条件を **すべて** 満たす PR を squash マージする。

1. draft でない・`needs-human` ラベルが付いていない
2. 作者が `soul.policy.yaml` の `automerge.allowed_authors` に含まれる（fork からの外部 PR を除外。AI エージェントはメンテナのアカウントで push するため、実質「メンテナ本人と dependabot」）
3. 変更ファイルが `forbidden_zones` に **一切触れていない**（触れると `risk:high` + `needs-human` が付き、理由が PR にコメントされる）
4. CI の必須チェック（Typecheck / Lint / Test）がすべて SUCCESS で、失敗・実行中のチェックが無い
5. コンフリクトが無い（コンフリクト時は `has-conflict` が付き、解消されると次のスイープで自動マージ）
6. dependabot のメジャー更新でない

安全のための追加ルール:

- **自動マージは 1 スイープにつき 1 件**（毎時実行なので最大 24 件/日）
- PR の CI は「その PR の push 時点の develop」に対する結果でしかない（他 PR のマージで develop が進んでも再実行されない）ため、PR の CI green は**候補選定の条件**に留める。最終マージは merge ジョブが**現在の develop に PR を合成した状態**で install / typecheck / lint / test を実行し、通った場合のみ行う（簡易マージキュー）
- マージは**検証した head SHA・develop 位置に固定**（`--match-head-commit` + base SHA 確認）。検証中に PR への push・develop の前進・`needs-human` の付与があった場合はマージせず次回スイープで再評価する

forbidden_zones（権限・認証・DB スキーマ・課金・ワークフロー・soul.policy.yaml 自体・CLAUDE.md）は「AI に自動変更させない領域」。この領域の PR だけが人間のマージを待つ。

## 4. リリースの自動化

- **月曜朝**: `release.yml` が Release PR（develop → main）と Draft Release を自動作成。リリースノートは AI 生成（利用者向けの変更のみ。docs/CI/依存のみならメンテナンス文）。
- **24 時間のソーク**: Release PR は作成から 24h（`automerge.main.min_age_hours`）は放置される。**この間が人間の拒否権ウィンドウ**（`needs-human` を付ければ止まる）。
- **火曜朝ごろ**: `autonomous-merge.yml` が develop の内容をその場でフル検証（install / typecheck / lint / test）し、通れば main へマージ → Vercel が本番デプロイ → Draft Release を自動 Publish。
  - スイーパー自身が検証し直すのは、GITHUB_TOKEN が作った squash コミットには push イベントの CI が走らないため（GitHub Actions の仕様）。push CI の結果には依存しない。
  - マージは**検証したチェックアウト時点の SHA に固定**（`--match-head-commit`）。検証中に develop へ新しい push があった場合はマージせず、次回スイープで再検証する。
  - 検証中に人間が停止スイッチ（Release PR への `needs-human` / `release-blocked` issue）を入れた場合を尊重するため、**マージ直前にもブロッカーを再確認**する。
- **失敗時**: `release-blocked` ラベル付きの issue が起票され、**close されるまで自動リリースは停止**する。修正 PR が develop に入ったら issue を close すると再開。

## 5. 自己修復ループ

自動化自身の故障も issue として AI ループに戻す。

- 各定期ワークフロー（autonomous-merge / release / health-check）は失敗時に `ready-for-ai` + `source:ops` の issue を起票する（同題の open issue があればコメントで追記し、乱立しない）
- `health-check.yml` は週次で develop の install / typecheck / lint / test / audit を実行し、失敗を issue 化、回復したら自動 close する
- コンフリクトした PR には `has-conflict` ラベルとコメントが付き、定期チェックのループが解消を担う

## 6. 人間に残る操作（介入ポイント）

| 操作 | 頻度 | 内容 |
|---|---|---|
| `needs-human` PR のマージ | 稀 | forbidden_zones に触れる PR（権限・認証・migration・ワークフロー等）のレビューとマージ |
| dependabot メジャー更新 | 稀 | 破壊的変更の判断。月次グロースレビューで AI が検証結果付きの推薦コメントを書く |
| Supabase / Vercel ダッシュボード | 稀 | 環境変数・Redirect URL・課金などリポジトリ外の設定 |
| GitHub Secrets | 稀 | `OPENAI_API_KEY` 等の失効時の再設定 |
| 拒否権の行使 | 任意 | 下記の停止方法 |

## 7. 停止方法（off-switches）

| 止めたい範囲 | 方法 |
|---|---|
| 特定 PR の自動マージ | PR に `needs-human` ラベルを付ける |
| 自動リリース（main への昇格）のみ | Release PR に `needs-human`、または `release-blocked` ラベルの issue を open にする |
| 自動マージ全体 | Actions タブで `Autonomous Merge` を Disable |
| ガードレールの調整 | `soul.policy.yaml` を編集（forbidden_zones の追加・ソーク時間の変更など）。このファイル自体は自動マージ不可 |

## 8. 前提条件・既知の制約

- **ブランチ保護は設定しない前提**。GITHUB_TOKEN によるマージは required reviews と両立しない。保護を導入する場合は自動マージが失敗し ops issue が起票されるので、その時に方式を再検討する
- リポジトリ設定で **Actions の Read and write permissions** と **Allow GitHub Actions to create and approve pull requests** が有効であること（release.yml が既に PR を作成できているため設定済み）
- GITHUB_TOKEN のイベントは他のワークフローをトリガーしない。issue の消費（OpenCraw）はイベント駆動ではなくポーリング / 定期起動である前提
- dependabot のコミットメッセージは英語になる（Conventional Commits の prefix のみ準拠）。リリースノートでは依存更新は除外パスなので利用者向けノートには影響しない
- モバイル（Expo）は CI でビルドしないため、依存更新によるネイティブ側の破壊は自動検知できない。モバイルに触れる際は手動確認が必要

## 9. グロースの回し方

機能を足すことより「**作ったものを訴求に追い付かせる**」ことを定常運転にする。

1. **リリースノート = 公開チェンジログ**: 週次リリースで Draft Release が自動 Publish され、変化が外から見え続ける
2. **月次グロースレビュー**（`growth-review.yml`）: LP・README への新機能反映、コピーの誠実化（実装と乖離した訴求の排除）、SEO/OGP、needs-human PR や dependabot メジャーの棚卸しを AI がまとめて実施
3. **intake 2 系統**（[`ai-self-improvement-loop.md`](./ai-self-improvement-loop.md)）: 改善提案チャンネルの定性シグナルと PostHog の集約シグナル（導入すれば）を issue 化する。**個人の監視はしない**（non_goals）

## 10. ラベル一覧

| ラベル | 意味 | 付与者 |
|---|---|---|
| `risk:low` | forbidden_zones 非接触。自動マージ対象 | autonomous-merge |
| `risk:high` | forbidden_zones 接触 | autonomous-merge |
| `needs-human` | 自動マージ対象外。人間の判断待ち | autonomous-merge / 人間 |
| `has-conflict` | コンフリクトのため自動マージ不可 | autonomous-merge |
| `ready-for-ai` | AI エージェントが着手してよい issue | 各ワークフロー / triage |
| `source:ops` | 自動化ワークフローの失敗起票 | 各ワークフロー |
| `source:growth` | 月次グロースレビュー | growth-review |
| `release-blocked` | open の間、自動リリース停止 | autonomous-merge |
