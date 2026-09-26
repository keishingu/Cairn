#!/usr/bin/env bash
# Copyright 2026 Cairn Contributors
# SPDX-License-Identifier: Apache-2.0
#
# 30 秒広告を最初から書き出す: フォント取得 → 音源合成 → 映像を 4 並列で書き出し → 結合・音声 mux
# 出力: out/cairn-ad-30s.mp4（1920x1080 / 60fps / H.264 + AAC）
# FORMAT=vertical で out/cairn-ad-30s-vertical.mp4（1080x1920、リール・ショート・ストーリーズ用）
set -euo pipefail
cd "$(dirname "$0")"

FF="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}"
export FFMPEG="$FF"
JOBS="${JOBS:-4}"
TOTAL=1800 # 30 秒 x 60fps
export FORMAT="${FORMAT:-}"
NAME="cairn-ad-30s${FORMAT:+-$FORMAT}"

mkdir -p out
[ -f fonts.local.css ] || python3 fetch_fonts.py
python3 audio.py

per=$(( (TOTAL + JOBS - 1) / JOBS ))
: > out/list.txt
pids=()
for ((j = 0; j < JOBS; j++)); do
  f0=$(( j * per )); f1=$(( f0 + per < TOTAL ? f0 + per : TOTAL ))
  node render.mjs "$f0" "$f1" "out/seg$j.mp4" &
  pids+=($!)
  echo "file seg$j.mp4" >> out/list.txt
done
for p in "${pids[@]}"; do wait "$p"; done

"$FF" -y -loglevel error -f concat -safe 0 -i out/list.txt -i out/audio.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -shortest -movflags +faststart "out/$NAME.mp4"
rm -f out/seg*.mp4 out/list.txt
echo "done: out/$NAME.mp4"
