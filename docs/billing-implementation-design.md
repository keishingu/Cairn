# 課金実装設計書

> **ステータス**: 現行の設計合意（作成: 2026-06-12、実装未着手）
> [`pricing-plan-design.md`](./pricing-plan-design.md) のプラン設計（Free / Stone / Party / Expedition）を実装に落とすための設計。実装着手時に本書を更新する。関連: [`10_ai_member_design.md`](./10_ai_member_design.md)（AIクレジットの消費主体）

---

## 1. スコープと方針

- **対象は Free + Stone のみ**（ロールアウト順序に従う）。Party / Expedition は引き合いが出てから設計する
- 決済は **Stripe・Web のみ**（IAP なし。アプリはリンクアウト）
- **OSS 原則との両立**: 課金コードは OSS リポジトリに含める。ただし Stripe 環境変数が未設定の場合（セルフホスト）は課金機構が無効になり、**全エンタイトルメントが無制限（Expedition 相当）として解決される**。機能ペイウォールは作らない
- 課金有効判定は `STRIPE_SECRET_KEY` の有無による単一フラグ（`isBillingEnabled()`）とし、機能ごとのフラグを散在させない

## 2. 課金ポイントと執行ポイント

| 課金ポイント | Free | Stone 1口ごと | 執行ポイント（実コード） |
|---|---|---|---|
| ストレージ総量 | 10GB | +50GB | 下記アップロード系 Route Handler |
| 1ファイルサイズ | 25MB | 緩和（上限は未決） | 同上 |
| 動画アップロード | 不可（写真のみ） | 可 | gallery 系 Route Handler（MIME 判定） |
| AIクレジット | 月少量（お試し） | +月次付与（WS共有プール） | AI メッセージ生成 API・AIメンバーの行動 |

アップロード系の執行ポイント（容量・ファイルサイズ・MIME チェックを挿入する場所）:

- `apps/web/src/app/api/attachments/upload/route.ts` — チャット添付
- `apps/web/src/app/api/projects/[id]/files/route.ts` / `api/files/route.ts` — ファイル
- `apps/web/src/app/api/projects/[id]/gallery/route.ts` / `api/gallery/route.ts` — ギャラリー

アバター・ワークスペースロゴ・カバー写真（`me/avatar`, `workspaces/logo`, `workspaces/cover-photos`）は**クォータ対象外**とする（サイズ上限の個別チェックのみ。プロフィール設定が課金で詰まる体験を避けるため）。

AI の執行ポイント:

- `apps/web/src/app/api/ai/conversations/[id]/messages/route.ts` — 会話生成（リクエスト前に残高チェック、応答後に消費記録）
- AIメンバー実装後はメンション応答・ハートビート発言も同経路（→ §6）

## 3. データモデル（`packages/db/src/schema/billing.ts` 新設）

```
billing_customers          Stripe 顧客の対応表
  user_id        PK → profiles.id
  stripe_customer_id  unique

stone_subscriptions        積み石（Stone サブスクリプション）
  id             PK
  workspace_id   → workspaces.id (cascade)
  supporter_user_id → profiles.id        ※ WS 退会後も継続可（OB積み石）
  stripe_subscription_id  unique
  quantity       int                     ※ 口数
  status         enum: active / past_due / canceled
  current_period_end  timestamptz

ai_credit_ledger           AIクレジット台帳（残高 = SUM(delta)）
  id             PK
  workspace_id   → workspaces.id (cascade)
  delta          int（付与は正・消費は負）
  reason         enum: monthly_grant / stone_grant / pack_purchase / consumption / adjustment
  ref_id         text（消費なら ai_messages.id、購入なら Stripe payment intent 等）
  created_at     index (workspace_id, created_at)

workspace_storage_usage    ストレージ使用量カウンタ
  workspace_id   PK → workspaces.id (cascade)
  bytes_used     bigint
  updated_at

stripe_events              Webhook 冪等性
  event_id       PK（Stripe event id）
  processed_at
```

設計判断:

- **台帳（ledger）方式**を採る。残高カラムの直接更新は競合・監査の両面で不利。残高は `SUM(delta)`（頻繁なら期末スナップショット行で圧縮）
- **使用量はカウンタ方式**。都度 `SUM(file_size)` を取らない。アップロード/削除のユースケースでカウンタを増減し、乖離検出用にバックフィルスクリプトを用意する
- **既存スキーマの変更が1つ必要**: `gallery` テーブルに `file_size` カラムがない（`files.file_size` は存在）。ギャラリーが容量の主消費者（写真・動画）なので、マイグレーション + 既存行のバックフィル（Storage API でサイズ取得）が Phase 0 の前提

## 4. エンタイトルメント解決

`packages/core` に純粋関数として置く（DB・Stripe 非依存、テスト容易）:

```ts
resolveEntitlements(activeStones: number, billingEnabled: boolean): Entitlements
// billingEnabled=false → 全項目無制限（セルフホスト = Expedition 相当）
// それ以外 → storageLimit = 10GB + 50GB × activeStones, など
```

- `activeStones` = その WS の `stone_subscriptions` で `status='active'` な `quantity` 合計
- エンタイトルメントの数値定義はこの関数に集約し、Route Handler には散在させない

## 5. 執行の方針

- **超過時はエラーを表示する**（CLAUDE.md のエラー表示方針に従う）。サイレントに劣化させず、「容量が不足しています。石を積むと +50GB/口」という明確なメッセージ + 課金導線を出す
- **失効時にデータは消さない**。Stone が切れて使用量が上限超過になっても、既存データの閲覧・ダウンロードは常に可能。ブロックするのは新規アップロードのみ（猶予期間の有無は未決）
- 容量チェックは「現在使用量 + アップロードサイズ ≤ 上限」の事前判定。多少の競合超過は許容する（厳密なロックはしない）

## 6. AIクレジット

- **単位**: 「1クレジット = AI への1依頼（標準的なもの）」を基本とする抽象単位。トークン数を直接見せない。内部ではモデル別係数（gpt-4o / gpt-4o-mini / embedding）で原価換算する。係数と付与量は原価シミュレーションの上で確定（未決）
- **消費しないもの**: ハートビートの一次判定（gpt-4o-mini の巡回。ユーザー操作でなく原価僅少のため）、RAG の embedding 検索。**消費するもの**: 応答生成・ツール実行・HTMLテンプレート生成
- **付与**: Inngest cron で月次付与（`monthly_grant` は Free 基礎分、`stone_grant` は口数比例分。`invoice.paid` 時に翌期分を付与する設計も可 — 未決）。繰越は当面なし（未決）
- **消費フロー**: リクエスト前に残高 > 0 をチェック → 応答完了後に実測で `consumption` 行を記録。事後記録のため僅かなマイナス残高は許容し、次回リクエストをブロックする（リザーブ方式は初期は採らない・複雑すぎる）
- 残高ゼロ時は AI 機能のみ停止。チャット・ファイル等には影響しない

## 7. Stripe 統合

- **Stone 購読**: Checkout Session（`mode=subscription`, `quantity=口数`, ¥300/口/月）。口数変更は Customer Portal で（proration は Stripe 既定に従う — 未決で見直し可）
- **クレジットパック**: Checkout Session（`mode=payment`、使い切り）→ `pack_purchase` で台帳付与
- **Webhook**: `apps/web/src/app/api/billing/webhook/route.ts` 新設
  - `checkout.session.completed` → `stone_subscriptions` 作成 / パック付与
  - `invoice.paid` → 期間更新（+ クレジット付与方式を採る場合はここで付与）
  - `customer.subscription.updated` / `deleted` → status・quantity 同期
  - 署名検証必須。`stripe_events` による冪等化（同一イベントの再処理を無視）
- Webhook は Vercel 上で同期処理できる軽さに保つ。重い後続処理（通知等）は Inngest に流す

## 8. packages/core への配置（CQRS 命名）

- ports: `BillingGateway`（Checkout / Portal URL 生成。実装は `apps/web` の Stripe SDK）
- application:
  - `CheckUploadAllowedQuery` — 容量・サイズ・MIME の事前判定（entitlements を引数に取る純ロジック）
  - `RecordStorageUsageCommand` — アップロード/削除時のカウンタ増減
  - `ConsumeAiCreditsCommand` / `GrantAiCreditsCommand` — 台帳記帳
- Stripe 固有の処理（Webhook パース等）は core に持ち込まない

## 9. UI

- 設定 → **「積み石」タブ**（PC / モバイル両シェル）:
  - ワークスペースのケルン表示（アクティブな口数ぶん石が積まれる）と支援者一覧（積み石バッジ）
  - 「石を積む」ボタン → Stripe Checkout（外部遷移）
  - 使用量メーター: ストレージ（使用 / 上限）、AIクレジット残高
- アップロード失敗・AI 残高不足のエラートーストから同タブへ誘導
- モバイルアプリ（Expo）: 課金 UI は表示せず Web へのリンクアウトのみ（IAP 審査回避。pricing-plan-design.md 参照）
- セルフホスト（課金無効）ではタブ自体を非表示

## 10. 実装ロードマップ

| Phase | 内容 | 備考 |
|---|---|---|
| **0: 計測** | `gallery.file_size` 追加 + バックフィル、`workspace_storage_usage` 導入、使用量メーター表示。**制限はかけない** | 実データで 10GB/25MB の妥当性を検証してから執行する |
| **1: Stone + ストレージ執行** | Stripe 購読・Webhook・エンタイトルメント解決・アップロード執行・「積み石」タブ | ここで初めて課金が動く |
| **2: AIクレジット** | 台帳・月次付与・消費記録・パック購入 | AIメンバー Stage 1（メンション応答）と同期して出すのが理想 |
| **3: Party / Expedition** | 請求書払い・SSO・監査ログ | 引き合いが出てから |

## 11. 未決事項

- クレジット係数・月次付与量・パック価格（原価シミュレーション要）
- クレジット繰越の有無、月次付与のタイミング（暦月 cron か `invoice.paid` 連動か）
- Stone 失効時の猶予期間と超過データの長期的な扱い
- Stone 有料時の1ファイルサイズ上限
- 消費税の扱い（Stripe Tax 導入の要否）
- 口数変更時の proration 方針
- Webhook 失敗時の運用（Stripe の自動リトライで足りるか、アラートを Inngest で組むか）
