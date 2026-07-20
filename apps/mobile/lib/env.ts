import Constants from 'expo-constants'
import { requireBaseUrl, resolveBaseUrl } from './resolve-base-url'

const supabaseUrl = resolveBaseUrl({
  name: 'EXPO_PUBLIC_SUPABASE_URL',
  configuredUrl: process.env['EXPO_PUBLIC_SUPABASE_URL'],
  development: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
  developmentPort: 54321,
})

const apiBaseUrl = resolveBaseUrl({
  name: 'EXPO_PUBLIC_API_BASE_URL',
  configuredUrl: process.env['EXPO_PUBLIC_API_BASE_URL'],
  development: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
  developmentPort: 3128,
})

export const SUPABASE_URL = requireBaseUrl(supabaseUrl)
export const API_BASE_URL = requireBaseUrl(apiBaseUrl)

// 接続先の取り違え（古い .env.local の値が自動導出を上書きしている等）を
// すぐ発見できるよう、開発時は解決結果を必ずログに出す。
if (__DEV__) {
  console.log(
    `[env] SUPABASE_URL=${SUPABASE_URL} (${supabaseUrl.ok ? supabaseUrl.source : 'error'}) ` +
      `API_BASE_URL=${API_BASE_URL} (${apiBaseUrl.ok ? apiBaseUrl.source : 'error'})`,
  )
}
