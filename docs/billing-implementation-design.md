# 課金実装設計書

> **ステータス**: Phase 1/2 実装済み（作成: 2026-06-12 / 改訂: 2026-08-05）
> [`pricing-plan-design.md`](./pricing-plan-design.md) のケルン消費モデルを実装に落とすための設計。関連: [`10_ai_member_design.md`](./10_ai_member_design.md)（AIサーフェスの境界）、[`ai-pmo-design.md`](./ai-pmo-design.md)（受動AIの現行仕様）

---

## 1. スコープと方針

- **対象は Free + Solo のみ**（ロールアウト順序に従う）。Team / Expedition は引き合いが出てから設計する
- 決済は **Stripe・Web のみ**（IAP なし。アプリはリンクアウト）
- **OSS 原則との両立**: 課金コードは OSS リポジトリに含める。ただし Stripe 環境変数が未設定の場合（セルフホスト）は課金機構が無効になり、**全エンタイトルメントが無制限（Expedition 相当）として解決される**。石・ケルン・風化の機構ごと無効化する
- 課金有効判定は `STRIPE_SECRET_KEY` の有無による単一フラグ（`isBillingEnabled()`）とし、機能ごとのフラグを散在させない
- **ブランド名（石 / ケルン / Solo 等）はスキーマ・コード識別子に入れない**。ブランド改名に耐えるよう、DB・コードでは `credit`・`subscription`・`plan` など中立な語を使う。「石 / ケルン」は UI 文言（i18n 層）にのみ存在させる。本書では可読性のため UI 名を併記するが、識別子は中立語が正

## 2. モデルの骨格: 石 = 消費型クレジット

石はケルン（= ワークスペースのクレジット残高）に積まれ、消費で減る。**コードでは「クレジット（credit）」が単位**。

- **供給**: Solo / Team 購読の月次付与、トップアップ（単発購入）。失効しない
- **消費**:
  - **AI 能動利用** = 都度消費（フロー型コスト）
  - **ストレージ保有** = 家賃として定期消費（ストック型コスト。保有バイト数 × 家賃レート × 経過期間）
- **残高（ケルンの高さ）= `SUM(credit_ledger.delta)`**。0 以下で「風化」状態
- **権利と恩恵の分離**:
  - **能動権（本人帰属）**: オリジナル/動画/大容量のアップロード、AI への能動依頼 → アクティブな支援者（Solo 本人 / Team の全員）のみ
  - **受動恩恵（WS 帰属）**: 圧縮版の閲覧・DL、Heartbeat の AI 指摘 → ケルンに残高があれば全メンバー。原資はケルン

## 3. 課金ポイントと執行ポイント

| 課金ポイント | Free | 支援者（Solo本人 / Team全員） | 執行ポイント（実コード） |
|---|---|---|---|
| 画像 | 自動圧縮版のみ（長辺2048px・品質80目安、〜500KB。EXIF の撮影日時・GPS は保持） | オリジナル保存可（閲覧は全員） | gallery / attachments 系 + クライアント側圧縮 |
| 文書等のファイル | 5MB/ファイル | 上限緩和（値は未決） | files / attachments 系 |
| 動画 | 不可 | 可（閲覧は全員） | gallery 系（MIME 判定） |
| チャット添付の音声・動画・ZIP | 不可（現状 MIME whitelist 自体が非対応） | `resolveUploadRights` 実装後に開放予定（本人帰属の能動権として扱う） | attachments 系（`upload/route.ts`） |
| ストレージ保有 | 10GB まで | ケルンの石が家賃を払える限り | 家賃 cron（→ §6） |
| AI 能動利用 | お試しぶんのみ | 石を消費 | AI メッセージ生成 API |
| AI 受動利用（AI PMO） | ケルンに残高があれば受信 | 受信 | AI PMO Phase 1/2（→ `ai-pmo-design.md`） |

画像の自動圧縮は**アップロード前のクライアントサイド圧縮**を基本とする（ingress 帯域と処理コストの節約。`process-image.ts` の EXIF 抽出と統合）。圧縮で撮影日時・GPS を失わないこと（ギャラリーの地図・タイムライン機能の前提）。**すべてのオリジナルに表示用の圧縮派生を持たせる**（サムネイル兼、風化時のフォールバック配信に使う）。

アップロード系の執行ポイント:

- `apps/web/src/app/api/attachments/upload/route.ts` — チャット添付
- `apps/web/src/app/api/projects/[id]/files/route.ts` / `api/files/route.ts` — ファイル
- `apps/web/src/app/api/projects/[id]/gallery/route.ts` / `api/gallery/route.ts` — ギャラリー

チャット添付の音声・動画・ZIP は、原価（ストレージ・egress）が画像・文書より大きく無料開放しづらいため、`resolveUploadRights` によるアップロード権判定が実装されるまでは `upload/route.ts` の MIME whitelist で一律非対応としている。課金導入後は「支援者本人のみアップロード可」の能動権対象として開放する想定（対応MIMEタイプ・サイズ上限は未決）。

アバター・ワークスペースロゴ・カバー写真（`me/avatar`, `workspaces/logo`, `workspaces/cover-photos`）は**家賃対象外**（サイズ上限の個別チェックのみ。プロフィール設定が課金で詰まる体験を避けるため）。

AI能動利用の執行ポイントは `apps/web/src/app/api/ai/conversations/[id]/messages/route.ts`。依頼前にクレジットを予約し、応答保存と同じトランザクションで消費を確定する。AI PMOは Inngest と `apps/web/src/lib/ai-nudges/` の別経路で配信予算を確認し、Phase 1/2 ともナッジ配信時に消費を記帳する。将来のAIメンバーも発話経路は別になり得るが、残高解決と台帳記帳の共通サービスを利用する。

## 4. データモデル（`packages/db/src/schema/billing.ts` 新設）

```
billing_customers          Stripe 顧客の対応表
  user_id        PK → profiles.id
  stripe_customer_id  unique

subscriptions              支援サブスクリプション（UI: 積み石 / Solo・Team）
  id             PK
  workspace_id   → workspaces.id (cascade)
  supporter_user_id → profiles.id        ※ WS 退会後も継続可（OB積み石）
  plan           enum: individual / workspace  ※ UI 表示は Solo / Team
  stripe_subscription_id  unique
  quantity       int                     ※ 重ね掛け口数（Solo）
  status         enum: active / past_due / canceled
  current_period_end  timestamptz

credit_ledger              クレジット（石）台帳。残高 = SUM(delta)
  id             PK
  workspace_id   → workspaces.id (cascade)
  delta          int（付与は正・消費は負）
  reason         enum: subscription_grant / pack_purchase / ai_consumption / storage_rent / adjustment
  ref_id         text（AI消費なら ai_messages.id、購入なら Stripe id、家賃なら期間キー）
  created_at     index (workspace_id, created_at)

workspace_storage_usage    ストレージ使用量カウンタ（家賃計算の入力）
  workspace_id   PK → workspaces.id (cascade)
  original_bytes bigint                  ※ 家賃対象（オリジナル）
  derived_bytes  bigint                  ※ 圧縮派生。実質無料・家賃対象外
  updated_at
  last_rent_at   timestamptz             ※ 最後に家賃を引いた時点

stripe_events              Webhook 冪等性
  event_id       PK（Stripe event id）
  processed_at
```

設計判断:

- **台帳（ledger）方式**。残高カラムの直接更新は競合・監査の両面で不利。残高は `SUM(delta)`（行数が増えたら期末スナップショット行で圧縮）。**石が AI とストレージ家賃の両方をまかなう単一通貨**なので、台帳は1本に統一する（旧 `ai_credit_ledger` を一般化）
- **使用量の算出は段階を分ける**。最終形（Phase 1 以降）はカウンタ方式 — アップロード時の enforcement がホットパスに乗るため、都度 `SUM(file_size)` を避け、アップロード/削除で増減し、乖離検出用の reconciliation を用意し、家賃対象の `original_bytes` と対象外の `derived_bytes` を分けて持つ。**ただし Phase 0（計測）ではカウンタを持たず、`SUM(files.file_size)` の都度集約で算出する**。計測フェーズはホットパスが無く集約1発で足り、逆にカウンタは CASCADE 削除（プロジェクト削除等）でドリフトして計測値を静かに壊す。カウンタと reconciliation は enforcement と同時に Phase 1 でトランザクション込みで正しく導入する
- **貢献の記録**: 「誰がいつ石を積んだか」は `subscriptions` + `credit_ledger(reason=subscription_grant/pack_purchase)` から導出できる。ケルン UI の礎石・タイムライン（永続表示）はこのクエリ。専用テーブルは当面不要
- **`files.file_size` は実装済み**（`gallery_items.fileId` → `files.id` の join で取得可能。当初想定していた `gallery` テーブルへの追加は不要だった）。既存行の NULL は `storage.objects.metadata->>'size'` からのバックフィルで補正する（Phase 0 で実施済み）
- **オリジナル別保存は未実装**: `process-image.ts` はアップロード前にクライアント側でオリジナルを圧縮版へ置き換えており、圧縮前のオリジナルは保存されない。そのため Phase 0 の `original_bytes` は「現状唯一の実体（圧縮後ファイル）」の合計であり、`derived_bytes` は常に 0。真のオリジナル保存・表示用派生の生成は Phase 1 でアップロード権判定と合わせて実装する
- **2026-07-24 の Phase 1 実装**: `billing_customers` / `subscriptions` / `credit_ledger` / `stripe_events` / `workspace_storage_usage` を追加した。Stripe Checkout・Webhook・クレジット台帳・ストレージ家賃 cron・日次 reconciliation・アップロード執行・風化時の圧縮版フォールバックを実装済み。使用量カウンタはアップロード/削除で更新し、CASCADE 等の経路は reconciliation で補正する
- **2026-07-25 の Phase 2 実装**: 能動AIは支援者かつ funded のワークスペースだけが利用し、応答保存と同一トランザクションで `ai_consumption` を記帳する。単発クレジットパックは `mode=payment` のCheckoutとWebhookで `pack_purchase` を記帳する。AI PMOのHeartbeatは funded のワークスペースだけで巡回・配信し、配信ごとに `ai_consumption` を記帳する

## 5. エンタイトルメント解決

`packages/core` に純粋関数として置く（DB・Stripe 非依存、テスト容易）:

```ts
// 残高と保有から WS の状態を解決
resolveWorkspaceState(creditBalance: number, billingEnabled: boolean): WorkspaceState
// billingEnabled=false → 無制限（Expedition 相当）
// creditBalance > 0 → funded（受動恩恵 = 閲覧・Heartbeat が全員に有効）
// creditBalance <= 0 → weathered（風化。Free 相当に戻る）

// アップロード権（本人帰属）
resolveUploadRights(isActiveSupporter: boolean, wsFunded: boolean, billingEnabled: boolean)
// isActiveSupporter = アクティブな subscriptions を持つ本人（Team なら全メンバー true）
// オリジナル/動画/大容量を「アップロードできる」= 支援者本人 かつ ケルンが funded
```

- `isActiveSupporter`: Solo は本人のみ、Team は WS 全メンバー true
- 数値定義（10GB / 5MB / 家賃レート / AI 1依頼の消費数）はこの層に集約し、Route Handler に散在させない

### Team プランへの移行動線

Team（WS 定額）は「**全メンバーがオリジナルをアップロードでき、石が潤沢**」なプラン。

- アクティブな Solo の月額合計が Team 価格に近づいた WS に、設定画面で切り替えを提案する
- Team 加入時の既存 Solo の扱い（併存して石を上積みか、停止案内か）は未決（§11）

## 6. 消費の執行

### ストレージ家賃（cron）

- Inngest cron（例: 日次）で各 WS の `original_bytes` から家賃を算出し、`credit_ledger` に `storage_rent`（負）を記帳する。`last_rent_at` からの経過ぶんを日割りで引く
- **家賃レートは実保存原価（¥3.2/GB/月）以上**に設定する（前払いした石をいつ消費しても元が取れる条件 → pricing 原価モデル）
- 残高が 0 以下になったら風化状態へ遷移（§7）

### AI 能動消費

- `/ai` はリクエスト前にクレジットを予約し、応答保存と同一トランザクションで `ai_consumption`（負）を確定する。応答を保存できなかった場合は予約を返金する
- 単位: 「1依頼 / 1配信 = N クレジット」を基本とし、内部でモデル別係数と実測原価へ対応できるようにする。**消費しないもの**: AI PMO Phase 1 のルール巡回、RAG の embedding 検索。**消費するもの**: `/ai` の応答生成、ツール実行、HTMLテンプレート生成、AI PMO Phase 1/2 のナッジ配信
- 初期仮値は能動AI 1依頼・Heartbeat 1配信ともに **10 クレジット**。`packages/core/src/domain/billing-config.ts` の定数だけを参照し、原価計測後に見直す

### アップロード時の判定

- アップロード系 Route Handler は「**本人の権利**（`resolveUploadRights`）」と「**家賃を払える残高があるか**」を判定する
- エラーは出し分ける（CLAUDE.md のエラー表示方針）: 権利なし →「石を積む」導線、ケルン枯渇 → 残高と買い増し導線

## 7. 風化（ケルンが 0）の状態遷移

諸行無常。残高 0 以下で WS は風化状態になり **Free 相当に戻る**。

- 新規のオリジナル/動画アップロードを停止
- **既存オリジナルはロック**するが配信は止めない: **画像は表示用の圧縮派生を返す**（閲覧継続）。動画・文書はプレースホルダ（「現在開けません」+ 再課金導線）
- **消えないもの**: 圧縮派生（永久保存・実質無料）と貢献記録。風化＝データ消失ではなく Free への復帰
- **オリジナルの尻尾処理**: 風化が長期化したオリジナルはコールドストレージへ退避し保存コストを下げる。最終削除は超長期 + 警告の上での最終手段（圧縮派生は残すので「写真が消えた」にはしない）
- 再び石が積まれたら（再購読・トップアップ）funded に戻り、オリジナルのロックを解除する

実装上、風化は残高から導出する状態であり専用フラグは持たない（`resolveWorkspaceState`）。配信層（画像変換 / ダウンロード API）が funded/weathered を見てオリジナルか圧縮派生かを出し分ける。

## 8. Stripe 統合

- **購読（Solo / Team）**: Checkout Session（`mode=subscription`）。Solo は `quantity` で重ね掛け。口数・プラン変更は Customer Portal（proration は Stripe 既定 — 未決で見直し可）
- **石パック（トップアップ）**: Checkout Session（`mode=payment`、使い切り）→ `pack_purchase` で台帳付与
- **Webhook**: `apps/web/src/app/api/billing/webhook/route.ts` 新設
  - `checkout.session.completed` → `subscriptions` 作成 / パック付与
  - `invoice.paid` → 期間更新 + 月次の `subscription_grant` 付与
  - `customer.subscription.updated` / `deleted` → status・quantity・plan 同期
  - 署名検証必須。`stripe_events` による冪等化
- Webhook は Vercel 上で同期処理できる軽さに保つ。重い後続処理は Inngest に流す
- 初期パックは **¥500 / 400 クレジット**。Stripe の単発 Price ID は `STRIPE_CREDIT_PACK_PRICE_ID` に設定する

## 9. packages/core への配置（CQRS 命名）

- ports: `BillingGateway`（Checkout / Portal URL 生成。実装は `apps/web` の Stripe SDK）
- application:
  - `ResolveWorkspaceStateQuery` / `ResolveUploadRightsQuery` — 残高・支援状態から権利を解決（純ロジック）
  - `RecordStorageUsageCommand` — アップロード/削除時のカウンタ増減
  - `ChargeStorageRentCommand` — 家賃の記帳（cron から）
  - `ConsumeCreditsCommand` / `GrantCreditsCommand` — 台帳記帳（AI 消費・付与・パック）
- Stripe 固有の処理（Webhook パース等）は core に持ち込まない

## 10. UI

- 設定 → **ケルン画面**（PC / モバイル両シェル）:
  - ケルンのビジュアル（残高 = 積まれた石、消費 = 風化）、ストレージ使用量、AI 残高
  - 「石を積む」ボタン → Stripe Checkout（外部遷移）。買い増しパックも同画面
  - **貢献の記録**（礎石・タイムライン。風化しても残る。OB積み石）
  - **石を積むミニゲーム**（石の形・バランス）は後載せ。Phase 1 は簡素なビジュアルでよい。ランダム演出（地震・蹴り）は見た目のみで、買った石の残高は壊さない。詳細は [`billing-minigame-design.md`](./billing-minigame-design.md)
- アップロード失敗・AI 残高不足のエラートーストから同画面へ誘導
- モバイルアプリ（Expo）: 課金 UI は出さず Web へリンクアウト（IAP 審査回避）
- セルフホスト（課金無効）ではケルン画面を非表示
- **提示の二面化**: 同一の課金エンジン（石・台帳・家賃）の上に、提示層を2系統用意する。Free/Solo はケルンの世界観（風化・石積み）、Team/Expedition は定額の簡素な提示（Team は付与を潤沢にして風化を体感させない）。詳細は [`pricing-plan-design.md`](./pricing-plan-design.md) の「提示の二面化」

入口は単純に保つ（[`pricing-plan-design.md`](./pricing-plan-design.md) の「採用の入口と複雑さの段階開示」）。Free 利用時は石・ケルン・風化の UI を出さず、容量・AI の限界に触れたときに初めてケルン画面へ誘導する。

## 11. 実装ロードマップ

| Phase | 内容 | 備考 |
|---|---|---|
| **0: 計測**（実装済み） | `files.file_size` の NULL バックフィル、`files(workspace_id)` インデックス、`SUM(file_size)` 集約 API + 使用量メーター表示。**制限はかけない。カウンタは持たない**（→ 設計判断） | 実データで 10GB / 文書5MB / 圧縮パラメータ / 家賃レートの妥当性を検証してから執行する。オリジナル別保存・圧縮派生の生成は行わず、現状唯一の実体（アップロード前クライアント圧縮版）を `original_bytes` として計測する。true オリジナル保存とその差分化、カウンタ + reconciliation は Phase 1 のアップロード権判定・enforcement と合わせて実装する |
| **1: Solo + ストレージ家賃 + 風化**（実装済み） | Stripe 購読・Webhook・クレジット台帳・家賃 cron・アップロード執行・風化時の圧縮版フォールバック・ケルン画面（簡素版） | 課金の基盤とストレージ執行を実装済み |
| **2: AI 消費 + 買い増し**（実装済み） | `/ai` の能動消費記帳・石パック購入・AI PMOの原資化 | AIメンバーを待たず、`/ai` とAI PMOの別経路で実装済み |
| **3: ミニゲーム / Team / Expedition** | ケルン積みミニゲーム、Team プラン、請求書払い・SSO・監査ログ | 引き合い・余力が出てから |

## 12. 未決事項

- クレジット単価・月次付与数・家賃レート（石/GB/月）・AI 1依頼あたりの消費数の本決定（現時点は `BILLING_CONFIG` の初期仮値。原価シミュレーション要）
- AI 天井の見せ方（減る残高 or 毎月リセットの上限。後者推奨）
- 画像圧縮の最終パラメータと文書 5MB 上限の妥当性（Phase 0 の計測で検証）
- チャット添付で開放する音声・動画・ZIP の対応 MIME タイプ・サイズ上限（動画は gallery 系の上限と揃えるか個別設定か含めて未決）
- 家賃 cron の粒度（日次か）と、月またぎ・タイムゾーンの扱い
- 風化後オリジナルのコールド退避までの猶予期間、最終削除の是非
- Team の確定価格、Solo との併存（Team 加入時の既存 Solo の扱い）
- BYOK の開放範囲（思想優先で全開放 or 収益優先で Team 以上）
- 消費税の扱い（Stripe Tax 導入の要否）、口数変更時の proration 方針
- Webhook 失敗時の運用（Stripe の自動リトライで足りるか、アラートを Inngest で組むか）
