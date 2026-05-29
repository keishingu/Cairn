import React from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/query-client'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

function AuthGuard({ children }: { children: React.ReactNode }) {
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

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(app)/projects')
    }
  }, [session, segments, router])

  if (session === undefined) return null

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <Slot />
      </AuthGuard>
    </QueryClientProvider>
  )
}
