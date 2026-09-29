# AI 自己改善ループ 設計メモ（ドラフト）

> ステータス: 設計時スナップショット（実装前の合意メモ）
> 目的: 「改善提案を集め → GitHub issue 化 → AI が実装し PR → SOUL 審査 → 人間が merge」という
> 自己改善ループを、Cairn の Soul（人を管理しない / 推進する）を壊さずに回すための設計を残す。
> 関連: [`docs/lp-soul-page-copy.md`](lp-soul-page-copy.md)（Open Soul Software / SOUL.md のコピー案）
>
> 前提スタック: Next.js 15 / Supabase(PostgreSQL + pgvector) / Inngest / Vercel AI SDK(OpenAI) / GitHub。

---

## 0. 基本方針

- **GitHub issue を「提案台帳(ledger)」の中心に置く**。透明・監査可能・Fork 可能（OSS / Open Soul 的）。
- AI は**提案と実装案までを担い、最終判断（却下・merge）は人間**が行う（人間が「思想の守護者」）。
- **SOUL.md / `soul.policy.yaml` が機械可読のガードレール**。「何を作らないか」をパイプラインに埋め込む。
- データは「監視」ではなく「障壁検知」に限定する。収集しない自由を最優先のゲートにする。

---

## 1. 全体フロー

```text
[intake]      改善提案ch 発言  ──┐
              PostHog シグナル ──┴─▶ Triage Agent
                                      │（重複統合・ノイズ除去・根拠リンク付与）
                                      ▼
                                draft issue 作成
                                      │
                                ┌─────┴──────┐
                          soul:reject     soul:ok
                          （理由を残す）       │
                                            label: ready-for-ai
                                                  │
                                          Builder Agent（OpenClaw的）
                                          ブランチ + PR + soul-check コメント
                                                  │
                                          committer がレビュー & merge
                                                  │
                                          issue close → 提案者へ還元
```

ループ全体は **Sense → Recall → Reason → Gate → Act → Learn** の 6 段で捉える。

---

## 2. 入口（intake）— 2 系統

### 2-1. 改善提案チャンネル（定性）

- LP（`/lp` または Soul ページ）から Cairn Cloud の「改善提案」チャンネルへ誘導。
- ユーザーの発言を拾い、Triage Agent へ。
- 生発言はそのまま issue にせず、**重複統合・ノイズ除去・根拠リンク付与**を経てから draft issue にする。

### 2-2. PostHog シグナル（定量）★Soul との整合に注意

- 目的は **「プロダクト自身の UX 摩擦検知」**であって、ユーザー監視ではない。
- 厳守する条件:
  - **集約のみ / 個人を追わない**（「この画面で離脱が多い」はOK、「ユーザー X が詰まった」はNG）。
  - **顧客ワークスペース内の個人は覗かない**。見るのは "Cairn というプロダクトの摩擦" であって、顧客組織のメンバーの動きではない。
  - 対象は **「探究者の障壁」**（例: この操作に 3 クリック必要 / ここで戻る人が多い）。これは「障壁を減らす」Soul に合致する。
  - **透明・オプトイン**。何を計測しているか公開する。
- issue 化の際に `source: posthog` を付け、triage で必ず「UX 摩擦か / 人の監視か」を Soul ゲートに通す。

### 2-3. 定量×定性の突き合わせ

- PostHog の定量だけだと潜在ニーズを誤読しがち。
- 「離脱の多い画面（定量）」＋「使いにくいという発言（定性）」が一致したら確度が高い issue として優先する。

---

## 3. Triage Agent（提案 → issue）

- 役割: intake シグナルを正規化し、重複をまとめ、根拠リンクを付けて draft issue を作る。
- 各 issue に Intent ゲート（後述）を通し、`soul:ok` / `soul:reject` を付与。
- **却下も issue として残す**（「なぜ作らなかったか」は資産・透明性）。

### issue ライフサイクル（ラベル）

```text
source: channel / posthog
level:  L0(コンテンツ) / L1(設定) / L2(コード)
soul:   pending / ok / reject
state:  triage / ready-for-ai / in-pr / done
```

提案レベルの定義:

- **L0 コンテンツ**: テンプレ・ドキュメント・チェックリスト改善（リスク低・即実行可）
- **L1 設定/自動化**: フォーム項目・リマインド・AI プロンプト調整（no-code）
- **L2 コード**: 実際の機能変更（PR・人間レビュー必須）

> 重要: **issue 作成 ≠ 即実装**。`ready-for-ai` が付いた issue だけ Builder Agent が拾う。
> 全 issue を自動 PR 化するとノイズと Soul 違反が PR レイヤーまで漏れる。

---

## 4. SOUL 審査は 2 段で置く

性質の違う審査を分離する。

### 4-1. Intent ゲート（issue triage 時）★主役

- 問い:「これは作るべきか？＝思想に反しないか？」
- 例: 「活動量ランキングが欲しい」→ `soul:reject` + 理由。
- 「何を作らないか」を体現する場所。却下理由を必ず残す。
- 実装は 2 段で堅くする:
  1. **ルールベース**: 提案メタが `non_goals` に該当したら即却下（決定論的・監査可能）。
  2. **LLM 裁判官**: グレー案件のみ SOUL 全文に照らして「適合 / 要修正 / 却下」+理由。

### 4-2. Implementation ゲート（PR の CI 時）

- 問い:「実装が non-goals を混入していないか？＝ドリフト検知」
- 例: ある機能 PR が、ついでに個人別の稼働ログ収集を足していないか。
- `soul.policy.yaml` をルールベースで CI チェック。LLM 裁判官はグレーのみ。
- 位置づけは「最後の防波堤」。主審査は 4-1。

### `soul.policy.yaml`（案）

```yaml
# soul.policy.yaml
non_goals:
  - rank_individuals          # 個人のランク付け
  - track_attendance_for_management
  - productivity_score
  - maximize_engagement
  - surveillance_dashboard
principles:
  - optimize_for_action_not_control
  - help_prepare_not_evaluate
  - reduce_barriers_to_exploration
forbidden_zones:              # AI 自動変更を禁止する領域
  - soul/**                   # 魂そのもの
  - "**/permissions.ts"       # 権限
  - billing/**                # 課金
  - supabase/migrations/**    # DB schema
```

---

## 5. Builder Agent（OpenClaw 的）— 自動 PR の安全設計

- 対象は `ready-for-ai` ラベルの issue のみを巡回（GitHub Action / Inngest cron）。
- ブランチ + PR を生成し、**soul-check 結果を PR コメント**として残す。
- **禁止ゾーン**（人間設計必須・AI 自動変更不可）:
  - `soul.policy.yaml` / SOUL.md 系（魂を AI に書き換えさせない）
  - 認証 / 権限（`apps/web/src/lib/permissions.ts`）/ 課金 / マイグレーション
- **許可ゾーン**: コピー・テンプレ・UI 文言・軽微なコンポーネント・ドキュメント等（L0/L1 中心）。
- PR には必ず: 元 issue リンク / 根拠（channel・PostHog）/ soul-check 結果 / 期待効果。
- **merge は committer（人間）**。ここが最終ゲート。
- リポジトリの `AGENTS.md` / `CLAUDE.md` が Builder への憲法として効く（製品の Soul と開発の Soul が同じ系譜）。

---

## 6. ループを閉じる（還元）

- merge したら issue を close し、**提案者のチャンネル発言に AI が返信**する。

```text
あなたの提案「計画書テンプレに落石リスク欄を追加」を反映しました → PR #123
```

- 「あなたの一言がプロダクトを前に進めた」という GitHub 的な参加感。監視ツールでは出ない体験。

---

## 7. Learn（AI 自身の自己改善）

- `提案 → 採用/却下/修正 → 効果` を保存すると、その組織の Soul に合う/合わない提案の嗜好データになる。
- **Eval ハーネス**: 過去の採否を正解ラベルに、プロンプト/検索変更の回帰テストを CI に載せる（「却下すべきを却下できるか」）。
- 改善手段（軽い順）: Retrieval 改善 → プロンプト/ポリシー調整 → 裁判官モデルの few-shot をその組織の過去却下例で構成 → 必要なら preference データで軽い fine-tune。
- 効果指標は **プロジェクト推進の指標**に限定し、人の評価指標にしない（指標設計にも Soul ゲートを効かせる）。

---

## 8. 安全・ガバナンス

- **収集しない自由**: 監視系シグナルはデータ層で最初から取らない（最強のガードレール）。
- **すべて提案・実行は承認制**: AI は自律実行しない。
- **監査ログ**: 提案・却下・適用・効果をすべて追跡可能に。
- **SOUL のバージョン管理**: Soul が変われば判断基準も変わる。Soul の変更履歴自体を残す。
- **Fork 可能**: Soul も提案ルールも公開・Fork 可能にすると Open Soul Software になる。

---

## 9. 最小実装（PoC）

1. `soul.policy.yaml`（non_goals + principles + forbidden_zones）をリポジトリに置く。
2. Inngest cron で、直近の改善提案チャンネル発言を拾い、Triage Agent で draft issue を 1 件生成（`source: channel`）。
3. Intent ゲート（ルールベース）を通し `soul:ok/reject` を付与。`ready-for-ai` まで進める。
4. Builder Agent が 1 件だけ L0 提案を PR 化（禁止ゾーン外）。soul-check を PR コメントに。
5. committer が merge → issue close → 提案者へ返信。
6. 採否を保存し、Learn の起点にする。
7. （次段）PostHog の集約摩擦シグナルを `source: posthog` として intake に追加。

既存スタック（Inngest / pgvector / AI SDK / GitHub）だけで完結し、「監視しない・提案のみ・却下を残す・merge は人間」という Soul をそのまま検証できる。

---

## 10. 次に具体化する候補

- (a) issue ライフサイクルのラベル/テンプレを `.github/` に定義
- (b) `soul.policy.yaml` スキーマ確定（non_goals / principles / forbidden_zones）
- (c) Triage Agent のプロンプト（channel × PostHog の突き合わせ）
