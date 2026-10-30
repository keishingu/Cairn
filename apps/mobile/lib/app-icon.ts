import {
  DEFAULT_APP_ICON_VARIANTS,
  type AppDeploymentEnvironment,
  type AppIconVariant,
} from '@cairn/shared'

export function resolveDeploymentEnvironment(value: string | undefined): AppDeploymentEnvironment {
  return value === 'preview' || value === 'production' ? value : 'development'
}

// EXPO_PUBLIC_* はビルド時に埋め込まれる。app.config.ts と同じ値で環境を判定する
export const DEPLOYMENT_ENVIRONMENT = resolveDeploymentEnvironment(
  process.env['EXPO_PUBLIC_CAIRN_DEPLOYMENT_ENV'],
)
export const DEFAULT_APP_ICON_VARIANT = DEFAULT_APP_ICON_VARIANTS[DEPLOYMENT_ENVIRONMENT]

const pascal = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * expo-alternate-app-icons に渡す名前（app.config.ts の ALTERNATE_APP_ICONS と同じ規則）。
 * ビルドの既定アイコンと同じなら null を返し、別アイコンを解除させる。
 */
export function toAlternateIconName(
  variant: AppIconVariant,
  defaultVariant: AppIconVariant = DEFAULT_APP_ICON_VARIANT,
): string | null {
  if (variant.accentId === defaultVariant.accentId && variant.theme === defaultVariant.theme) return null
  return `${pascal(variant.accentId)}${pascal(variant.theme)}`
}
