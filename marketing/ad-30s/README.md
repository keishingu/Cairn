# Cairn 30 秒広告（ad-30s）

LP（[`apps/web/public/index.html`](../../apps/web/public/index.html)）の文言・配色・フォントを元にした 30 秒のモーショングラフィック広告の素材一式。動画ファイル自体はリポジトリに含めず、ここから再生成する。

- 出力: 1920×1080 / 60fps / H.264 + AAC ステレオ（BGM・効果音付き）
- 映像: `index.html` の `render(t)` が時刻 `t` の画面を決定的に描く。Playwright で 1 フレームずつ撮影して ffmpeg で動画化する
- 音声: `audio.py` が 120 BPM の BGM と効果音を numpy で合成する。効果音の時刻は `index.html` のタイムラインと手で合わせている

## 書き出し

必要なもの: Node.js、Playwright（Chromium）、Python 3 + `numpy` `scipy` `imageio-ffmpeg`（または `ffmpeg` コマンド）

```bash
pip install numpy scipy imageio-ffmpeg
npm i -g playwright   # 未導入の場合。PLAYWRIGHT_MODULE で index.mjs のパスを直接指定してもよい
./marketing/ad-30s/build.sh   # → marketing/ad-30s/out/cairn-ad-30s.mp4
```

- 初回に `fetch_fonts.py` が Geist / Geist Mono / Noto Sans JP を Google Fonts から `fonts/` に取得する（コミットしない）
- 4 並列で約 5 分（4 コア）。並列数は `JOBS`、ffmpeg は `FFMPEG` で上書きできる
- 静止画で確認するだけなら `node marketing/ad-30s/render.mjs --preview 4.1 12.5 28` → `preview/`

## 構成

| 秒 | シーン | 内容 |
|---|---|---|
| 0–3.5 | A 課題 | チャットとタスク管理が別ツール → 転記 → 古い履歴が読めない |
| 3.5–6 | B ロゴ | 3 つの石（ロゴの角丸バー）が落ちて積み上がり、ワードマーク |
| 6–9 | C ヒーロー | 「無料でチャットも、プロジェクト管理も。」と LP のチェック項目 |
| 9–13 | D チャット → タスク | ☐ 付きの発言がタスクになり、完了チェックが双方向で同期 |
| 13–16.5 | E カレンダー / カンバン | 2026年6月のイベントがカンバンの列へ組み替わる |
| 16.5–19.5 | F 無制限 | 無制限 ×3 → 10GB → 期限なし・カード登録なし |
| 19.5–23 | G 比較・料金 | 無料で読める履歴の比較（LP の比較表・注記と同じ）、Free ¥0 / Solo ¥300 |
| 23–27 | H AI / MCP / OSS | AI アシスタント、Claude・Cursor から MCP、Apache-2.0 |
| 27–30 | I エンドカード | ロゴ、コピー、無料で始める / App Store、oss-cairn.com |

## 変更時の注意

- **料金・無料枠・比較の数値は LP と一致させる。** LP の文言を変えたら、この広告のシーン C / F / G / I も見直す
- シーンの時刻を動かしたら `audio.py` の効果音・キック（`slam` など）と `index.html` の `SH`（カメラの揺れ）・`FL`（フラッシュ）・`WIPES` も合わせる
- アプリ画面のモック（チャット・カレンダーの人名や予定）は LP のデモデータと同じ。AI の回答文は広告用の例文
