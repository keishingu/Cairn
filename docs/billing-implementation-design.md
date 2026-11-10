# 課金実装設計書

> **ステータス**: 現行仕様（Free / Solo の購読・クレジット台帳・ストレージ家賃・AI 消費・動画添付・原本の取得は実装済み。Team / Expedition・ミニゲームは未実装）（作成: 2026-06-12 / 改訂: 2026-11-05）
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
  - **能動権（本人帰属）**: オリジナルのアップロード、動画のアップロード、PDF 原本・ギャラリー原本画像・動画の原本のダウンロード、無料容量を超える保存、`/ai` への依頼 → アクティブな支援者本人のみ
  - **受動恩恵（WS 帰属）**: 動画（圧縮版）の再生・保存、AI PMO のナッジ → ケルンに残高があれば全メンバー（動画は残高に関係なく、チャンネルに入れる全員が再生できる）
  - 2026-11 に無料プランを 100GiB・全形式 50MiB/ファイルへ広げ、Solo のファイル面の売りを「動画のアップロード」と「原本のダウンロード」に置き換えた。原本の閲覧・DL は当初 WS 帰属の受動恩恵だったが、Solo 本人の売りにするため能動権へ移した

## 3. 課金ポイントと執行ポイント

| 課金ポイント | Free | 支援者本人（funded WS） | 執行ポイント |
|---|---|---|---|
| ギャラリー画像 | 圧縮派生のみ（長辺2048px。EXIF の撮影日時・GPS は保持） | オリジナルも保存（表示は全員とも圧縮派生） | `projects/[id]/gallery/upload-url` / `finalize` |
| ギャラリー原本画像のダウンロード | 不可 | 可（`?original=1`、短期署名 URL） | `projects/[id]/gallery/[itemId]/file` |
| チャット添付・ファイル | 50MiB/ファイル（PDF は圧縮前） | 50MiB/ファイル | `attachments/upload-url` / `finalize`（`lib/attachments.ts`） |
| PDF 原本のダウンロード | 不可（最適化版は全員可） | 可（`?original=1`） | `attachments/[fileId]` |
| チャット添付の動画（MP4 / MOV / WebM） | 不可 | 500MiB/ファイル。再開可能アップロード（TUS）。再生・保存はチャンネルの全員が圧縮版、原本のダウンロード（`?original=1`）は支援者本人だけ | `attachments/upload-url` / `finalize`、配信は `attachments/[fileId]`、圧縮は `lib/inngest/video-transcode-job.ts` |
| チャット添付の音声・ZIP、ギャラリーの動画 | 不可（MIME whitelist 外） | 未開放 | — |
| ストレージ保有 | 100GiB まで（`BILLING_CONFIG.freeStorageBytes`。2026-11 に 10GiB から引き上げ） | 残高が家賃を払える限り | 家賃 cron（§6） |
| AI 能動利用（`/ai`） | 不可 | クレジットを消費 | `api/ai/conversations/[id]/messages` |
| AI 受動利用（AI PMO） | ケルンに残高があれば受信 | 受信 | `lib/ai-nudges/`（配信ごとに消費） |

- 画像圧縮は**アップロード前のクライアントサイド**で行う（`lib/process-image.ts`。ingress 帯域と処理コストの節約）。撮影日時・GPS を失わないこと（地図・タイムラインの前提）。オリジナルを保存する場合も必ず表示用の圧縮派生を持たせる（サムネイル兼、風化時のフォールバック）
- PDF は無料でも圧縮前50MiBまで受け付け、最適化版は全員が利用できる。原本のダウンロードは本人の有効な支援と残高を要求し、課金無効環境では許可する。
- アバター・ワークスペースロゴ・カバー写真は**家賃対象外**（サイズ上限のみ。プロフィール設定が課金で詰まる体験を避けるため）
- 動画は原価（ストレージ・egress）が大きく無料開放しづらいため、支援者本人の能動権としてチャット添付にだけ開放した。形式は MP4 / MOV / WebM（`VIDEO_ATTACHMENT_MIME_TYPES`）、上限は 500MiB（`MAX_VIDEO_ATTACHMENT_BYTES`。どちらも `@cairn/shared`）。upload-url は `canUploadVideo` を判定し、finalize は家賃精算後に支援と残高を同じトランザクションで再判定する（無料容量の内外を問わない）。50MiB を超えるため、クライアントは upload-url が返す `resumable: true` を見て、署名トークンを `x-signature` に載せた TUS（`/storage/v1/upload/resumable/sign`、6MB チャンク）で送る
- 動画は再生用の圧縮版（長辺 1280px = 720p 相当、H.264 / AAC の MP4、`+faststart`）を作り、全員はそれを再生・保存する。原本のダウンロードは画像・PDF と同じく支援者本人だけ。finalize が `metadata.videoTranscodeStatus = 'pending'` で登録して `file/video-transcode-requested` を送り、Inngest の `transcode-uploaded-video` が Vercel Sandbox（東京 `hnd1`、4 vCPU、使い捨て）で `apt-get install ffmpeg` してから変換する。Sandbox は原本を署名 URL で読み、圧縮版を署名付きアップロード URL で `chat-videos` の `videos/derived/{fileId}.mp4` に書く。変換は数分〜数十分かかり関数1回では待てないため、コマンドを detached で起動し、Inngest が 30 秒ごとの step で終了を確かめる（上限 60 分）。圧縮版は `derivedStoragePath` / `derivedFileSize` に記録し、家賃対象外の derived として数える
- 変換中（`pending` / `processing`）・失敗（`failed`）・状態なし（変換環境のないセルフホストと、この仕組みの前の動画）は全員が原本で再生する。Vercel 上（OIDC）か `VERCEL_TOKEN` / `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` が揃うときだけ変換する（`isVideoTranscodeConfigured`）
- 変換のたびに原本1回分の Supabase の配信量（egress）と、Sandbox の CPU・メモリ・送信量がかかる。再生のたびの配信量が原本より小さくなるので、2〜3回以上再生されれば元が取れる
- 動画のサーバー側サムネイルは作らない。Web はブラウザ標準の `<video preload="metadata">`、アプリは OS のブラウザで再生する。配信は API が Storage の署名 URL（4時間。再生中の Range 要求に耐える長さ）へ 302 し、本体を Vercel に通さない。アプリは `?as=json` で URL を受け取る
- 動画は専用の非公開バケット `chat-videos`（500MiB、動画の MIME だけ）に置き、`chat-attachments` は 50MiB のまま残す。同じバケットの上限を上げると、動画以外の署名付きアップロードでも finalize を呼ばずに 500MiB のオブジェクトを期限切れの清掃まで置けてしまうため。保存先は保存パスの `videos/` で決める（`attachmentBucketForPath`）。`chat-videos` には authenticated のポリシーを付けず、取得は API の署名 URL だけで行う
- ホスト版 Supabase は、プロジェクト全体のアップロード上限（Storage 設定）を 500MiB 以上にしておく必要がある
- 音声・ZIP、ギャラリーの動画は未開放

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
- `resolveUploadRights(isActiveSupporter, workspaceFunded, billingEnabled)` → `canUploadOriginal` / `canUploadLargeFile` / `canUploadVideo` / `canDownloadOriginal`。課金無効なら常に可、有効なら「支援者本人 かつ funded」
- UI の出し分け用に `GET /api/billing/upload-rights`（`canUploadVideo` / `canDownloadOriginal`）を置く。判定の正は各ルートの 403 で、アプリは課金の導線を出さないため、送れる・取得できる本人にだけボタンやメニューを出す
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
- 単位は「1依頼 / 1配信 = N クレジット」。`/ai` の1依頼はモデルごとに決める（`BILLING_CONFIG.aiChatRequestCreditsByModel`。初期仮値は GPT-5・Claude Sonnet 5.5 が 10、原価が約2倍の Claude Opus 5.5 が 20）。モデルはメンバーが会話ごとに選ぶため、どのモデルを選べるかは owner が `workspaces.ai_chat_allowed_models` で決める（[`10_ai_member_design.md`](./10_ai_member_design.md#会話ごとのモデル)）。残高の確認・予約・返金・run の記録はすべてその会話のモデルの値で行い、スキルのテスト実行は既定モデルの値を使う。AI PMO の1配信は 10（初期仮値）

### アップロード時の判定

アップロード系 Route Handler は「本人の権利（`resolveUploadRights`）」と「残高」を判定し、エラーを出し分ける: 権利なし →「石を積む」導線、ケルン枯渇 → 残高と買い増し導線。

- **チャットの画像をギャラリーへ追加**（`POST /api/messages/{id}/gallery`）はコピーで、チャット添付はそのまま残す。圧縮版（家賃対象外）はサーバーで作り、原本は追加した本人に原本保存の権利があるときだけ `gallery-originals` へ複製する（通常のギャラリーアップロードと同じ条件。確定直前に `assertOriginalStorageAllowed` で再判定）。複製した原本は家賃対象として二重に計上される。ファイル行を共有しないのは、ファイル一覧がギャラリー分を除外し、ギャラリーの圧縮版が公開バケットから配信されるため

## 7. 風化（残高 0 以下）

残高から導出する状態であり専用フラグは持たない。風化 = データ消失ではなく **Free 相当への復帰**。

- 新規のオリジナル / 大容量アップロードを停止
- **既存オリジナルはロックするが配信は止めない**: ギャラリーの表示は平常時から全員に圧縮派生を返す（`gallery/[itemId]/file`）。原本のダウンロードは風化中は支援者本人にも許可しない（egress が赤字リスクの本体）
- 既存の動画は風化中も再生・保存できる（全員が圧縮版、変換前は原本。原本のダウンロードは画像・PDF と同じく風化中は止まる）
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

- 設定 → **請求**（`billing`、PC のみ）: 残高・ストレージ使用量、「石を積む」（Stripe Checkout へ外部遷移）、パック購入
- 設定 → **ケルン**（`contributions`、モバイルのみ）: 貢献の記録（`CreditPlacementBoard`。風化しても残る）だけを表示し、支払い操作は置かない
- 出し分けは `getSettingsNavGroups()` のデバイス判定による
- アップロード失敗・AI 残高不足のエラーからは請求画面（PC）へ誘導する方針
- **入口は単純に保つ**: Free 利用時は石・ケルン・風化を見せず、容量・AI の限界に触れたときに初めて誘導する。Team / Expedition では定額の簡素な提示にする（[`pricing-plan-design.md`](./pricing-plan-design.md)「提示の二面化」）
- Expo アプリは課金 UI を出さず Web へリンクアウト（IAP 審査回避）。セルフホスト（課金無効）ではケルン画面を出さない
- 石積みミニゲーム（ランダム演出は見た目のみで残高は壊さない）は [`billing-minigame-design.md`](./billing-minigame-design.md)

## 11. 未決事項

プラン・価格・実装の未決事項はここに集約する（pricing-plan-design.md からもここを参照）。

- クレジット単価・月次付与数・家賃レート・AI 1依頼 / 1配信の消費数の本決定（現状は `BILLING_CONFIG` の初期仮値。原価シミュレーション要）
- AI の天井の見せ方（減る残高 or 毎月リセットの上限。枯渇不安が少ない後者を推奨）
- 画像圧縮の最終パラメータ（長辺 px・品質）と文書 5MB 上限の妥当性
- チャット添付で開放する音声・ZIP の MIME・サイズ上限、ギャラリーの動画対応、動画のサムネイル（一覧で軽く見せる静止画）の要否、変換に失敗した動画の再変換の導線
- 家賃の月またぎ・タイムゾーンの扱い
- 風化後オリジナルのコールド退避までの猶予期間、最終削除の是非
- Team の確定価格、Team 加入時の既存 Solo の扱い（併存して上積みか停止案内か）
- BYOK の開放範囲（思想優先で全開放 or 収益優先で Team 以上）
- 消費税（Stripe Tax の要否）、口数変更時の proration 方針（現状 Stripe 既定）
- Webhook 失敗時の運用（Stripe の自動リトライで足りるか、アラートを組むか）

### AI チャットの原価の実測（`ai_chat_usage`）

上のクレジット単価の本決定に使うため、`/ai` の1依頼ごとのトークン使用量を `ai_chat_usage` に記録する（応答を返した後に書くので、ストリームを待たせない）。保存するのは件数・トークン数・tool 名・所要時間・消費クレジットだけで、メッセージ本文や tool の引数・結果は保存しない。失敗した依頼（`status = 'failed'`。`error` は `stream_failed` / `save_failed` / `credit_reservation_failed` / `skill_run_rejected`）も、原価が発生した分は同じ行に残す。会話やスキル run を消しても行は残る。

`input_tokens` の意味はプロバイダーで違う。Anthropic は **キャッシュの読み書き分を含まない**（`cache_read_input_tokens` / `cache_creation_input_tokens` は別枠）。OpenAI（GPT-5）は **キャッシュ済みトークンを含む**（`cache_read_input_tokens` はその内訳）。`request_credits` は失敗行でも予約しようとした数が入る（`stream_failed` / `save_failed` / `skill_run_rejected` は返金済み、`credit_reservation_failed` は未課金）ため、消費クレジットは成功行だけで数える。キャッシュ列の `null` は「プロバイダーが報告しなかった」ことで、0 ではない。原価の式もプロバイダーごとに分ける（下の d）。

a) モデル別・1依頼あたりの入力 / 出力 / キャッシュ読みトークンの平均・中央値・p95（直近30日、成功のみ）

```sql
select model,
       count(*) as requests,
       round(avg(input_tokens)) as input_avg,
       percentile_cont(0.5) within group (order by input_tokens) as input_p50,
       percentile_cont(0.95) within group (order by input_tokens) as input_p95,
       round(avg(output_tokens)) as output_avg,
       percentile_cont(0.5) within group (order by output_tokens) as output_p50,
       percentile_cont(0.95) within group (order by output_tokens) as output_p95,
       round(avg(cache_read_input_tokens)) as cache_read_avg,
       percentile_cont(0.5) within group (order by cache_read_input_tokens) as cache_read_p50,
       percentile_cont(0.95) within group (order by cache_read_input_tokens) as cache_read_p95
from ai_chat_usage
where status = 'success' and created_at >= now() - interval '30 days'
group by model
order by model;
```

b) モデル別のステップ数（tool 呼び出しの重なり）の分布

```sql
select model, steps, count(*) as requests
from ai_chat_usage
where status = 'success' and created_at >= now() - interval '30 days'
group by model, steps
order by model, steps;
```

c) ワークスペース別の月次合計（JST）

トークン列は失敗した依頼でも原価が出ているので全行を合計し、消費クレジットは返金済み・未課金の失敗行を除いて成功行だけを数える。

```sql
select workspace_id,
       date_trunc('month', created_at at time zone 'Asia/Tokyo') as month,
       count(*) as requests,
       count(*) filter (where status = 'failed') as failed_requests,
       sum(input_tokens) as input_tokens,
       sum(output_tokens) as output_tokens,
       sum(coalesce(cache_read_input_tokens, 0)) as cache_read_input_tokens,
       sum(coalesce(cache_creation_input_tokens, 0)) as cache_creation_input_tokens,
       sum(request_credits) filter (where status = 'success') as credits_charged
from ai_chat_usage
group by workspace_id, month
order by month desc, requests desc;
```

d) 1依頼あたりの推定原価（円。為替は [`pricing-plan-design.md`](./pricing-plan-design.md) の ¥150/$）

単価は USD / 100万トークン。**公開単価が変わったら `prices` の VALUES を更新する**（Anthropic は公開単価、OpenAI は 2025-08 時点の公開単価で要確認）。

```sql
with prices (model, provider, input, output, cache_read, cache_write) as (
  values
    ('claude-sonnet-5-5', 'anthropic', 2.00, 10.00, 0.20, 2.50),  -- cache_write は 5 分キャッシュ
    ('claude-opus-5-5',   'anthropic', 4.00, 20.00, 0.20, 5.00),
    ('gpt-5',             'openai',    1.25, 10.00, 0.125, 0.00)   -- OpenAI の公開単価（2025-08 時点、要確認）。cache_read は cached 単価
)
select u.model,
       u.assistant_message_id,
       u.created_at,
       case p.provider
         -- Anthropic: input はキャッシュ分を含まない
         when 'anthropic' then
           (u.input_tokens * p.input
            + u.output_tokens * p.output
            + coalesce(u.cache_read_input_tokens, 0) * p.cache_read
            + coalesce(u.cache_creation_input_tokens, 0) * p.cache_write) / 1e6 * 150
         -- OpenAI: input はキャッシュ済み分を含むので引いてから通常単価を掛ける
         else
           ((u.input_tokens - coalesce(u.cache_read_input_tokens, 0)) * p.input
            + coalesce(u.cache_read_input_tokens, 0) * p.cache_read
            + u.output_tokens * p.output) / 1e6 * 150
       end as cost_jpy
from ai_chat_usage u
join prices p on p.model = u.model
where u.created_at >= now() - interval '30 days';
```

モデル別の平均原価は、上のクエリを CTE にして `group by model` で `avg(cost_jpy)` / `percentile_cont(0.95)` を取る。
