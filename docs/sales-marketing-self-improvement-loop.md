# 営業・マーケティング自己改善ループ 設計メモ（ドラフト）

> ステータス: 設計時スナップショット（構想段階・実装未着手）
> 目的: 開発で運用中の自己改善ループ（Claude 定時コードチェック / Codex GUI チェック / OpenClaw cron 巡回 → GitHub issue 消化）を、
> 営業・マーケティングに拡張するための具体戦略を残す。
> 関連: [`ai-self-improvement-loop.md`](./ai-self-improvement-loop.md)（開発側ループの設計）、
> [`09_product_strategy_notes.md`](./09_product_strategy_notes.md)（GTM 課題）、
> [`pricing-plan-design.md`](./pricing-plan-design.md)（Free / Solo / Expedition）、
> [`lp-soul-page-copy.md`](./lp-soul-page-copy.md)（Soul / 作らないもの）

---

## 0. 写像元: 開発側ループの現状

| 段階 | 開発側の実装 |
|---|---|
| Sense（検知） | Claude スケジュール機能で毎日 3 時にコードチェック（backend 観点）/ Codex の Computer use + スケジュール機能で GUI チェック（frontend / designer 観点） |
| Ledger（台帳） | 検知した不具合・懸念点を GitHub issue に記録 |
| Dispatch（配車） | OpenClaw が cron で issue を巡回し、Codex の残りクレジット量に応じて指示を出す |
| Act（実行） | Codex が修正を実装し PR |
| Gate（審査） | 人間（committer）が merge |

このループが成立している理由は 3 つ:

1. **変更対象がすべてリポジトリ内にある**（コードを直せば直る）
2. **台帳が GitHub issue で一元化されている**（透明・監査可能・AI が読める）
3. **最終ゲートが人間の merge に固定されている**（AI は提案と実装まで）

営業・マーケティングでも**この 3 条件を先に成立させる**ことが戦略の核になる。
逆に言うと、外部の広告管理画面やメール配信ツールの中に文言・設定が住んでいる限り、このループは適用できない。

---

## 1. 基本方針 — 5 原則

### 1-1. Marketing-as-Code

LP コピー・広告文言・入札設定・SEO 記事・実験定義を、**すべてリポジトリ内のファイル**として管理する。

- LP は既に `apps/web/public/lp/index.html` としてコードである（→ そのまま PR ループに乗る）
- 広告は `marketing/ads/*.yaml` に campaign / 広告グループ / 文言バリアント / 入札上限を宣言し、
  merge 時に GitHub Actions が広告プラットフォーム API（Google Ads API 等）へ同期する（Terraform 的な宣言同期）
- AI に広告管理画面を直接操作させない。**AI が触れるのはリポジトリ内のファイルだけ**、外界への反映は人間の merge を通過した後に機械的に行う

これにより「広告文言の変更」が「コードの変更」と同じ形（issue → PR → 人間 merge → 自動反映）になり、
開発側のループ（OpenClaw 巡回・Codex 実装）を**ラベルを増やすだけで流用**できる。

### 1-2. 台帳は GitHub issue（実験カード）

マーケ施策は「タスク」ではなく**「実験」**として issue 化する（§7 テンプレート）。
仮説・変更内容・主要指標・停止条件を必ず持たせ、結果を issue に追記して close する。
却下した実験も理由付きで残す（開発ループの `soul:reject` と同じ思想）。

### 1-3. Soul ゲートをマーケにも通す

Cairn は「作らないもの」を公開するプロダクトである以上、**マーケも同じ基準で審査**されなければ看板倒れになる。
`soul.policy.yaml` の姉妹ファイルとして `marketing.policy.yaml`（§5）を置き、
すべての実験カードをルールベース + LLM 裁判官の 2 段ゲートに通す。

特に重要なのは **「実装と乖離した約束の禁止」**。
[`09_product_strategy_notes.md`](./09_product_strategy_notes.md) が指摘する LP と実装のギャップ
（`docker compose up` / Bring Your Own AI / Try Demo が未実装）は、広告を出した瞬間に「嘘広告」へ格上げされる。
このギャップの解消を**広告出稿の前提条件**とする（§9 Phase 0）。

### 1-4. 金が動く操作は人間ゲート + コード化された上限

- 月間予算上限・キャンペーン別上限を `marketing.policy.yaml` に定数として置き、同期 Action が超過をブロックする
- **文言・クリエイティブの変更**は AI の PR で回してよい（M1）が、**予算・入札上限・新チャネルの追加**は人間しか merge できない（M2、CODEOWNERS で強制）

### 1-5. 計測は集約ファネルのみ、個人を追わない

開発側 PostHog の方針（集約のみ / 個人を追わない / 透明・オプトイン）をそのまま踏襲する。
見るのは「どの文言のクリック率が高いか」「どの画面で離脱が多いか」であって、「誰が」ではない。
営業リード（§4-5）も **ワークスペース単位の集約シグナル**のみを扱い、WS 内の個人の行動は見ない。

---

## 2. ファネルと KPI

```text
Impression（広告・検索・SNS・GitHub）
   ↓ CTR
LP 訪問（/lp, /lp/soul）
   ↓ LP CVR
興味アクション（Try Demo / GitHub Star / ドキュメント閲覧）
   ↓
サインアップ → WS 作成
   ↓ Activation
アクティベート WS（メンバー 2 人以上 + プロジェクト 1 件 + チャット投稿あり）
   ↓
継続 WS（週次で活動が続く）
   ├─→ Solo 課金（石を積む）
   └─→ 団体・法人シグナル → Expedition / FDE 商談
```

- **北極星指標: 「アクティベートされ、活動を続けている WS 数」**
- エンゲージメント系指標（滞在時間・セッション数・DAU 最大化）は Soul の non-goal（`maximize_engagement`）に該当するため**採用しない**。指標設計自体を Soul ゲートに通す
- 各段の接続は UTM 規約（`utm_source` / `utm_campaign` = 実験カード issue 番号）で追う。実験 → 数字が issue 番号で機械的に突合できる

---

## 3. 全体アーキテクチャ

```text
[Sense: コネクタ群（読み取り専用）]
  PostHog（LPファネル・集約のみ）
  Google Ads API（imp/CTR/CVR/CPA レポート）
  Google Search Console API（検索クエリ・掲載順位）
  GitHub API（Star・Traffic・clone 数）
  ソーシャル検索（X / Reddit / Hacker News の言及）
        │
        ▼ 毎日 6:00（開発の 3:00 チェックと同じ Claude スケジュール機能）
[Growth Analyst ジョブ（Claude）]
  日次メトリクス取得 → 異常・機会の検知 → 実験カード draft issue 作成
  （重複統合・根拠リンク付与は開発側 Triage Agent と同一の作法）
        │
        ▼
[ゲート（2段）]
  ルールベース: marketing.policy.yaml（禁止クレーム・禁止手法・予算上限）
  LLM 裁判官: グレー案件のみ SOUL.md に照らして判定
  → soul:ok なら label: ready-for-ai（M0/M1）/ needs-human（M2）
        │
        ▼
[Dispatch（既存 OpenClaw cron を流用）]
  area:marketing ラベルの issue を巡回
  Codex の残りクレジット量 + 当月の残り広告予算を見て配車
        │
        ▼
[Act]
  M0/M1: Codex が PR（LPコピー・広告文言 yaml・記事 markdown）
  M2:    人間が判断（予算変更・新チャネル・営業接触）
        │
        ▼
[Gate] 人間が merge（予算系は CODEOWNERS 必須レビュー）
        │
        ▼
[反映（機械的）]
  LP・記事 → Vercel 自動デプロイ
  marketing/ads/*.yaml → GitHub Actions が広告 API へ宣言同期
        │
        ▼
[Learn]
  実験カードに結果を追記して close
  勝ちパターンを marketing-playbook（§8）へ蓄積
  過去実験の採否・効果を Growth Analyst の few-shot に還流
```

新規に作るのは **コネクタ（読み取り）/ Growth Analyst のプロンプト / marketing.policy.yaml / ads 同期 Action** の 4 点のみ。
台帳・配車・実装・審査は開発ループの既存機構をそのまま使う。

---

## 4. 具体ループ 5 本

### 4-1. LP コピー PDCA（最初に回す・リスク最小）

> 例: 「Hero コピー A/B の敗者を毎週入れ替える PDCA を、**PostHog の集約ファネル**と **LP-as-Code + Codex PR** の仕組みで自動化する」

- **Plan**: Growth Analyst が毎朝 PostHog のファネル（LP 訪問 → CTA クリック → サインアップ）を取得。
  セクション別の離脱・CTA 別クリック率を見て「Hero コピーを B 案（`More exploration. Less management.`）に差し替えるとどうか」等の実験カードを起票
- **Do**: Codex が `apps/web/public/lp/index.html` のコピーを変更する PR を作成（PostHog の Experiment 機能でバリアント割付。LP は静的 HTML なので、初期は「週替わりで差し替えて前週比較」の逐次テストでも可）
- **Check**: 実験カードに定めた最小サンプル・停止条件に達したら、Growth Analyst が結果を issue に追記
- **Act**: 勝者を本採用する PR / 敗者アーカイブ。学びを playbook へ
- **ゲート**: 文言変更は M1。ただし `/lp/soul`（Soul ページ）と料金・機能の事実主張に触れる変更は M2（§5 forbidden_zones）

完全にリポジトリ内で完結し、費用ゼロ・既存ループそのままなので、**ここでループの動作実績を作ってから広告に進む**。

### 4-2. 検索連動広告 PDCA（Ads-as-Code）

> 例: 「**Backlog / Slack / Notion / Asana の比較・乗り換え検索ワード**に広告を出し、クリック率を見て広告文言や LP 内容を変える PDCA を、**Google Ads API への宣言同期（Ads-as-Code + GitHub Actions）** と **Claude 日次レポートジョブ → Codex 文言 PR** の仕組みで自動化する」

- **対象キーワード**（初期案・すべて「乗り換え・代替・比較」意図）:
  - `Backlog 代わり` `Backlog 無料 代替` `Backlog 高い`
  - `Slack プロジェクト管理 連携` `Slack タスク管理 無料`
  - `Notion プロジェクト管理 チーム` `Asana 無料 制限`
  - `プロジェクト管理 OSS セルフホスト` `サークル タスク管理 無料`（山岳部・学生団体ビーチヘッド向け）
- **Do**: `marketing/ads/search-jp.yaml` にキャンペーン・広告グループ・文言バリアント・LP 遷移先（UTM = issue 番号）・日予算を宣言。
  merge されると GitHub Actions が Google Ads API に同期（作成・更新・停止をすべて宣言差分で実行）
- **Check**: Growth Analyst が毎朝 Ads API のレポート（imp / CTR / CVR / CPA）をキーワード×文言粒度で取得し、日次サマリを issue にコメント。
  「CTR が広告グループ中央値の半分未満 × 7日」等のルールで敗者文言を検知
- **Act**: 敗者文言の改稿 PR を Codex が作成（M1）。**入札・日予算の変更、キーワード追加は M2**（人間 merge のみ）
- **ガード**:
  - `budget.monthly_cap_jpy` を超える宣言は同期 Action が CI で fail させる（コードで上限を強制）
  - 競合名をキーワードにするのは可、**広告文言中での競合中傷・虚偽比較は policy で禁止**
  - LP と広告文言の主張が一致しているかを Implementation ゲート（PR CI）で LLM チェック（「広告は Self-Hosted を謳うが LP から消えている」等のドリフト検知）

### 4-3. SEO・比較コンテンツ PDCA

> 例: 「Search Console の**取りこぼしクエリ**（表示はあるが CTR が低い / 11〜30 位のクエリ）を毎週検出し、**比較記事・ドキュメントの新規執筆/改稿を Codex の PR** で行い、順位・CTR の変化で評価する」

- **Plan**: Growth Analyst が週次で Search Console API から「インプレッションあり × 順位 11〜30 位」「表示あり × CTR 低」のクエリを抽出し、記事カードを起票
  （例: `Backlog Notion 比較` `プロジェクト管理 自作 サークル` `山行計画書 テンプレート`）
- **Do**: `apps/web/public/docs/`（または将来の公開ドキュメントサイト）配下に markdown で執筆。
  比較記事は「機能表 + 思想の違い（管理ではなく推進）」の構成をテンプレ化し、Codex が下書き PR → 人間が事実確認して merge
- **Check**: 4 週間後に同クエリの順位・CTR を再計測して issue に追記
- **相乗効果**: 09 の GTM 課題 4「公開ドキュメントサイト（日英）」の執筆リソースとしてこのループを使う。ドキュメント整備自体が SEO 施策になる
- **ゲート**: 記事は M0/M1（事実主張のみ人間確認）。「山行計画書テンプレート」のような**実用テンプレ配布記事は、それ自体がリード獲得資産**になる

### 4-4. コミュニティ・ソーシャルリスニング（送信は人間）

- **Sense**: X / Reddit（r/selfhosted, r/opensource）/ Hacker News / Qiita・Zenn での言及、GitHub Star・Traffic の推移を日次取得
- **Plan**: Growth Analyst が週次ダイジェスト issue を作成。「Backlog 値上げで乗り換え先を探すスレッドが立った」等の**機会検知**と、返信ドラフトの添付まで行う
- **Act**: **投稿・返信の送信は必ず人間**（M2）。AI 名義での自動リプライ・ステルスマーケは policy で禁止（`no_astroturfing`）。
  OSS プロジェクトとして「中の人が正直に答える」以外の振る舞いは Soul を毀損する
- **Learn**: 反応の良かった切り口（例: Open Soul Software の思想、セルフホスト、山岳部ユース）を LP・広告コピーの実験候補として 4-1 / 4-2 に還流

### 4-5. 営業ループ（Expedition / FDE リード検知）

Expedition の収益本体は FDE 導入支援・年間サポート（[`pricing-plan-design.md`](./pricing-plan-design.md)）。
売り込み型ではなく**シグナル検知型のインバウンド営業**として設計する。

- **Sense（WS 単位の集約シグナルのみ。個人は見ない）**:
  - WS のメンバー数が閾値（例: 20 人）を超えた
  - ゲスト招待の多用（社外コラボ = 法人利用の兆候）
  - セルフホスト関連の GitHub issue / Discussion / 問い合わせ
  - Team/Expedition 料金ページの閲覧増（集約）
- **Plan**: Growth Analyst が週次で「リードカード」issue を起票（WS 名・シグナル・推奨アプローチ・提案ドラフト添付）
- **Act**: **接触は必ず人間**（M2）。AI が担うのは提案書ドラフト・FAQ 回答案・導入事例資料の生成まで
- **ゲート**: 「アクティブでない WS を放置している」ことを営業シグナルにするような**監視的検知は禁止**。
  拾ってよいのは「拡大・問い合わせ・関心」という前向きシグナルだけ（`soul: help_prepare_not_evaluate` に整合）
- **Learn**: 商談の成否・失注理由を issue に記録し、リードスコアリング・提案テンプレの few-shot に還流

---

## 5. ゲート: `marketing.policy.yaml`（案）

`soul.policy.yaml` と同じ 2 段構成（ルールベース → グレーのみ LLM 裁判官）で運用する。

```yaml
# marketing.policy.yaml
forbidden_claims:            # 事実と異なる・実装と乖離した主張
  - unimplemented_feature_as_shipped   # 未実装機能を実装済みとして謳う（LP/広告/記事すべて）
  - fake_social_proof                  # 架空の導入実績・レビュー
  - false_comparison                   # 競合との虚偽比較

forbidden_tactics:
  - dark_patterns              # 解約困難化・偽カウントダウン・偽在庫
  - engagement_bait            # 通知やメールで滞在を煽る（Soul の non-goal と同根）
  - astroturfing               # AI・匿名アカウントによるステマ投稿
  - competitor_disparagement   # 競合中傷（比較は事実ベースのみ可）
  - surveillance_based_sales   # 個人・非アクティブ検知を営業シグナルに使う

budget:
  monthly_cap_jpy: 50000       # 全チャネル合計の月間上限（CI で強制）
  per_campaign_cap_jpy: 20000
  change_requires: human       # 上限・入札・日予算の変更は M2

forbidden_zones:               # AI 自動変更を禁止する領域（人間設計必須）
  - "apps/web/public/lp/**soul**"   # Soul ページ（魂のコピーを AI に書き換えさせない）
  - "marketing/ads/**/budget*"      # 予算・入札
  - pricing_claims                  # 料金・プラン内容の主張
  - legal_claims                    # 特商法・プライバシー関連の記載
```

### 承認マトリクス（開発側 L0/L1/L2 の写像）

| レベル | 内容 | 例 | ゲート |
|---|---|---|---|
| **M0** | 計測・レポート・下書き | 日次ダイジェスト、記事ドラフト、返信案 | 自動（issue コメントまで） |
| **M1** | 公開コンテンツの文言変更 | LP コピー、広告文言、SEO 記事、OGP | AI PR 可・人間 merge |
| **M2** | 金・対外送信・思想 | 予算/入札、新チャネル出稿、SNS 投稿・営業メール送信、Soul ページ・料金主張 | 人間のみ（CODEOWNERS 強制） |

---

## 6. 役割分担 — 開発ループとの対応

| 役割 | 開発ループ | 営業・マーケループ |
|---|---|---|
| 定時チェック（分析屋） | Claude 毎日 3 時コードチェック | **Claude 毎日 6 時 Growth Analyst**（メトリクス取得・異常検知・実験カード起票）+ 週次実験レビュー |
| 実装屋（クリエイティブ） | Codex（GUI チェック + issue 消化） | **Codex**（LP コピー・広告文言 yaml・記事の PR。designer 観点はバナー・OGP のクリエイティブチェックに転用） |
| 配車 | OpenClaw cron（Codex 残クレジット考慮） | **同じ OpenClaw cron** に `area:marketing` を追加。残クレジットに加えて**当月の残り広告予算**も配車判断に入れる |
| 最終ゲート | committer が merge | **人間 = 予算とブランドの守護者**（M2 は人間のみ、M1 も merge は人間） |
| 台帳 | GitHub issue | 同じリポジトリの GitHub issue（`area:marketing` + 実験カードテンプレ） |

### issue ラベル体系（開発側の拡張）

```text
area:    marketing / sales
loop:    lp / ads / seo / community / leads     （§4 の 5 本に対応）
level:   M0 / M1 / M2
soul:    pending / ok / reject
state:   triage / ready-for-ai / running / measuring / done
```

---

## 7. 実験カード（issue テンプレート案）

`.github/ISSUE_TEMPLATE/marketing-experiment.md` として定義する。

```md
## 仮説
Backlog 乗り換え検索層には「無料・メンバー無制限」より「監視しない PM ツール」の方が刺さる

## 変更内容
広告グループ backlog-alt の見出しバリアント C を追加（M1）

## 主要指標と現状値
CTR 1.8%（グループ中央値）→ 目標 2.5%

## 最小サンプル / 停止条件
バリアントあたり 1,000 imp、または 14 日で打ち切り

## 予算影響
なし（既存日予算内） → M1

## Soul チェック
- [ ] 実装済み機能のみを主張している
- [ ] 競合への言及は事実ベースの比較のみ
- [ ] エンゲージメント煽り・ダークパターンなし
```

---

## 8. Learn — マーケ版 Eval ハーネス

- 実験カードの `仮説 → 結果 → 採否` を蓄積し、Growth Analyst の起票プロンプトの few-shot に使う
  （「この組織で過去に効いた訴求 / 却下された訴求」= 開発ループの嗜好データと同型）
- 勝ちパターンは `docs/marketing-playbook.md`（将来作成）に昇華する。playbook 自体も L0 コンテンツとして AI が改稿 PR できる
- **回帰テスト**: 過去の `soul:reject` 事例（例: 偽緊急性のある文言案）を正解ラベルに、policy 変更時に「却下すべきものを却下できるか」を CI で検証する
- Open Soul Software として、`marketing.policy.yaml` と実験台帳を**公開**する。
  「広告の PDCA まで issue で公開している OSS」自体が最大の差別化コンテンツになり得る（Hacker News / Zenn で1本書ける題材）

---

## 9. 段階的ロールアウト

| Phase | 内容 | 前提・判断基準 |
|---|---|---|
| **0** | **LP の約束と実装のギャップ解消**（Try Demo 実体・セルフホスト表記の是正 or 実装・BYO AI 表記の是正）+ 特商法/プライバシーポリシー整備 | 広告出稿の前提条件。ギャップを残したまま集客すると信頼を失う（09 §1 の指摘） |
| **1** | **計測基盤**: PostHog ファネル定義・UTM 規約（= issue 番号）・Search Console / GitHub Traffic 接続 | 数字が取れないうちは PDCA が回らない |
| **2** | **レポートのみのループ**: Growth Analyst 日次ジョブ + 週次ダイジェスト issue（金を使わない・M0 のみ） | ここで「起票の質」を人間が 2〜4 週間評価し、プロンプトを調整 |
| **3** | **LP コピー PDCA**（§4-1）: リポジトリ内で完結する M1 ループの実績づくり | Phase 2 の起票が有用と判断できたら |
| **4** | **Ads-as-Code**（§4-2）: 少額上限（例: 月 3〜5 万円）で検索連動広告を開始 | Phase 0 完了 + LP CVR のベースラインが取れていること |
| **5** | **SEO / コミュニティ / 営業リード**（§4-3〜4-5）を順次追加 | 公開ドキュメントサイトの立ち上げと同時進行 |

---

## 10. 未決事項（次に決めること）

- (a) 広告予算の上限額と出稿チャネルの優先順位（Google 検索のみで開始か、X 広告も含めるか）
- (b) A/B 配信の実装方式: PostHog Experiments を使うか、静的 LP のまま週替わり逐次テストで始めるか
- (c) `marketing/` ディレクトリをこのリポジトリに置くか、別リポジトリ（公開範囲を分ける）にするか
  — Open Soul 的には同居・公開が望ましいが、広告 API の認証情報管理と要相談
- (d) Growth Analyst の実行基盤: 開発チェックと同じ Claude スケジュール機能か、Inngest cron（アプリ側）か
  — 外部 API 読み取りが主なので Claude スケジュール + MCP コネクタが第一候補
- (e) ソーシャルリスニングのデータ取得方法（X API の費用対効果、Reddit / HN は RSS で足りるか）
- (f) 実験カードテンプレ・ラベルの `.github/` への定義（開発側 §10-(a) と同時に整備）
