const path = require('path')

// packages/shared の ACCENT_IDS / DEFAULT_APP_ICON_VARIANTS と同期する（main は workspace を読み込めないため複製）。
const ACCENT_IDS = ['emerald', 'blue', 'violet', 'rose', 'pink', 'amber', 'cyan']
const THEMES = ['light', 'system', 'dark']
const DEFAULT_VARIANTS = {
  development: { accentId: 'blue', theme: 'light' },
  production: { accentId: 'emerald', theme: 'dark' },
}

// Web から受け取った外観設定を Dock / タスクバーのアイコンファイルへ解決する。
// 初期値（システム＋エメラルド）は未設定と区別できないため、ビルドの既定アイコンに戻す。
// renderer からの値なので、知らない値は null（変更しない）にする。
function resolveAppIconFile(appearance, deploymentEnv) {
  if (!appearance || typeof appearance !== 'object') return null
  const { theme, accentId, resolvedTheme } = appearance
  if (!THEMES.includes(theme) || !ACCENT_IDS.includes(accentId)) return null
  if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return null

  const variant = theme === 'system' && accentId === 'emerald'
    ? DEFAULT_VARIANTS[deploymentEnv === 'production' ? 'production' : 'development']
    : { accentId, theme: theme === 'system' ? resolvedTheme : theme }
  return path.join(__dirname, 'assets', 'app-icons', `${variant.accentId}-${variant.theme}.png`)
}

module.exports = { resolveAppIconFile }
