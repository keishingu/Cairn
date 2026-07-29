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

export function resolveAppVariant(value: string | undefined): AppVariant {
  if (value === 'preview' || value === 'production') return APP_VARIANTS[value]
  return APP_VARIANTS.development
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveAppVariant(process.env['EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV'])

  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? 'cairn',
    scheme: variant.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: variant.iosBundleIdentifier,
    },
    android: {
      ...config.android,
      package: variant.androidPackage,
    },
  }
}
