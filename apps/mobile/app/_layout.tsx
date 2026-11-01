import React from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { openDatabaseAsync } from 'expo-sqlite'
import { getNetworkStateAsync } from 'expo-network'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { shouldClearAccountCache } from '../lib/account-cache'
import { queryClient } from '../lib/query-client'
import { loadStoredSession, supabase } from '../lib/supabase'
import { LocaleProvider } from '../components/locale-provider'
import { SessionContext } from '../lib/session-context'
import { shouldAttemptNetworkRequest } from '../lib/network-state'
import {
  deleteOfflineCacheForUser,
  setOfflineCacheUser,
  startOfflineCache,
} from '../lib/offline-cache-store'
import { isPostAuthNavigationPending } from '../lib/auth-navigation'
import type { Session } from '@supabase/supabase-js'

// SecureStore からのセッション復元が終わるまでスプラッシュを表示したままにする。
// 復元前にルートを描画するとログイン画面が一瞬表示されてしまう
void SplashScreen.preventAutoHideAsync()

// SQLiteProvider は開けないと描画中に例外を投げるか何も描画しなくなるため使わない。
// 端末キャッシュは表示の補助なので、起動を待たせず、失敗しても止めない
startOfflineCache((name) => openDatabaseAsync(name))

function AuthGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const [session, setSession] = React.useState<Session | null | undefined>(undefined)
  const knownUserId = React.useRef<string | null | undefined>(undefined)
  const segments = useSegments()
  const router = useRouter()

  const applySession = React.useCallback((event: string, newSession: Session | null) => {
    const nextUserId = newSession?.user.id ?? null
    const previousUserId = knownUserId.current
    if (previousUserId !== undefined && shouldClearAccountCache(event, previousUserId, nextUserId)) {
      queryClient.clear()
      if (previousUserId) deleteOfflineCacheForUser(previousUserId)
    }
    knownUserId.current = nextUserId
    setOfflineCacheUser(nextUserId)
    setSession(newSession)
  }, [])

  React.useEffect(() => {
    const applyInitialSession = (session: Session | null) => {
      if (knownUserId.current === undefined) applySession('INITIAL_SESSION', session)
    }

    // アクセストークンが切れていると、圏外の getSession は更新の再試行で最大 30 秒止まる。
    // 明示的に圏外なら保存済みセッションで先に進み、キャッシュを表示できるようにする
    void getNetworkStateAsync()
      .then(async (state) => {
        if (shouldAttemptNetworkRequest(state)) return
        const stored = await loadStoredSession()
        if (stored) applyInitialSession(stored)
      })
      .catch((error: unknown) => console.warn('[auth] 圏外の起動準備に失敗しました:', error))

    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        // 通信できず更新に失敗しただけなら、サインアウト扱いにしない（保存は残っている）
        const session =
          data.session ??
          (error && isAuthRetryableFetchError(error) ? await loadStoredSession() : null)
        applyInitialSession(session)
      })
      .catch((error: unknown) => {
        console.error('[auth] セッションを復元できませんでした:', error)
        applyInitialSession(null)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // 圏外の更新失敗でも null が届く。上の getSession 側で区別するのでここでは適用しない
      if (event === 'INITIAL_SESSION' && !newSession) return
      applySession(event, newSession)
    })

    return () => subscription.unsubscribe()
  }, [applySession])

  React.useEffect(() => {
    if (session === undefined) return

    // ルートの初回描画後にスプラッシュを閉じる（描画前に閉じると空白が見える）
    void SplashScreen.hideAsync()

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      if (isPostAuthNavigationPending()) return
      router.replace('/(app)/chats')
    }
  }, [session, segments, router])

  // 復元中はルートを描画しない（スプラッシュが表示されたまま）
  if (session === undefined) return null

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <LocaleProvider>
            <Slot />
          </LocaleProvider>
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
