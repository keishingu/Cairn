'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

function MobileHandoffInner() {
  const params = useSearchParams()
  const [debug, setDebug] = useState<string[]>([])
  const [next, setNext] = useState<string | null>(null)
  const log = (msg: string) => setDebug(prev => [...prev, msg])

  useEffect(() => {
    const rawRedirect = params.get('redirect') ?? '/projects'
    const redirect = isSafeRedirect(rawRedirect) ? rawRedirect : '/projects'
    log(`redirect=${redirect}`)

    // トークンは URL フラグメント（#at=...&rt=...）で受け取る。
    // フラグメントはサーバーに送信されないためアクセスログに残らない。
    const hash = window.location.hash.slice(1)
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('at')
    const refreshToken = hashParams.get('rt')
    log(`hasTokens=${!!accessToken && !!refreshToken}`)

    if (!accessToken || !refreshToken) {
      log('no tokens -> /auth/login')
      setNext('/auth/login')
      return
    }

    // フラグメントからトークンを消去（履歴・画面表示に残さない）
    history.replaceState(null, '', window.location.pathname + window.location.search)

    const supabase = createClient()
    log('calling setSession...')
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        log(`setSession resolved: error=${error?.message ?? 'none'} user=${data.session?.user.id ?? 'none'}`)
        if (error) {
          log('setSession error -> /auth/login')
          setNext('/auth/login')
          return
        }
        log(`ready to navigate to ${redirect}`)
        setNext(redirect)
      })
      .catch((e: unknown) => {
        log(`setSession threw: ${e instanceof Error ? e.message : String(e)}`)
        setNext('/auth/login')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {debug.join('\n')}
      </pre>
      {next && (
        <button onClick={() => window.location.replace(next)} style={{ marginTop: 16, padding: '10px 16px' }}>
          進む（{next}）
        </button>
      )}
    </div>
  )
}

export default function MobileHandoffPage() {
  return (
    <Suspense>
      <MobileHandoffInner />
    </Suspense>
  )
}

