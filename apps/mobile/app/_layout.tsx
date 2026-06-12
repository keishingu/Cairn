import React from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../lib/query-client'
import { supabase } from '../lib/supabase'
import { SessionContext } from '../lib/session-context'
import type { Session } from '@supabase/supabase-js'

// SecureStore からのセッション復元が終わるまでスプラッシュを表示したままにする。
// 復元前にルートを描画するとログイン画面が一瞬表示されてしまう
void SplashScreen.preventAutoHideAsync()

function AuthGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const [session, setSession] = React.useState<Session | null | undefined>(undefined)
  const segments = useSegments()
  const router = useRouter()

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  React.useEffect(() => {
    if (session === undefined) return

    // ルートの初回描画後にスプラッシュを閉じる（描画前に閉じると空白が見える）
    void SplashScreen.hideAsync()

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(app)/projects')
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
          <Slot />
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
