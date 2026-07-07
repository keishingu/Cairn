---
name: vertical-video
description: >-
  Instagram Reels / TikTok / YouTube Shorts 向けの縦型（9:16, 1080x1920）マーケティング動画を生成する。
  参考ショート動画URLを解析して構成の勝ちパターンを抽出し、プロダクトの機能・PostHogの利用データから訴求軸を決め、
  HTML+CSSアニメーション → Playwright → ffmpeg のパイプラインで MP4 を出力する。
  トリガー: 縦型動画 / ショート動画 / Reels / TikTok / Shorts / 広告動画 / 動画生成
---

# 縦型マーケ動画生成 (vertical-video)

参考ショート動画を解析し、Cairn の広告用縦型動画（9:16 MP4）を生成する Skill。

## 成果物

- `1080x1920 / 30fps / H.264 + AAC / MP4`（Instagram Reels・TikTok・YouTube Shorts 共通で入稿可能）
- 尺は 15〜30 秒を基本とする（参考動画の尺に合わせて調整）
- 中間成果物として「参考動画の構造分解」「訴求軸の根拠」「絵コンテ」を必ずユーザーに提示する

## プロダクト文脈（Cairn）

- **Cairn**: 山岳部の山行計画を起点とした、プロジェクト管理・チャット・カレンダー・ファイル管理・ギャラリー・AI アシスタントを統合したコラボレーションアプリ
- 主なターゲット: 山岳部・アウトドアサークル・少人数チーム（LINE グループ + スプレッドシート + カレンダーの寄せ集め運用で計画情報が散らばっている層）
- 訴求の素材: `README.md` / `docs/lp-content-redesign.md`（LP の訴求コピー設計）/ `docs/README.md` のプロダクト仕様一覧
- 実アプリ映像: Web 版（`apps/web`, localhost:3128。モバイルシェルは UA で出し分け）を Playwright で撮影して使う。ブランドトーンは `apps/web/src/app/globals.css` のデザイントークンを正とする。CTA の URL は本番 `oss-cairn.com`

## ワークフロー

### Phase 0: ツール準備

```bash
pip3 install yt-dlp imageio-ffmpeg          # 参考動画DL + フル機能ffmpeg（libx264/aac入り）
npm install --prefix .claude/skills/vertical-video/scripts   # playwright-core
```

- Chromium は Playwright 用がプリインストール済み（`/opt/pw-browsers/`）。`playwright install` は実行しない
- `ffmpeg` が PATH にない環境では、各スクリプトが imageio-ffmpeg の静的バイナリを自動検出する

### Phase 1: 参考動画の解析

ユーザーから渡された参考動画 URL を解析する。詳細は [references/reference-analysis.md](references/reference-analysis.md)。

```bash
bash .claude/skills/vertical-video/scripts/analyze_reference.sh <URL> <出力ディレクトリ>
```

出力された `info.json`（メタデータ）・`frames/`（1fps サンプルフレーム画像）・字幕を読み、**構造分解**（フック・展開・CTA のタイミング、カット割り、テキストオーバーレイの様式、テンポ）をまとめてユーザーに提示する。

**ダウンロードに失敗した場合（Instagram はログイン必須のことが多い・ネットワークポリシーで遮断されることもある）は、エラー内容を隠さず伝え、動画ファイルの直接提供か別 URL をユーザーに依頼する。勝手に「URL を見ずに一般論で作る」フォールバックをしない。**

### Phase 2: 訴求内容の決定（機能 × PostHog × 参考動画）

「ユーザーに刺さる内容」は憶測で決めず、次の 3 つの解析結果を突き合わせて決める。詳細は [references/messaging.md](references/messaging.md)。

1. **機能解析**: プロダクトのドキュメント・実装から訴求候補となる機能・差別化点を棚卸しする
2. **PostHog 解析**: 利用データ（人気イベント・ファネル・離脱点）から「実際に使われている・刺さっている機能」を特定する。PostHog MCP ツール（ToolSearch で `posthog` を検索）→ なければ API（`POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID`）の順で試す。**どちらも利用できない場合はサイレントにスキップせず、その旨をユーザーに伝えて機能解析＋参考動画のみで進めてよいか確認する**
3. **参考動画の勝ちパターン**: Phase 1 の構造分解から「なぜこの動画は見られるのか」（フックの型・感情曲線・CTA）を抽出する

3 つを統合し、「訴求軸（1 本の動画で言うことは 1 つ）+ その根拠」をユーザーに提示する。

### Phase 3: 絵コンテ

参考動画の構造に訴求内容を流し込み、シーン表を作る:

| # | 時間 | 映像 | 画面内テキスト | ナレーション/音 |
|---|------|------|----------------|-----------------|

- 冒頭 1.5 秒以内にフック（視聴継続の理由）を置く
- 最後は CTA（`oss-cairn.com`・アカウントフォロー等）で締める
- **絵コンテはレンダリング前に必ずユーザーに確認する**（AskUserQuestion が使える環境では選択肢付きで確認する）

### Phase 4: レンダリング

詳細は [references/rendering.md](references/rendering.md)。

1. 実アプリの映像素材が必要なら、ローカルでアプリを起動して Playwright で撮影する
2. 絵コンテを 1 枚の **タイムライン HTML**（1080x1920、CSS アニメーション/WAAPI で全モーションを記述）に実装する
3. レンダリング:

```bash
node .claude/skills/vertical-video/scripts/render_video.mjs timeline.html \
  --duration 20 --fps 30 --out cairn-ad.mp4 [--audio bgm.m4a]
```

### Phase 5: 検証・納品

- `ffmpeg -i` で解像度 1080x1920・尺・コーデック（h264/aac）を確認する
- 完成 MP4 から数フレーム抽出して目視確認する（文字切れ・セーフエリア侵犯・アニメーションの破綻）
- 動画ファイルをユーザーに送付し、絵コンテとの対応・使用した訴求根拠を添える

## 注意事項

- 参考動画は**構成・テンポの参考**にとどめ、映像・音源・文言をコピーしない（著作権）
- 楽曲は権利処理済みのもののみ使う。用意がなければ無音で納品し、各プラットフォームの投稿画面で商用ライセンス楽曲を付ける運用を案内する
- プラットフォーム UI に隠れないよう、上 220px / 下 320px / 右 180px をセーフエリア外として重要な要素を置かない
