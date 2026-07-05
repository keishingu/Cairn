import type { ExpoConfig } from 'expo/config'

// APP_VARIANT でアプリ名・bundle ID を分岐し、同一端末に
// 開発版・プレビュー版・本番版を共存インストールできるようにする。
// eas.json の各ビルドプロファイルが APP_VARIANT を注入する。
// ローカル（pnpm ios / android、APP_VARIANT 未設定）は development として扱う。
// 詳細は docs/mobile-store-release.md を参照
type Variant = 'development' | 'preview' | 'production'

// 未設定・空文字は development として扱い、想定外の値は早期に失敗させる
const rawVariant = process.env['APP_VARIANT'] || 'development'
if (rawVariant !== 'development' && rawVariant !== 'preview' && rawVariant !== 'production') {
  throw new Error(`APP_VARIANT が不正です: "${rawVariant}"（development / preview / production のいずれか）`)
}
const APP_VARIANT = rawVariant as Variant

const VARIANTS: Record<Variant, { name: string; iosBundleId: string; androidPackage: string }> = {
  development: { name: 'Cairn (dev)', iosBundleId: 'com.oss-cairn.dev', androidPackage: 'com.oss_cairn.dev' },
  preview: { name: 'Cairn (preview)', iosBundleId: 'com.oss-cairn.preview', androidPackage: 'com.oss_cairn.preview' },
  // 本番の ID は app.json 時代の値を維持する（ストア公開後は変更不可）
  production: { name: 'Cairn', iosBundleId: 'com.oss-cairn', androidPackage: 'com.oss_cairn' },
}

const variant = VARIANTS[APP_VARIANT]

const config: ExpoConfig = {
  name: variant.name,
  slug: 'cairn',
  scheme: 'cairn',
  version: '1.0.0',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0F14',
  },
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: variant.iosBundleId,
    infoPlist: {
      NSUserNotificationsUsageDescription: 'プロジェクトのメンションやタスクの更新を通知します',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: variant.androidPackage,
  },
  plugins: ['expo-router', 'expo-secure-store'],
  extra: {
    router: {},
    eas: {
      projectId: '46195650-8dc8-4c73-9b32-c1b5134c0326',
    },
  },
  owner: 'keishingu',
  // version に追従させる（1.0.0 のうちは従来の固定値 "1.0.0" と同じ解決結果になり、
  // 既存の EAS Update プレビュー・dev client と互換）。
  // version を上げる = runtime が変わる = ネイティブ再ビルド（ストア更新）が必要
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/46195650-8dc8-4c73-9b32-c1b5134c0326',
  },
}

export default config
