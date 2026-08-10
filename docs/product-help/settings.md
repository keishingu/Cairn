# 設定

- 設定は `/settings/[section]` のURLで各セクションに直接アクセスできる（例: `/settings/account`、`/settings/integrations`）
- 主なセクション:
  - 個人: アカウント（`account`）、外観（`appearance`。テーマ: ライト/システム/ダーク）
  - ワークスペース: ワークスペース設定（`general`）、ワークフロー（`workflow`）、AIエージェント（`ai`）、メンバー（`members`）、連携（`integrations`）
  - 機能フラグにより、ケルン（`contributions`）、請求（`billing`）が表示される場合がある
  - 開発者情報（`developer`）
- `/settings` 単体にアクセスすると、PCでは「アカウント」セクションが、モバイルではセクション一覧が表示される
- 各設定項目の変更は即座にサーバーへ保存される（明示的な「保存」ボタンが無いものが多い）
