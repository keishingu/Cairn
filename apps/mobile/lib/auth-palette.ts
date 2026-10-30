import { DEFAULT_APP_ICON_VARIANT } from './app-icon'
import { createThemePalette } from './theme'

// 未ログイン画面は外観設定を読めないため、アプリアイコンと同じ環境別の既定配色にする
// （開発系は白＋青、本番は紺＋緑）。どの環境のアプリかを開いた瞬間に見分けられる。
export const AUTH_THEME = DEFAULT_APP_ICON_VARIANT.theme
export const AUTH_PALETTE = createThemePalette(AUTH_THEME, DEFAULT_APP_ICON_VARIANT.accentId)
