# モバイルネイティブ化 自動改善ループ

> **ステータス**: 現行リファレンス（作成: 2026-07-05）
> 頓挫したネイティブアプリ化（認証・ナビバー・チャット・ログアウトのみ RN、他 WebView）を、
> 人間の作業を「PR のマージだけ」に絞って完成まで運ぶための仕組み。
> 完成の定義は [`docs/mobile-native-completion.md`](../../mobile-native-completion.md) が唯一の正。

---

## 全体像

```
┌─ QA エージェント（Codex Computer Use / ユーザーの Mac）──────────┐
│ qa-codex.md を実行                                                │
│ シミュレータで S0〜S11 を走査 → FAIL を issue 化                  │
│ (label: mobile, mobile-qa, ready-for-ai)                          │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌─ Builder エージェント（Claude Code Remote ルーティン / 毎日自動）─┐
│ builder.md を実行（1 日 1 サイクル）                              │
│ ① 自ループの open PR が 2 件以上 → 新規着手せず既存 PR の         │
│    レビュー対応・CI 修復のみ                                      │
│ ② mobile + ready-for-ai の issue があれば最優先 1 件を修正        │
│ ③ なければ完成定義のバックログ（M1→M6）の最上位を 1 ステップ実装  │
│ → typecheck / test / lint → develop 宛 PR（1 サイクル 1 PR）      │
│ → mobile-preview.yml が EAS Update の QR を PR に自動コメント     │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌─ 人間（ユーザー）────────────────────────────────────────────────┐
│ ・PR をレビューしてマージ（これだけが必須作業）                   │
│ ・任意: PR コメントの QR を expo-dev-client で読んで実機確認      │
└──────────────────────────────────────────────────────────────────┘
```

QA が「目」、Builder が「手」、人間が最終ゲート（merge）。
[`docs/ai-self-improvement-loop.md`](../../ai-self-improvement-loop.md) の「AI は提案と実装まで、merge は人間」という原則をモバイルに適用したもの。

## 構成ファイル

| ファイル | 役割 | 実行者 |
|---|---|---|
| [`qa-codex.md`](./qa-codex.md) | シミュレータ QA → issue 起票 | Codex（Computer Use、macOS ローカル） |
| [`builder.md`](./builder.md) | issue / バックログ → 修正 → PR | Claude Code Remote ルーティン（毎日 04:00 JST に自動起動）または任意のコーディングエージェント |
| [`../../mobile-native-completion.md`](../../mobile-native-completion.md) | 完成の定義・チェックリスト・バックログ | 両エージェントが仕様として参照 |

## issue ラベル運用

| ラベル | 意味 |
|---|---|
| `mobile` | ネイティブアプリ（apps/mobile + Web 側の WebView 対応）に関する issue |
| `mobile-qa` | QA エージェントがシミュレータ走査で起票した不具合 |
| `ready-for-ai` | Builder が自動着手してよい（起票時に付与。人間が外せば着手されない） |

- QA エージェントは起票前に `mobile-qa` の open issue と照合し、**重複起票しない**
- 判断が割れる問題（仕様変更・M6 配布関連）は `ready-for-ai` を付けず、人間の判断を仰ぐコメントを残す

## ユーザーがやること

**日常: Builder が出す PR をレビューしてマージするだけ。**

それ以外は任意・低頻度:

1. **QA の実行（週 1 回程度を推奨）**: Mac で Codex を開き、`qa-codex.md` の内容を貼り付けて Computer Use で実行する（Codex のスケジュールタスクに登録すればこれも自動化できる）
2. **実機確認（気が向いたとき）**: PR コメントの EAS Update QR を expo-dev-client で読む
3. **ループの一時停止**: Claude Code Remote のルーティン一覧から「Cairn mobile builder loop」を無効化（PR が溜まりすぎたとき等。Builder 自身も open PR 2 件以上では新規着手しない設計）

## ガードレール

- **1 サイクル 1 PR**・PR は小さく（バックログ 1 項目 or issue 1 件）。PR の散在を再発させない
- Builder は自ループの open PR が 2 件以上あるとき新規実装をしない（レビュー対応・CI 修復に回る）
- 認証トークンの扱い（refresh_token を WebView に渡さない等）・権限・課金・マイグレーションの設計変更は自動で行わない。必要なら issue を立てて人間に確認
- merge は常に人間。エージェントは自分の PR を merge しない
- コミット・PR・レビュー返信の規約は [`CLAUDE.md`](../../../CLAUDE.md) に従う

## コスト

- Builder ルーティン: 1 日 1 セッション。やることがなければ数分で終了する
- EAS Update（プレビュー）: apps/mobile 変更 PR のみ発行（既存の paths 制限）。EAS ビルド本体（`eas build`)は QA のローカルビルドで代替し、無料枠を温存する
