# LP コンテンツ再構築（無料のチャット＋プロジェクト管理）

- **ステータス**: 実装済み
- **作成**: 2026-07-03
- **更新**: 2026-11-05（Teams 移行キャンペーン・Android 公開・`/teams/migration` を反映）
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
- **Teams からのデータ取り込み**: 会話履歴・写真・ファイルの引き継ぎは**運営側が個別サポートで行う**。利用者が自分で使う取り込み機能は提供しない方針なので、あるようには書かない。「完全に」「すべて」移せるとは書かない（§7・§8）
- **未出荷の約束**: 自律エージェント、予定の自動変更、BYO AI、動く `docker compose up`、SSO・監査ログ
- **AI PMO**: ワークスペース単位の段階公開中のため LP の機能として書かない
- **石・ケルン・風化の用語**: LP では「クレジット」で説明する
- **Team の確定価格**: 「目安」「準備中」と必ず併記する
- **Solo の AI 回数**: 「最大」と書く。保存と AI の自動通知が同じクレジットを消費するため
- **非公開の顧客名**


## 5. CTA とパラメータ規約

- 主要 CTA: 「**無料で始める / Start for free**」→ `/auth/login?utm_source=lp&utm_content=<cta-id>`
- `data-cta`: `nav` / `hero` / `pricing` / `final` / `footer-product` / `oss-community` / `appstore-{hero,details,final,footer}` / `googleplay-{hero,details,final,footer}` / `teams-migration-banner` / `teams-migration-mail` / `teams-migration-detail`（ストアは外部リンクのため UTM なし）（フッターアイコン・コミュニティは要望受付ワークスペース招待）
- Expedition の問い合わせは既存の相談窓口（`https://moru.tech/#consultation`）へ。Teams 移行は無料相談の予約ページ（TimeRex）とメール（`info@orikata.co.jp`）
- Android 版は日本でのみ配信しているため、英語のストア導線と FAQ には「Japan only」/「日本でのみ配信」を添える。配信国を広げたら外す
- ヒーローと最終 CTA は公式のストアバッジ（`public/badges/`。App Store は Apple の Marketing Tools、Google Play は Partner Marketing Hub から取得）。言語ごとにバッジを出し分け、改変せず同じ高さ（44px）で並べ、周囲に高さの 1/4 以上の余白をとる。差し替えるときは配布元の最新版を使う。「スマホと PC」のカードとフッターはテキストリンク。フッターに Apple・App Store・Google Play・Microsoft Teams の商標表記と、Microsoft と提携していない旨を置いている

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
- **引き継ぎ**: 見出しで「会話履歴・メディアを引き継いで移行できます」と伝える（移行の一番の価値のため、2026-11-05 にユーザー判断で変更）。引き継ぎは問い合わせ後に運営側が行う個別サポートで、利用者が自分で使う取り込み機能は提供しない方針。「完全に」「すべて」は書かない。専用ページ `/teams/migration`（§8）では、後から期待との食い違いにならないよう、エクスポートで残らない情報（匿名化される投稿者・返信関係・OneDrive リンクのみの添付）も示す
- **表現の制約**: 終わるのは「個人向け Teams のコミュニティ機能」。企業・学校向けの Teams 全体が終わるように書かない。Microsoft と提携しているように書かない
- **問い合わせ**: 「まずはお問い合わせください」は無料相談の予約ページ（TimeRex、`https://timerex.net/s/dongmin.park_471b/579387d1/`）へ直接リンクする（UTM なし）。並べて `info@orikata.co.jp` 宛ての `mailto:`（件名「Teams コミュニティからの移行の相談」）のホローボタンを置く。予約にもメールにも種別がないため、注記で「Teams 移行」と書いてもらう
- **SEO**: トップページは `meta description` に一文と FAQ（JSON-LD 含む）に 1 問だけ。検索広告と「Teams コミュニティ 廃止 / 終了 / 代替 / 移行」の受け皿は専用ページ `/teams/migration`（§8）が担う
- **専用ページへの導線**: 告知の本文の下に `/teams/migration` へのテキストリンク（`data-cta="teams-migration-detail"`）を置く。問い合わせボタンとメールはそのまま残す
- **撤去手順**: `index.html` の `#teams-migration` セクション（専用ページへのリンクを含む）、FAQ の Teams の 1 問（HTML と JSON-LD の両方）、`meta description` の Teams の一文、`cairn-lp.css` の「campaign」ブロックを消し、`apps/web/src/app/page.test.tsx` の該当テストと本節を更新する


## 8. Teams 移行の専用ページ `/teams/migration`（2026-11-05〜）

Google 検索広告「Cairn | Teams移行支援 | 検索 | 2026-11」の遷移先。広告の最終ページ URL の変更は広告アカウント側で行う。

### 配信

- `apps/web/src/app/teams/migration/route.ts` が `public/teams-migration.html` を読み、`<!-- @teams-... -->` の目印を `src/lib/lp/teams-migration-content.ts` の内容に差し替え、`injectPublicPageHeadScripts()`（PostHog・Google 広告タグ）を通して返す。トップページと同じ `cairn-lp.css` / `cairn-lp.js` を使い、デザイン・日英切り替え・テーマはトップページと共通（ページ固有のスタイルは `cairn-lp.css` の `tm-` ブロック）
- 未ログインでも、ログイン済みでもそのまま表示する（middleware の公開ルート。`/` と違い `/chats` へは飛ばさない）。sitemap に載せる
- タイトルは `<html data-title-ja / data-title-en>` から言語ごとに切り替える

### 状況で変わる文言の更新

`teams-migration-content.ts` だけを書き換える。画面の FAQ と JSON-LD は同じ配列から作るので二重に書かない。

| 変わったこと | 直す場所 |
|---|---|
| 引き継ぎの進め方が変わった | `TEAMS_MIGRATION_SUPPORT`、FAQ「過去のメッセージは移せますか？」「画像や PDF も移行できますか？」、HTML の「過去データを引き継ぐ」の導入文と「移行までの流れ」4、§4 の「書いてはいけない」 |
| エクスポートの解析結果が変わった | `TEAMS_EXPORT_FINDINGS` と `TEAMS_EXPORT_FINDINGS_CHECKED_AT` |
| Microsoft の告知（時期・範囲）が変わった | HTML の「Teams コミュニティの終了について」と確認日、FAQ「いつまでに移行すべきですか？」、meta description |

### 事実の根拠（2026-11-05 確認）

| 記載 | 根拠 |
|---|---|
| 2026年12月以降、個人使用の Teams のコミュニティが使えなくなる。職場・学校の Teams には影響しない。新しいコミュニティは順次作れなくなる。メンバー・メッセージは自動で移らない | Microsoft「個人使用のための Microsoft Teams のコミュニティは廃止されます」（`support.microsoft.com/{ja-jp,en-us}/teams/free/communities/communities-deprecation`）。終了日は明記されていない |
| 退出・削除されるとエクスポートできない。エクスポートはコミュニティに参加している Microsoft アカウントで行う | 同上と「Microsoft Teams 無料版でデータをエクスポートまたは削除する」（`.../teams/free/settings/export-or-delete-your-data-in-microsoft-teams-free`） |
| 本文・投稿日時は取得可、画像・動画は含まれる、一部の投稿者は匿名化、返信の親子関係は失われる、PDF などは OneDrive リンクのみの場合がある | 実際のコミュニティのエクスポートを解析した結果（2026-11） |
| 無料プランの範囲（100GB・1ファイル 50MB、Solo ¥300） | §4 の表と同じ |
| 招待はリンク、アカウントは Google / Apple / メール。Teams のメンバー一覧の自動取り込みはない | `/api/workspaces/invites`、ログイン画面 |
| 相談は 60 分・無料・Google Meet | Moru の相談ページ（`moruit.com/#consultation`）の「エンジニア1時間無料相談」「60分 / 無料」「Google Meet 自動生成」。初回に限らず相談料はかからない表記 |

### 相談の導線

- 第一の CTA は TimeRex の予約ページへ直接（`https://timerex.net/s/dongmin.park_471b/579387d1/`、`utm_*` 付き）。Moru の相談ページの「予約カレンダーを開く」と同じ予約ページで、内容は「エンジニア1時間無料相談」（汎用。Teams 移行専用の枠ではない）。担当は Moru のエンジニアで、Teams 移行の相談にも対応できるため、フォームを 1 段飛ばせる直接予約を選んだ。専用の枠を作ったら URL を差し替える
- 予約フォームに相談種別を事前入力できないため、本文で「Teams からの移行の相談であることをお知らせください」と書く
- 相談ページ（`moruit.com/?…&utm_content=teams-page#consultation`）へのテキストリンクとメール（`info@orikata.co.jp`）を残す。トップページの告知・Expedition の導線は変えていない

### 計測（PostHog）

`data-page="teams-migration"` のページでは `lp_cta_clicked` の代わりに次を送る（`cairn-lp.js`）。

| イベント | いつ | 主なプロパティ |
|---|---|---|
| `teams_migration_lp_view` | 表示時 | `source_page` `lp_lang` `utm_source` `utm_medium` `utm_campaign` `utm_content` |
| `teams_migration_consultation_click` | 相談 CTA（TimeRex / 相談ページ） | 上記 + `cta_location`（`hero` / `consult` / `consult-alt`）+ `destination`（`timerex` / `moru`） |
| `teams_migration_signup_click` | 「Cairn を無料で試す」 | 上記 + `cta_location` + `destination=signup` |
| `teams_migration_email_click` | メール | 上記 + `cta_location` + `destination=email` |

- 送るのはページのパス・CTA の位置・遷移先の種類・流入時の UTM だけ。予約内容・フォーム入力は送らない
- PostHog の SDK が自動で付ける `$current_url` `$referrer` `$initial_*` や流入パラメータには広告のクリック ID（`gclid` `gad_source` `gbraid` `fbclid` など）が入るため、このページでは SDK の `before_send` で取り除く（`$pageview` を含む全イベント）。UTM は残す。ページの URL は書き換えないので、Google 広告タグは `gclid` をそのまま読める
- **予約完了は計測していない**。TimeRex は予約完了ページの Google Analytics 連携・Google 広告のコンバージョンタグ設置に対応しているが、どちらもプレミアムプラン限定で、GTM と予約後のリダイレクトには対応していない（TimeRex ヘルプ「広告コンバージョンタグ設置」「Google Analytics連携」）。それまでは `teams_migration_consultation_click`（`destination=timerex`）を**暫定のコンバージョン候補**として扱い、予約完了数とは別物として報告する。予約完了を計測するなら、TimeRex のプレミアムプランで広告のコンバージョンタグ（コンバージョン ID とラベル）を設定する

### 広告ポリシーと表現

- Cairn が Microsoft の公式移行先・提携先・認定サービスだと読める表現を使わない。ヒーロー直下の注記・フッターの商標表記に「Microsoft と提携しておらず、公式移行先・認定サービスではない」と書く
- 「Teams」は終了する機能の説明（記述的な使用）に限る。Microsoft のロゴ・配色・画面は使わない
- 引き継ぎは「お問い合わせのうえで私たち（運営側）が行う」と書き、利用者が自分で操作して移せるように読める表現を使わない。エクスポートで残らない情報（匿名化される投稿者・返信関係・OneDrive リンクのみの添付）は、誤認とトラブルを避けるため必ず併記する

### 本番反映後の確認

1. 未ログインのブラウザで `https://oss-cairn.com/teams/migration` が表示される（ログイン画面へ飛ばない）。ログイン済みでも表示される
2. ページのソースに canonical・OGP・JSON-LD があり、`https://oss-cairn.com/sitemap.xml` に載っている
3. `?utm_source=google&utm_medium=cpc&gclid=test` を付けて開き、PostHog の Live events に `teams_migration_lp_view`（UTM 付き・gclid なし）が届く。相談・無料登録・メールの各ボタンで対応するイベントが 1 回ずつ届く
4. Google 広告タグ（`LP_GOOGLE_ADS_TAG_ID`）が `<head>` に入っている。Tag Assistant でコンバージョンリンカーが `gclid` を保存している
5. TimeRex・相談ページ・メール・`/auth/login` へ遷移できる
6. トップページの告知から専用ページへ移れ、告知の問い合わせボタン・メールも従来どおり動く
7. 日英切り替え・スマートフォン表示
8. 広告の最終ページ URL を `https://oss-cairn.com/teams/migration` に変え、広告のポリシー審査が通る

### 撤去手順

`apps/web/src/app/teams/migration/`、`public/teams-migration.html`、`src/lib/lp/teams-migration-content.ts`(+test)、`cairn-lp.css` の `tm-` ブロック、`cairn-lp.js` の `teams-migration` 分岐、middleware の `isCampaignRoute`、sitemap の行、トップページ告知のリンク（§7）を消す。URL を残す場合はトップページへリダイレクトする。
