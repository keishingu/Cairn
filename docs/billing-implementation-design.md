# 課金実装設計書

> **ステータス**: 現行仕様（Free / Solo の購読・クレジット台帳・ストレージ家賃・AI 消費は実装済み。Team / Expedition・ミニゲームは未実装）（作成: 2026-06-12 / 改訂: 2026-09-24）
> プランの意図・価格・原価モデルは [`pricing-plan-design.md`](./pricing-plan-design.md)。関連: [`ai-pmo-design.md`](./ai-pmo-design.md)（受動AI）、[`billing-minigame-design.md`](./billing-minigame-design.md)（石積みミニゲーム）

## 1. 方針

- **対象は Free + Solo**。Team / Expedition は引き合いが出てから設計する（`billing_plan` enum に `workspace` はあるが Checkout は `individual` のみ）
- 決済は **Stripe・Web のみ**（IAP なし。アプリはリンクアウト）
- **OSS 原則との両立**: 課金コードは OSS に含める。`STRIPE_SECRET_KEY` 未設定（セルフホスト）では課金機構ごと無効になり、全エンタイトルメントが無制限として解決される。判定は `isBillingEnabled()`（`apps/web/src/lib/billing/is-billing-enabled.ts`）の単一フラグとし、機能ごとのフラグを散在させない
- **ブランド名（石 / ケルン / Solo 等）はスキーマ・コード識別子に入れない**。改名に耐えるよう `credit`・`subscription`・`plan` など中立語を使い、「石 / ケルン」は UI 文言にのみ置く

## 2. モデルの骨格: 石 = 消費型クレジット

石はケルン（= ワークスペースのクレジット残高）に積まれ、消費で減る。コード上の単位は credit。

- **供給**: Solo 購読の月次付与、クレジットパック（単発購入）。失効しない
- **消費**: AI の利用 = 都度（フロー型）、ストレージ保有 = 家賃として日割り（ストック型。保有バイト × レート × 経過期間）
- **残高 = `SUM(credit_ledger.delta)`**。0 以下で「風化」
- **権利と恩恵の分離**:
  - **能動権（本人帰属）**: オリジナル / 大容量のアップロード、`/ai` への依頼 → アクティブな支援者本人のみ
  - **受動恩恵（WS 帰属）**: オリジナルの閲覧・DL、AI PMO のナッジ → ケルンに残高があれば全メンバー

## 3. 課金ポイントと執行ポイント

| 課金ポイント | Free | 支援者本人（funded WS） | 執行ポイント |
|---|---|---|---|
| ギャラリー画像 | 圧縮派生のみ（長辺2048px。EXIF の撮影日時・GPS は保持） | オリジナルも保存（閲覧は全員） | `projects/[id]/gallery/upload-url` / `finalize` |
| チャット添付・ファイル | 5MB/ファイル | 10MB/ファイル | `attachments/upload-url` / `finalize`（`lib/attachments.ts`） |
| 動画、チャット添付の音声・ZIP | 不可（MIME whitelist 外） | 未開放（`canUploadVideo` の権利判定だけ定義済み） | — |
| ストレージ保有 | 10GB まで | 残高が家賃を払える限り | 家賃 cron（§6） |
| AI 能動利用（`/ai`） | 不可 | クレジットを消費 | `api/ai/conversations/[id]/messages` |
| AI 受動利用（AI PMO） | ケルンに残高があれば受信 | 受信 | `lib/ai-nudges/`（配信ごとに消費） |

- 画像圧縮は**アップロード前のクライアントサイド**で行う（`lib/process-image.ts`。ingress 帯域と処理コストの節約）。撮影日時・GPS を失わないこと（地図・タイムラインの前提）。オリジナルを保存する場合も必ず表示用の圧縮派生を持たせる（サムネイル兼、風化時のフォールバック）
- アバター・ワークスペースロゴ・カバー写真は**家賃対象外**（サイズ上限のみ。プロフィール設定が課金で詰まる体験を避けるため）
- 音声・動画・ZIP は原価（ストレージ・egress）が大きく無料開放しづらいため、支援者本人の能動権として開放する想定（MIME・上限は未決）

## 4. データモデル（`packages/db/src/schema/billing.ts`）

```
billing_customers          Stripe 顧客 ↔ ユーザー（1:1。複数 WS を支援できるため workspace_id なし）
subscriptions              支援サブスクリプション
  workspace_id → workspaces (cascade)
  supporter_user_id → profiles（cascade しない。退会後も支援記録を残す）
  plan  enum billing_plan: individual / workspace   ※ UI は Solo / Team
  stripe_subscription_id unique, quantity（重ね掛け口数）
  status enum: active / past_due / canceled, current_period_end
credit_ledger              クレジット台帳。残高 = SUM(delta)
  workspace_id, delta（付与は正・消費は負）
  reason enum: subscription_grant / pack_purchase / ai_consumption / storage_rent / adjustment
  ref_id（AI消費は対象ID、購入は Stripe id、家賃は期間キー）
  UNIQUE (workspace_id, reason, ref_id)   ※ 二重記帳防止
credit_placements          付与クレジットをケルン画面に配置した結果（台帳行と 1:1）
workspace_storage_usage    使用量カウンタ（家賃・執行の入力）
  original_bytes（家賃対象）/ derived_bytes（圧縮派生。家賃対象外）
  unbilled_rent_credits（日割り家賃の小数端数の繰越）, last_rent_at, last_reconciled_at
stripe_events              Webhook 冪等性（Stripe event id）
```

設計判断:

- **台帳方式**: 残高カラムの直接更新は競合・監査の両面で不利。石は AI と家賃の両方をまかなう単一通貨なので台帳は1本
- **使用量はカウンタ方式**: アップロード時の執行がホットパスに乗るため都度 `SUM(file_size)` を避け、アップロード / 削除で増減する（`lib/billing/storage-usage.ts`）。CASCADE 削除等でのドリフトは日次 reconciliation で補正する
- **貢献の記録**は `subscriptions` + `credit_ledger(subscription_grant / pack_purchase)` から導出する（`/api/billing/contributions`）

## 5. エンタイトルメント解決

純粋関数は `packages/core`（`@cairn/core/billing`）、DB からの解決は `apps/web/src/lib/billing/entitlements.ts`（`resolveUploadEntitlements`）。

- `resolveWorkspaceState(creditBalance, billingEnabled)` → `unlimited`（課金無効）/ `funded`（残高 > 0）/ `weathered`（残高 <= 0）
- `resolveUploadRights(isActiveSupporter, workspaceFunded, billingEnabled)` → `canUploadOriginal` / `canUploadLargeFile` / `canUploadVideo`。課金無効なら常に可、有効なら「支援者本人 かつ funded」
- 数値（価格・付与数・パック・AI 消費・無料容量・家賃レート）は `packages/core/src/domain/billing-config.ts` の `BILLING_CONFIG` に集約し、Route Handler に散在させない
- Team 移行動線（Solo の月額合計が Team 価格に近づいた WS への提案）は Team 実装時に設計する

## 6. 消費の執行

### ストレージ家賃

- Inngest cron `charge-storage-rent`（毎日 03:20 JST）が `original_bytes` のうち無料枠超過分から `last_rent_at` 以降の日割り家賃を算出し、`storage_rent` を記帳する。計算は `@cairn/core/billing` の `calculateStorageRentAccrual` / `settleStorageRent`、端数は `unbilled_rent_credits` に繰り越す
- 直前の `reconcile-workspace-storage-usage`（03:15 JST）がカウンタを実データで再計算する
- 家賃レートは実保存原価以上に設定する（根拠は pricing の原価モデル）

### AI 消費（`/ai` と AI PMO で共通）

- **`/ai`**: モデル呼び出し前に独立トランザクションで `ai_consumption` を記帳して予約し（`reserveCreditsForActiveBenefit`）、生成・ストリーム・応答保存の失敗時は `adjustment` で冪等に返金する（`refundActiveBenefitReservation`）。応答保存とデビットは同一トランザクションではない
- **AI PMO**: Phase 1/2 ともナッジ配信時に `consumeCreditsForPassiveBenefit` で記帳し、残高がなければ配信しない。ルール巡回・Jev 一次判定・RAG の embedding 検索は消費しない
- 単位は「1依頼 / 1配信 = N クレジット」（初期仮値はともに 10）。モデル別係数・実測原価への対応は内部で吸収する

### アップロード時の判定

アップロード系 Route Handler は「本人の権利（`resolveUploadRights`）」と「残高」を判定し、エラーを出し分ける: 権利なし →「石を積む」導線、ケルン枯渇 → 残高と買い増し導線。

## 7. 風化（残高 0 以下）

残高から導出する状態であり専用フラグは持たない。風化 = データ消失ではなく **Free 相当への復帰**。

- 新規のオリジナル / 大容量アップロードを停止
- **既存オリジナルはロックするが配信は止めない**: ギャラリー画像は圧縮派生を返す（`gallery/[itemId]/file`）。egress が赤字リスクの本体なのでオリジナルは返さない
- 圧縮派生と貢献記録は消えない
- 石が再び積まれたら funded に戻り、ロックが外れる
- 未実装: 動画・文書のプレースホルダ表示、長期風化オリジナルのコールドストレージ退避（最終削除は超長期 + 警告の上での最終手段）

## 8. Stripe 統合

- **購読（Solo）**: Checkout Session（`mode=subscription`、`quantity` で重ね掛け）。口数・解約は Customer Portal（`/api/billing/portal`）
- **クレジットパック**: Checkout Session（`mode=payment`、`/api/billing/credit-packs/checkout`）→ `pack_purchase`。Price ID は `STRIPE_CREDIT_PACK_PRICE_ID`
- **Webhook**（`/api/billing/webhook`、処理は `lib/billing/stripe-webhook.ts`）: 署名検証必須、`stripe_events` で冪等化
  - `checkout.session.completed` / `async_payment_succeeded` → 購読作成 / パック付与
  - `invoice.paid` → 期間更新 + 月次 `subscription_grant`
  - `customer.subscription.updated` / `deleted` → status・quantity・plan 同期
- Webhook は同期処理できる軽さに保ち、重い後続処理は Inngest に流す

## 9. `packages/core` の範囲

`@cairn/core/billing`（`packages/core/src/billing.ts`）が公開するのは DB・Stripe 非依存の純粋関数と定数のみ:

- `resolveWorkspaceState` / `resolveUploadRights` と型 `WorkspaceState` / `UploadRights`
- `calculateStorageRentAccrual` / `settleStorageRent`（家賃計算）
- `isPlacementEligibleCredit` / `placementEligibleCreditReasons`（ケルン画面に配置できる付与の判定）
- `BILLING_CONFIG` / `BYTES_PER_GIB`

台帳記帳・使用量カウンタ・Stripe SDK 呼び出しは `apps/web/src/lib/billing/` に置く。Stripe 固有の処理は core に持ち込まない。

## 10. UI

- 設定 → **ケルン画面**（PC / モバイル共有）: 残高・ストレージ使用量、「石を積む」（Stripe Checkout へ外部遷移）、パック購入、貢献の記録（風化しても残る）
- アップロード失敗・AI 残高不足のエラーから同画面へ誘導する
- **入口は単純に保つ**: Free 利用時は石・ケルン・風化を見せず、容量・AI の限界に触れたときに初めて誘導する。Team / Expedition では定額の簡素な提示にする（[`pricing-plan-design.md`](./pricing-plan-design.md)「提示の二面化」）
- Expo アプリは課金 UI を出さず Web へリンクアウト（IAP 審査回避）。セルフホスト（課金無効）ではケルン画面を出さない
- 石積みミニゲーム（ランダム演出は見た目のみで残高は壊さない）は [`billing-minigame-design.md`](./billing-minigame-design.md)

## 11. 未決事項

プラン・価格・実装の未決事項はここに集約する（pricing-plan-design.md からもここを参照）。

- クレジット単価・月次付与数・家賃レート・AI 1依頼 / 1配信の消費数の本決定（現状は `BILLING_CONFIG` の初期仮値。原価シミュレーション要）
- AI の天井の見せ方（減る残高 or 毎月リセットの上限。枯渇不安が少ない後者を推奨）
- 画像圧縮の最終パラメータ（長辺 px・品質）と文書 5MB 上限の妥当性
- チャット添付で開放する音声・動画・ZIP の MIME・サイズ上限（ギャラリーの動画対応を含む）
- 家賃の月またぎ・タイムゾーンの扱い
- 風化後オリジナルのコールド退避までの猶予期間、最終削除の是非
- Team の確定価格、Team 加入時の既存 Solo の扱い（併存して上積みか停止案内か）
- BYOK の開放範囲（思想優先で全開放 or 収益優先で Team 以上）
- 消費税（Stripe Tax の要否）、口数変更時の proration 方針（現状 Stripe 既定）
- Webhook 失敗時の運用（Stripe の自動リトライで足りるか、アラートを組むか）
