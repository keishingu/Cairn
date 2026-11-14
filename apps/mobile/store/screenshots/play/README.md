Play Console 用の画像素材を置く。撮影方針は ../README.md と ../../play-listing.ja.md を参照。

- `feature-graphic.png`: フィーチャー グラフィック（1024×500）
- `phone/01〜05-*.png`: スマートフォン用スクリーンショット（1080×1920）。本番 API 向けの `production-apk` ビルドを実機に入れ、審査用アカウントのデモ用ワークスペース「みなとデザイン室」（架空の内容、表示名「高橋 葵」）で撮影した
- `background.png`: スクリーンショットの背景。Codex の画像生成で作った文字なしの画像
- `compose.sh`: 撮影した画像からステータスバーとナビゲーションバーを切り落とし、背景に重ねて見出しを ImageMagick で入れる。見出しは画像生成に任せず、フォント（ヒラギノ角ゴシック）で入れる

```bash
./compose.sh raw.png "見出し" "サブコピー" out.png
```

切り落とす高さ（上 87px / 下 126px）は撮影に使った端末のステータスバー・ナビゲーションバーの高さ。別の端末で撮るときは `adb shell dumpsys window | grep -E "statusBars|navigationBars"` で確認して直す。
