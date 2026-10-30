import type { ConfigContext, ExpoConfig } from 'expo/config'

export type CairnDeploymentEnvironment = 'development' | 'preview' | 'production'

interface AppVariant {
  name: string
  scheme: string
  iosBundleIdentifier: string
  androidPackage: string
}

const APP_VARIANTS: Record<CairnDeploymentEnvironment, AppVariant> = {
  development: {
    name: 'Cairn Dev',
    scheme: 'cairn-dev',
    iosBundleIdentifier: 'com.oss-cairn.dev',
    androidPackage: 'com.oss_cairn.dev',
  },
  preview: {
    name: 'Cairn Preview',
    scheme: 'cairn-preview',
    iosBundleIdentifier: 'com.oss-cairn.preview',
    androidPackage: 'com.oss_cairn.preview',
  },
  production: {
    name: 'Cairn',
    scheme: 'cairn',
    iosBundleIdentifier: 'com.oss-cairn',
    androidPackage: 'com.oss_cairn',
  },
}

export function resolveDeploymentEnvironment(value: string | undefined): CairnDeploymentEnvironment {
  return value === 'preview' || value === 'production' ? value : 'development'
}

export function resolveAppVariant(value: string | undefined): AppVariant {
  return APP_VARIANTS[resolveDeploymentEnvironment(value)]
}

// 外観設定に連動して切り替える別アイコン。名前は lib/app-icon.ts の toAlternateIconName と揃える。
// @cairn/shared の ACCENT_IDS と同期する（app.config は Expo CLI が直接読むため workspace を import しない）。
const ICON_ACCENTS = ['emerald', 'blue', 'violet', 'rose', 'pink', 'amber', 'cyan'] as const
const ICON_BACKGROUNDS = { light: '#FFFFFF', dark: '#0B1622' } as const
type IconTheme = keyof typeof ICON_BACKGROUNDS

// @cairn/shared の DEFAULT_APP_ICON_VARIANTS と同期する。開発系は白＋青、本番は紺＋緑
const DEFAULT_ICONS: Record<CairnDeploymentEnvironment, { accentId: string; theme: IconTheme }> = {
  development: { accentId: 'blue', theme: 'light' },
  preview: { accentId: 'blue', theme: 'light' },
  production: { accentId: 'emerald', theme: 'dark' },
}

const iconPath = (accentId: string, theme: IconTheme, platform: 'ios' | 'android') =>
  `./assets/app-icons/${accentId}-${theme}-${platform}.png`

export function resolveAppAssets(env: CairnDeploymentEnvironment) {
  const { accentId, theme } = DEFAULT_ICONS[env]
  const backgroundColor = ICON_BACKGROUNDS[theme]
  return {
    icon: iconPath(accentId, theme, 'ios'),
    adaptiveIcon: { foregroundImage: iconPath(accentId, theme, 'android'), backgroundColor },
    splash: { image: `./assets/app-icons/splash-${accentId}.png`, backgroundColor },
  }
}

const pascal = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const ALTERNATE_APP_ICONS = ICON_ACCENTS.flatMap((accentId) =>
  (Object.keys(ICON_BACKGROUNDS) as IconTheme[]).map((theme) => ({
    name: `${pascal(accentId)}${pascal(theme)}`,
    ios: iconPath(accentId, theme, 'ios'),
    android: { foregroundImage: iconPath(accentId, theme, 'android'), backgroundColor: ICON_BACKGROUNDS[theme] },
  })),
)

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = resolveDeploymentEnvironment(process.env['EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV'])
  const variant = APP_VARIANTS[env]
  const assets = resolveAppAssets(env)

  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? 'cairn',
    scheme: variant.scheme,
    icon: assets.icon,
    ios: {
      ...config.ios,
      icon: assets.icon,
      bundleIdentifier: variant.iosBundleIdentifier,
    },
    android: {
      ...config.android,
      package: variant.androidPackage,
      adaptiveIcon: assets.adaptiveIcon,
      // 別アイコンへ切り替えると MainActivity が無効になり、activity-alias だけが起動口になる。
      // OAuth のリダイレクト（scheme://auth/callback）を alias でも受けられるよう明示する
      intentFilters: [
        {
          action: 'VIEW',
          category: ['DEFAULT', 'BROWSABLE'],
          data: [{ scheme: variant.scheme }],
        },
      ],
      // Android の Push 通知（FCM）に必要な google-services.json。Firebase の設定ファイルは
      // リポジトリへ置かず、EAS の各 Environment に file 型のシークレットとして登録して渡す。
      // 未設定なら従来どおり（ローカルの prebuild / run:android は FCM なしで動く）
      ...(process.env['GOOGLE_SERVICES_JSON']
        ? { googleServicesFile: process.env['GOOGLE_SERVICES_JSON'] }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-splash-screen',
        { image: assets.splash.image, imageWidth: 200, resizeMode: 'contain', backgroundColor: assets.splash.backgroundColor },
      ],
      ['expo-alternate-app-icons', ALTERNATE_APP_ICONS],
    ],
  }
}
