# レンダリングガイド

絵コンテを 1 枚の「タイムライン HTML」に実装し、`scripts/render_video.mjs` で MP4 化する。

## パイプラインの仕組み

```
timeline.html（全モーションを CSS アニメーション / WAAPI で記述）
  → Playwright(Chromium) がアニメーションを一時停止し、1フレームずつ currentTime をシークして PNG 撮影
  → ffmpeg が PNG 連番を H.264 MP4 にエンコード（--audio 指定時は AAC で BGM を多重化）
```

決定論的レンダリングなので、`setInterval` や `requestAnimationFrame` による JS 駆動アニメーションは**そのままでは動かない**。モーションは必ず次のいずれかで書く:

1. **CSS アニメーション**（`@keyframes` + `animation-delay` で絶対時刻に配置）← 基本はこれ
2. **WAAPI**（`element.animate()`。`document.getAnimations()` に載るので同様にシークされる）
3. **`window.seek(tMs)` フック**: レンダラが毎フレーム呼ぶ。カウントアップ数字や canvas 描画など、時刻 t の純関数として描けるものに使う

## タイムライン HTML の規約

- ルートは `1080x1920` 固定。`<body>` に `width:1080px; height:1920px; overflow:hidden; margin:0` を指定する
- シーンは絶対配置のレイヤーを重ね、`animation-delay` で登場・退場時刻を制御する（シーン切替もアニメーションで表現）
- アニメーションは必ず `animation-fill-mode: both` を付ける（シーク時に開始前・終了後の状態を確定させるため）
- `animation-iteration-count: infinite` はループ演出（浮遊・点滅）に使ってよい
- Web フォントは使わない（外部リクエストはレンダリング環境で遮断されうる）。`system-ui`, `"Hiragino Sans"`, `"Noto Sans CJK JP"`, `sans-serif` を指定する
- `<video>` タグは使えない（フレームシークの対象外）。動画素材は事前に ffmpeg で PNG 連番へ分解し、`window.seek` で `<img>` の `src` を切り替えるか、静止画+Ken Burns（ズーム/パン）で代用する
- **セーフエリア**: 上 220px（アカウント名等）/ 下 320px（キャプション・操作 UI）/ 右 180px（いいね列）には重要なテキスト・ロゴを置かない

### 骨格例

```html
<style>
  body { width:1080px; height:1920px; margin:0; overflow:hidden; background:#111; }
  .scene { position:absolute; inset:0; opacity:0; animation-fill-mode:both; }
  /* シーン1: 0〜3秒 / シーン2: 3〜8秒 */
  .s1 { animation: window 3s 0s both; }
  .s2 { animation: window 5s 3s both; }
  /* 0% と 100% を必ず opacity:0 にする。fill-mode:both は
     開始前を 0% の値・終了後を 100% の値で埋めるため、
     両端が 0 でないとシーンが期間外にも表示されてしまう */
  @keyframes window { 0% { opacity:0 } 6% { opacity:1 } 94% { opacity:1 } 100% { opacity:0 } }
  /* シーン内要素の登場は「動画先頭からの絶対時刻」を delay に指定する（例: シーン2内なら 3s 以降） */
  .pop { animation: pop .4s 3.1s cubic-bezier(.2,1.4,.4,1) both; }
  @keyframes pop { from { transform:scale(.6); opacity:0 } to { transform:scale(1); opacity:1 } }
</style>
```

## 実アプリ素材の撮影

Web 版（`apps/web`, localhost:3128）の画面を素材にする場合:

```bash
# README.md の手順どおり起動（Supabase + Web）
supabase start
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```

Playwright（`scripts/node_modules` の playwright-core）でモバイルビューポート（390x844, deviceScaleFactor 3 程度）+ モバイル UA のスクリーンショットを撮り（デバイス出し分けは UA ベースなので、UA を偽装しないと PC シェルが写る）、タイムライン HTML に `<img>` で埋め込む。スマホ枠 CSS（角丸 + ベゼル）で囲むと「アプリ画面」として伝わる。撮影スクリプトはその都度書き捨てでよい。デモデータは自分のローカルワークスペースに用意する（実ユーザーのデータを写さない）。

## レンダリング実行

```bash
# 依存（初回のみ）: playwright-core
npm install --prefix .claude/skills/vertical-video/scripts

node .claude/skills/vertical-video/scripts/render_video.mjs timeline.html \
  --duration 20        # 秒（必須）
  --fps 30             # 省略時 30
  --out cairn-ad.mp4  # 省略時 out.mp4
  --audio bgm.m4a      # 任意。動画尺で自動カット（-shortest）
```

- Chromium は `/opt/pw-browsers/chromium-*/chrome-linux/chrome` を自動検出（`CHROMIUM_PATH` で上書き可）
- ffmpeg は PATH → imageio-ffmpeg の順で自動検出（`FFMPEG_PATH` で上書き可）
- 20 秒 @30fps ≒ 600 フレームで数分かかる。まず `--fps 10 --duration 5` などでラフを確認してから本番設定で回すと速い

## 検証

```bash
FF="${FFMPEG_PATH:-$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')}"
"$FF" -i cairn-ad.mp4 2>&1 | grep -E 'Duration|Stream'   # 1080x1920 / h264 / aac / 尺
"$FF" -i cairn-ad.mp4 -vf fps=1/4 -q:v 3 check_%02d.jpg  # 4秒ごとに抽出して目視
```

抽出したフレームを Read で確認し、文字切れ・セーフエリア侵犯・タイミングずれがないかチェックしてから納品する。
