# LP コンテンツ再構築（無料のチャット＋プロジェクト管理）

- **ステータス**: 実装済み
- **作成**: 2026-07-03
- **更新**: 2026-11-05（Teams 移行キャンペーン・Android 公開を反映）
- **対象**: `apps/web/public/index.html` / `apps/web/public/cairn-lp.css` / `apps/web/public/cairn-lp.js`（静的 LP）

> 実装と矛盾する場合はコードと [`AGENTS.md`](../AGENTS.md) を正とする。
> ルーティング（`/` への公開化）は [`landing-page-routing-design.md`](./landing-page-routing-design.md) を参照。


## 1. 背景

2026-08 の「三人称順」版（Hero「コメントが、チャットになる。」→ まとめ役 → アーリーアダプター）は、仕組みの説明が中心で困りごとに接続せず、競合名を避けた結果「何と比べて良いのか」も伝わらなかった。

小規模チーム・団体は、Slack / 国産チャット / Backlog などの **無料プランを組み合わせて** 使っていることが多く、判断軸は主に料金である。そこで 2026-09 に主物語を **「無料でチャットも、プロジェクト管理も。」** に置き換えた。


## 2. ターゲット

| 優先 | 読み手 | 入口のプラン |
|---|---|---|
| 1 | 学生団体・コミュニティ | Free → 必要な人だけ Solo |
| 2 | 個人事業主の延長のような小規模チーム | Free / Solo → Team（準備中） |
| 3 | 企業内の小規模チーム（試験導入） | Free → Expedition（導入支援つき） |

企業向けは Expedition で FDE 的な導入支援（業務整理・運用設計・既存ツール連携）へつなぐ。


## 3. 構成

| 順 | セクション | 伝えること |
|---|---|---|
| 0 | キャンペーン `#teams-migration`（期間限定） | ナビ直下・ヒーローの上。「Teamsコミュニティからの移行をサポート！」と問い合わせ CTA。詳細は §7 |
| 1 | Hero `#stay` | 「無料でチャットも、プロジェクト管理も。」メッセージ数・履歴・メンバー数無制限。有料は必要な人だけ月 ¥300。CTA「無料で始める」＋「料金を見る」、App Store / Google Play へのリンク |
| 2 | 無料の範囲 `#free` | 無制限（メッセージ・履歴 / メンバー・ゲスト / プロジェクト・タスク・カレンダー）、ファイル 100GB（1ファイル 50MB） |
| 3 | ツールを分けなくていい `#connect` | ☑ がタスクになる / プロジェクトごとにまとまる / カレンダー・カンバンとマイルストーンチャット |
| 4 | 無料プランの比較 `#compare` | Cairn / 海外製チャット / 国産チャット / 国産プロジェクト管理 の比較表（製品名は伏せる）。日付の注記つき |
| 5 | 細かいところ `#details` | 圏外送信、閲覧中は Push を鳴らさない、下書き保存、ゲスト、アーカイブ、最新版ラベル、iPhone・Android アプリとブラウザ（App Store / Google Play リンク）、キーボード、電気通信事業届出 |
| 6 | 料金 `#pricing` | Free ¥0 / Solo ¥300（1人・月）/ Team ¥3,000（ワークスペース・月、準備中・目安）/ Expedition 要相談 |
| 7 | AI `#ai` | 出典つき回答（Solo）と MCP（任意）を短く |
| 8 | オープンソース `#open-source` | Apache-2.0。中身を確認できる / サービスに縛られない（セルフホストは課金無効・手順は整備中）/ 開発者に直接要望を出せる。GitHub と要望受付ワークスペースへの導線 |
| 9 | FAQ `#faq` | 無料の範囲、無料で提供できる理由、無料プランの組み合わせからの移行、Solo の要否、ゲスト、企業導入、Teams コミュニティからの移行、スマホアプリ |
| 10 | 最終 CTA `#demo` | Hero と同じ見出し。クレジットカード不要。App Store / Google Play ボタン |


## 4. コピーの規則

### トーン

- 事実を短く書く。**AI っぽい甘い口調を使わない**（呼びかけ・「〜しませんか」・詩的な改行・「もう〜しない」・情緒的な言い換えを避ける）
- 見出しは機能か数字で言い切る。本文は常体（FAQ の回答のみ敬体）

### 競合名

- **Chatwork は名前を出さず「国産チャット」とぼかす**（title・meta・本文・FAQ すべて）
- **比較表では製品名を出さない**。列見出しは「海外製チャット」（Slack）/「国産チャット」（Chatwork）/「国産プロジェクト管理」（Backlog）とする
- Slack / Backlog の名前は FAQ・meta（検索対策）に限って出してよい。Hero・比較表には出さない
- 比較表の競合情報は **各社が公開している無料プランの条件** に限り、表の下に「2026年◯月時点」の注記を必ず付ける。条件が変わったら表と注記を更新する
- 競合の料金の具体額は載せない（「人数課金」「プラン別の月額」の形で書く）

### 書いてよい（コードで確認済み）

| コピー | 根拠 |
|---|---|
| メッセージ・履歴・メンバー・ゲスト無制限、無料 | [`pricing-plan-design.md`](./pricing-plan-design.md) の設計原則 4・5 |
| ファイル 100GB・1ファイル 50MB（無料） | `BILLING_CONFIG.freeStorageBytes` / `MAX_FILE_SIZE`。引き上げは [keishingu/Cairn#769](https://github.com/keishingu/Cairn/pull/769)。**#769 より先に LP を本番に出さない** |
| Solo ¥300/月、100GB を超える保存、月 300 クレジット、AI 1回 10 クレジット、追加 ¥500 | `BILLING_CONFIG` / `MAX_FILE_SIZE` |
| AI は Solo（アクティブな支援者）のみ | `api/ai/conversations/[id]/messages` の支援者判定 |
| ☑ がタスクになり双方向同期 | `parseCheckboxes` / Todo→Task 同期 |
| 圏外送信（スマホアプリ） | Expo の送信オフラインキュー |
| 閲覧中は Push を鳴らさない | 猶予付き既読再確認 |
| 退会者のアーカイブと発言の保持 | [`user-deactivation-design.md`](./user-deactivation-design.md) |
| セルフホストでは課金が無効（容量・AI の制限なし、AI は自前の OpenAI キー） | `isBillingEnabled()`（`STRIPE_SECRET_KEY` の有無） |
| iPhone アプリ（App Store 公開済み） | https://apps.apple.com/jp/app/cairn/id6800673777 |
| Android アプリ（Google Play 公開済み、2026-10-28・日本のみ） | https://play.google.com/store/apps/details?id=com.oss_cairn （[`play-store-submission.md`](./play-store-submission.md)） |
| 電気通信事業届出（A-08-24291） | [`telecom-business-filing-research.md`](./telecom-business-filing-research.md) |

### 書いてはいけない

- **未公開のアプリ**: デスクトップ（Electron、一般配布なし）を「使える」と書かない。一般公開されたら追加する
- **Teams からのデータ取り込み**: エクスポートしたメッセージ・ファイルの取り込みは検証中。「インポートできる」「履歴を完全に移せる」と書かない（§7）
- **未出荷の約束**: 自律エージェント、予定の自動変更、BYO AI、動く `docker compose up`、SSO・監査ログ
- **AI PMO**: ワークスペース単位の段階公開中のため LP の機能として書かない
- **石・ケルン・風化の用語**: LP では「クレジット」で説明する
- **Team の確定価格**: 「目安」「準備中」と必ず併記する
- **Solo の AI 回数**: 「最大」と書く。保存と AI の自動通知が同じクレジットを消費するため
- **非公開の顧客名**


## 5. CTA とパラメータ規約

- 主要 CTA: 「**無料で始める / Start for free**」→ `/auth/login?utm_source=lp&utm_content=<cta-id>`
- `data-cta`: `nav` / `hero` / `pricing` / `final` / `footer-product` / `oss-community` / `appstore-{hero,details,final,footer}` / `googleplay-{hero,details,final,footer}` / `teams-migration-banner` / `teams-migration-mail`（ストアは外部リンクのため UTM なし）（フッターアイコン・コミュニティは要望受付ワークスペース招待）
- Expedition の問い合わせは既存の相談窓口（`https://moru.tech/#consultation`）へ。Teams 移行は無料相談の予約ページ（TimeRex）とメール（`info@orikata.co.jp`）
- Android 版は日本でのみ配信しているため、英語のストア導線と FAQ には「Japan only」/「日本でのみ配信」を添える。配信国を広げたら外す
- ストアへのリンクはテキストリンクで、公式バッジ画像は使っていない。バッジに置き換えるときは Apple / Google のバッジ利用ガイドラインに従う（公式の画像をそのまま使い、改変しない）。フッターに App Store・Google Play・Microsoft Teams の商標表記と、Microsoft と提携していない旨を置いている

### 計測（PostHog）

- `apps/web/src/app/route.ts` が、アプリと同じ `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` を `window.__CAIRN_LP_POSTHOG__` として `<head>` に埋め込む。トークンが無い環境では何も埋め込まず、計測もしない
- `cairn-lp.js` が PostHog（`array.js`）を読み込み、`a[data-cta]` のクリックを `lp_cta_clicked`（`cta` / `cta_group` = `teams_migration` / `app_store` / `google_play` / `other` / `href` / `lp_lang`）として 1 回だけ送る。二重送信を避けるため autocapture は切っている
- 流入元の UTM は PostHog が `$pageview` と各イベントの URL から拾う。アプリと同じプロジェクト・Cookie なので、ログイン後の利用者にもつながる


## 6. 今後

- OGP 画像（`og-image.png` / `.svg`）は旧コピー「One Project. One Place.」のまま。作り直すまで `og:image:alt` は画像の実際の内容に合わせる
- Team の提供開始時に価格と内容を確定し、「準備中」を外す
- 比較表の競合条件は四半期ごとに見直す


## 7. Teams コミュニティ移行キャンペーン（期間限定、2026-11-05〜）

Microsoft が個人向け Microsoft Teams のコミュニティ機能を 2026年12月以降に終了すると発表したため、移行先を探す団体・コミュニティの運営者に向けて告知している。

- **ボタン**: 告知の CTA は `.btn-primary` だがグロー（`box-shadow`）を外している。ヒーローの CTA と光り方で競わせないため
- **配置**: ナビ直下・ヒーローの上の `section.campaign#teams-migration`。PC は本文と CTA の横並び、820px 以下は縦並びで CTA を全幅にする。後続のヒーローは上余白を詰める（`.campaign + .hero`）
- **意味**: 「移行支援」は問い合わせ・ヒアリング・移行方法の個別案内のこと。データの完全移行、履歴の完全復元、全ファイルの取り込みは約束しない
- **取り込み機能**: Teams のエクスポートデータを Cairn に取り込む機能は**未完成（検証中）**。「取り込める」「履歴を移せる」とは書かない。一方で「検証中」の注記はマイナスの印象が強いため告知・FAQ には出さず、FAQ では「これまでのメッセージやファイルの扱いもお問い合わせの際にご相談ください」とだけ書く。正式に提供したら、コピー・FAQ・§4 の「書いてはいけない」を更新する
- **表現の制約**: 終わるのは「個人向け Teams のコミュニティ機能」。企業・学校向けの Teams 全体が終わるように書かない。Microsoft と提携しているように書かない
- **問い合わせ**: 「まずはお問い合わせください」は無料相談の予約ページ（TimeRex、`https://timerex.net/s/dongmin.park_471b/579387d1/`）へ直接リンクする（UTM なし）。並べて `info@orikata.co.jp` 宛ての `mailto:`（件名「Teams コミュニティからの移行の相談」）のホローボタンを置く。予約にもメールにも種別がないため、注記で「Teams 移行」と書いてもらう
- **SEO**: 新ページは作らず、`meta description` に一文と FAQ（JSON-LD 含む）に 1 問を追加した。「Teams コミュニティ 廃止 / 代替 / 移行」で上位を狙うなら、専用ページ（例: `/migrate-from-teams`）を別途検討する
- **撤去手順**: `index.html` の `#teams-migration` セクション、FAQ の Teams の 1 問（HTML と JSON-LD の両方）、`meta description` の Teams の一文、`cairn-lp.css` の「campaign」ブロックを消し、`apps/web/src/app/page.test.tsx` の該当テストと本節を更新する
