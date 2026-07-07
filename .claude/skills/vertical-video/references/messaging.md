# 訴求内容の決定ガイド（機能 × PostHog × 参考動画）

動画で「何を言うか」は憶測で決めない。3 つの入力を揃えてから統合する。

## 1. 機能解析（何を訴求できるか）

プロダクトのドキュメント・実装を読み、訴求候補を棚卸しする。観点:

- **差別化点**: 競合（この場合 Slack + Notion + Google カレンダーの寄せ集め、LINE グループ運用等）と比べて何が違うか
- **体験のビフォー/アフター**: その機能がないとき何に困っていて、あるとき何が変わるか（動画で映像化しやすい）
- **オンボーディングの軽さ**: 「30秒で始められる」系は縦型動画と相性が良い

Cairn での主な参照先:

- `README.md` / `CLAUDE.md` — 統合されている機能群（プロジェクト・チャット・カレンダー・ファイル・ギャラリー・AI）
- `docs/lp-content-redesign.md` — LP で検証済みの訴求コピー・ターゲット定義
- `docs/README.md` — プロダクト仕様ドキュメントの一覧

**動画 1 本 = ターゲット 1 種 × 訴求 1 つ**。幹事・リーダー向け（例: 山行計画がチャット・装備表・カレンダーごと 1 か所に集まる）とメンバー向け（例: 「あの集合時間どこだっけ」がなくなる）は別の動画にする。

## 2. PostHog 解析（何が実際に刺さっているか）

利用データから「よく使われている機能・伸びている導線・離脱の少ない体験」を特定し、訴求の裏付けにする。

### 接続方法（この順で試す）

1. **PostHog MCP ツール**: ToolSearch で `posthog` を検索。あればそれを使う
2. **PostHog API**: 環境変数 `POSTHOG_API_KEY`（Personal API Key）と `POSTHOG_PROJECT_ID` があれば直接叩く

```bash
BASE="${POSTHOG_HOST:-https://app.posthog.com}"
# よく発火しているイベント上位（直近30日）
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "$BASE/api/projects/$POSTHOG_PROJECT_ID/query/" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"kind":"HogQLQuery","query":"select event, count() as c from events where timestamp > now() - interval 30 day group by event order by c desc limit 20"}}'
# よく見られているページ
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "$BASE/api/projects/$POSTHOG_PROJECT_ID/query/" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"kind":"HogQLQuery","query":"select properties.$pathname as path, count() as c from events where event = '"'"'$pageview'"'"' and timestamp > now() - interval 30 day group by path order by c desc limit 20"}}'
```

### 見る指標

- **人気イベント / 人気ページ**: 実際に使われている機能 = 訴求しても期待外れにならない機能
- **ファネル**: 広告クリック → LP → サインアップ → ワークスペース作成 → プロジェクト作成 → 招待 → 継続利用。**通過率が高いステップの手前**が動画で押すべき瞬間
- **離脱点**: 離脱が多いステップは「動画で期待させると逆効果」な箇所。訴求から外すか、動画内で不安を先回りして潰す

### Cairn 固有の制約（Soul 条件）

`docs/ai-self-improvement-loop.md` の PostHog 運用条件に従う。見るのは **「Cairn というプロダクトの UX 摩擦・利用傾向」**であって、顧客ワークスペース内の個人の行動ではない。個人・特定組織を識別できる粒度のデータをマーケ素材の根拠にしない。

### 使えないときの扱い

MCP も API キーもない場合は**サイレントにスキップしない**。「PostHog に接続できないため、利用データの裏付けなしで機能解析＋参考動画のみで進める」ことを明示し、ユーザーに確認してから先へ進む（導入前のプロダクトでは正常な状態。その場合は機能解析の比重を上げる）。

## 3. 参考動画の勝ちパターン（どう言うか）

Phase 1 の構造分解から抽出する。内容ではなく**型**を借りる:

- フックの型（問題提起 / 損失回避 / 意外な事実 / ビフォーアフター）
- 情報の出し順と 1 カットあたりの情報量
- CTA の置き方

## 統合フォーマット（ユーザー提示用）

```markdown
## 訴求方針
- ターゲット: 山岳部・アウトドアサークルの幹事（計画を取りまとめる人）
- 訴求軸（1つ）: 「山行計画・装備分担・集合時間が、チャットごと 1 か所にまとまる」
- 根拠:
  - 機能: プロジェクト × チャット × カレンダーの統合が中核体験（README.md / docs/lp-content-redesign.md）
  - PostHog: カレンダービューと装備系タスクのイベントが上位 / LP はギャラリーセクションの滞在が長い（→ 山行写真の共有にも触れる）
  - 参考動画: 冒頭 1.5 秒のあるあるネタ（共感フック）型が有効と分析
- フック案: 「集合時間、LINE を 3 分スクロールしないと出てこない部活」
```
