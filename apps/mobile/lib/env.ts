import Constants from 'expo-constants'

// Metro バンドラーの接続先ホスト = 開発マシン。
// iOS シミュレータでは localhost、実機では開発マシンの LAN IP、
// Android エミュレータでは 10.0.2.2 が返るため、環境ごとの IP 書き換えが不要になる。
function devHost(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  if (!host) {
    throw new Error(
      'Metro の接続先ホストを取得できませんでした。' +
        '.env.local で EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_API_BASE_URL を明示的に設定してください',
    )
  }
  return host
}

// 環境変数が設定されていれば常に優先する（検証環境など固定 URL に向ける場合）。
// 未設定の場合、開発ビルドでは Metro の接続先ホストから導出し、
// リリースビルドでは設定漏れとしてエラーにする。
function resolveBaseUrl(name: string, value: string | undefined, devPort: number): string {
  if (value) return value
  if (!__DEV__) {
    throw new Error(`${name} が設定されていません。ビルド時の環境変数を確認してください`)
  }
  return `http://${devHost()}:${devPort}`
}

export const SUPABASE_URL = resolveBaseUrl(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env['EXPO_PUBLIC_SUPABASE_URL'],
  54321,
)

export const API_BASE_URL = resolveBaseUrl(
  'EXPO_PUBLIC_API_BASE_URL',
  process.env['EXPO_PUBLIC_API_BASE_URL'],
  3128,
)

// 接続先の取り違え（古い .env.local の値が自動導出を上書きしている等）を
// すぐ発見できるよう、開発時は解決結果を必ずログに出す
if (__DEV__) {
  console.log(`[env] SUPABASE_URL=${SUPABASE_URL} API_BASE_URL=${API_BASE_URL}`)
}
