import * as SecureStore from 'expo-secure-store'
import { createClient, type Session } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'
import { parseStoredSession } from './offline-session'

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
// supabase-js の既定値と同じ。圏外の起動で保存済みセッションを読むために明示する
const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    storage: {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // ネイティブの Google ログインは WebBrowser で認可コードを受け取り
    // exchangeCodeForSession で交換するため PKCE フローを使う
    flowType: 'pkce',
  },
})

export async function loadStoredSession(): Promise<Session | null> {
  return parseStoredSession(await SecureStore.getItemAsync(AUTH_STORAGE_KEY))
}
