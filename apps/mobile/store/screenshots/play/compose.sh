#!/bin/zsh
# usage: compose.sh raw.png "見出し" "サブコピー" out.png
set -e
S=${0:A:h}
RAW=$1; HEAD=$2; SUB=$3; OUT=$4
BOLD="/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc"
REG="/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"
TMP=$(mktemp -d)
# 1) ステータスバー(上 87px)とナビゲーションバー(下 126px)を切り落とす
magick "$RAW" -gravity North -chop 0x87 -gravity South -chop 0x126 +repage "$TMP/body.png"
# 2) 高さ 1400px に縮小し、角を丸める
magick "$TMP/body.png" -resize x1400 "$TMP/scaled.png"
W=$(magick identify -format %w "$TMP/scaled.png"); H=$(magick identify -format %h "$TMP/scaled.png")
magick -size ${W}x${H} xc:none -fill white -draw "roundrectangle 0,0,$((W-1)),$((H-1)),44,44" "$TMP/mask.png"
magick "$TMP/scaled.png" "$TMP/mask.png" -alpha off -compose CopyOpacity -composite "$TMP/rounded.png"
# 3) 細い縁取りと影
magick "$TMP/rounded.png" \( +clone -alpha extract -morphology EdgeOut Disk:3 -background 'rgba(255,255,255,0.18)' -alpha shape \) -compose DstOver -composite "$TMP/framed.png"
magick "$TMP/framed.png" \( +clone -background black -shadow 60x28+0+18 \) +swap -background none -layers merge +repage "$TMP/shadowed.png"
# 4) 背景に配置して文字を入れる
magick "$S/background.png" \
  "$TMP/shadowed.png" -gravity North -geometry +0+430 -composite \
  -gravity North -font "$BOLD" -pointsize 66 -fill white -annotate +0+150 "$HEAD" \
  -font "$REG" -pointsize 36 -fill '#C7D2E3' -annotate +0+258 "$SUB" \
  -strip "$OUT"
rm -rf "$TMP"
echo "$OUT $(magick identify -format %wx%h "$OUT")"
