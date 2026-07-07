#!/usr/bin/env bash
# 参考ショート動画をダウンロードし、解析用素材（メタデータ・サンプルフレーム・字幕）を展開する。
# 使い方: analyze_reference.sh <URL> <出力ディレクトリ>
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "使い方: $0 <URL> <出力ディレクトリ>" >&2
  exit 1
fi

URL="$1"
OUT="$2"
mkdir -p "$OUT/frames"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "エラー: yt-dlp が見つかりません。'pip3 install yt-dlp' を実行してください。" >&2
  exit 1
fi

FFMPEG="${FFMPEG_PATH:-}"
if [ -z "$FFMPEG" ]; then
  FFMPEG="$(command -v ffmpeg || true)"
fi
if [ -z "$FFMPEG" ]; then
  FFMPEG="$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
fi
if [ -z "$FFMPEG" ]; then
  echo "エラー: ffmpeg が見つかりません。'pip3 install imageio-ffmpeg' を実行するか FFMPEG_PATH を設定してください。" >&2
  exit 1
fi

echo "==> ダウンロード: $URL"
# 失敗時はエラーをそのまま表示して終了する（サイレントフォールバック禁止）
yt-dlp \
  --no-playlist \
  -f "bv*[height<=1920]+ba/b[height<=1920]/b" \
  --merge-output-format mp4 \
  --write-info-json \
  --write-auto-subs --write-subs --sub-langs "ja,en" \
  -o "$OUT/source.%(ext)s" \
  "$URL"

# yt-dlp の出力ファイル名を確定させる
SRC="$(find "$OUT" -maxdepth 1 -name 'source.*' ! -name '*.json' ! -name '*.vtt' ! -name '*.srt' | head -1)"
if [ -z "$SRC" ]; then
  echo "エラー: 動画ファイルの取得に失敗しました。" >&2
  exit 1
fi
mv "$OUT"/source.*.info.json "$OUT/info.json" 2>/dev/null || \
  mv "$OUT"/source.info.json "$OUT/info.json" 2>/dev/null || true

echo "==> サンプルフレーム抽出 (1fps, 幅360px)"
"$FFMPEG" -hide_banner -loglevel error -i "$SRC" \
  -vf "fps=1,scale=360:-2" -q:v 4 "$OUT/frames/f%03d.jpg"

echo "==> 完了"
echo "動画:        $SRC"
[ -f "$OUT/info.json" ] && echo "メタデータ:  $OUT/info.json"
ls "$OUT"/*.vtt >/dev/null 2>&1 && echo "字幕:        $(ls "$OUT"/*.vtt | tr '\n' ' ')"
echo "フレーム:    $OUT/frames/ ($(ls "$OUT/frames" | wc -l | tr -d ' ')枚)"
