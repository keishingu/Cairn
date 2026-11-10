# 広告のコンバージョン計測（ワークスペース作成）

広告から来た人がワークスペースを作ったかを測る。コンバージョンは「ワークスペースの作成」（`POST /api/auth/setup` に `workspaceName` を付けた呼び出しの成功）。

## 流れ

1. 広告のリンク先に UTM を付ける。PostHog が LP の `$pageview` から拾い、初回の流入元として人物に残す
   - 別プロジェクトのサイトに出している自社広告: `utm_medium=house_ad` とサイトごとの `utm_source` を付ける（リンクは掲載先のサイト側で管理する）
   - ChatGPT 広告: Ads Manager のリンク先を `https://oss-cairn.com/?utm_source=chatgpt&utm_medium=cpc&utm_campaign=<キャンペーン名>` にする。OpenAI はさらに `oppref`（クリック ID）を付ける
2. middleware が `oppref` を一次 Cookie `cairn_oppref`（HttpOnly・30 日）に保存する。どのページに着地しても、ログイン済みで `/chats` へ転送されるときも保存する
3. ワークスペースを作ると、`/api/auth/setup` が Inngest に `workspace/created` を送る。Cookie の `oppref`、Web かモバイルか、作成した画面の URL（クエリは除く）を含む
4. Inngest 関数 `report-workspace-conversion` が送る
   - **PostHog**: `workspace_created`（`distinct_id` は user ID、`uuid` はワークスペース ID）。プロパティは `workspace_id` / `client` / `is_first_workspace` / `from_chatgpt_ad`。ブラウザ側の `identify` で LP 訪問時の匿名 ID とつながるので、初回 UTM（`$initial_utm_source` など）で分けて集計できる
   - **OpenAI Conversions API**: `oppref` があり、本人が初めて作ったワークスペースのときだけ `registration_completed` を送る。`id` は `workspace_created:<ワークスペース ID>`。連絡先などのマッチング情報は送らない
   - 送信に失敗したら Inngest が再試行する。どちらも固定の ID を使うので二重に数えない

## 設定

- `OPENAI_ADS_PIXEL_ID` / `OPENAI_ADS_CONVERSIONS_API_KEY`: Vercel の Production のみ。Ads Manager の Conversions → Data Sources で Pixel を作って ID を控え、Conversions API キーを発行する。どちらかが無ければ Cookie 保存も送信もしない
- PostHog は既存の `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` を使う
- OpenAI のピクセル（`oaiq.min.js`）は入れていない。ログイン後の画面に第三者のスクリプトを入れないため。ビュースルーのコンバージョンは測れない

## 確認

- 疎通は Conversions API の `validate_only: true` で確かめられる。送られたイベントは `GET https://api.ads.openai.com/v1/conversions/events?pid=<PIXEL-ID>` で直近 15 分ほどを見られる（広告主 API キーが必要）
- PostHog では Funnel を「`$pageview`（初回 UTM で分割）→ `lp_cta_clicked` → `workspace_created`」で組む

## 計測できないもの

- モバイルアプリで作ったワークスペースは LP の訪問とつながらない（`client: 'mobile'` で PostHog には残る）
- 確認メールのリンクを別のブラウザで開くと、LP の匿名 ID と `oppref` の Cookie がつながらない
- 広告クリックから 30 日を過ぎた作成は ChatGPT 広告側に送らない

仕様の出典: [Conversions API](https://developers.openai.com/ads/conversions-api)、[Conversion Tracking](https://developers.openai.com/ads/conversion-tracking)
