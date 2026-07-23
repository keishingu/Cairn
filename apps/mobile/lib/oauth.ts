import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import { supabase } from './supabase'
import { apiFetch } from './api-fetch'
import { resolveOAuthScheme } from './oauth-scheme'

// 認可後に WebBrowser のセッションを確実に閉じる（iOS で必要）
WebBrowser.maybeCompleteAuthSession()

export type OAuthResult = 'success' | 'cancelled'

// ネイティブの Google ログイン。
// Web のリダイレクト方式は使えないため、配布variant固有のアプリスキームを
// redirect 先にして WebBrowser で認可コードを受け取り、PKCE で交換する。
export async function signInWithGoogle(): Promise<OAuthResult> {
  // scheme を明示する。明示しないと dev ビルドで exp:// 形式や
  // スラッシュ3つの custom-scheme:///... を返すことがあり、それだと Supabase の
  // 許可リストに一致せず Site URL（web）へフォールバックして 500 になる。
  // OTA update の app config ではなく、実際にインストールされた native binary の
  // bundle/package ID から callback scheme を決める。Development Build に
  // preview update を載せた場合も、binary が登録した scheme と必ず一致する。
  const scheme = resolveOAuthScheme(Application.applicationId)
  const redirectTo = Linking.createURL('auth/callback', { scheme })
  // redirectTo はクエリを含まないため出力可。認可 URL / 戻り URL は
  // PKCE チャレンジや認可コードを含むため、クエリを除いたオリジンのみ出す。
  if (__DEV__) console.log('[oauth] redirectTo =', redirectTo)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data.url) throw new Error('OAuth の認可 URL を取得できませんでした')

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (__DEV__) {
    const landedOrigin = result.type === 'success' ? result.url.split('?')[0] : ''
    console.log('[oauth] result =', result.type, landedOrigin)
  }
  if (result.type !== 'success') {
    // ユーザーがブラウザを閉じた / キャンセルした
    return 'cancelled'
  }

  const { queryParams } = Linking.parse(result.url)
  const code = queryParams?.['code']
  if (typeof code !== 'string') {
    throw new Error('認可コードを取得できませんでした')
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) throw exchangeError

  // 初回 Google ログインでも profiles を作成する（省くと以降の全 API が 403 になる）
  const res = await apiFetch('/api/auth/setup', { method: 'POST', body: JSON.stringify({}) })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? 'プロフィールの作成に失敗しました')
  }

  // 成功時は _layout.tsx の onAuthStateChange が /(app)/projects へリダイレクト
  return 'success'
}
