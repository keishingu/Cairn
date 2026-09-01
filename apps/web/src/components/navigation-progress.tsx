// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function RouteWatcher({ onComplete }: { onComplete: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const key = `${pathname}?${searchParams.toString()}`
  const prevRef = useRef(key)
  const callbackRef = useRef(onComplete)

  useEffect(() => { callbackRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (prevRef.current !== key) {
      prevRef.current = key
      callbackRef.current()
    }
  }, [key])

  return null
}

export function NavigationProgress() {
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const tickRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeRef = useRef(false)
  const startScheduledRef = useRef(false)
  const completionPendingRef = useRef(false)

  const complete = useCallback(() => {
    if (!activeRef.current) {
      if (startScheduledRef.current) completionPendingRef.current = true
      return
    }

    activeRef.current = false
    clearTimeout(tickRef.current)
    clearTimeout(timeoutRef.current)
    setCompleting(true)
    setWidth(100)
    resetRef.current = setTimeout(() => {
      setVisible(false)
      setWidth(0)
      setCompleting(false)
    }, 380)
  }, [])

  const start = useCallback(() => {
    clearTimeout(tickRef.current)
    clearTimeout(resetRef.current)
    clearTimeout(timeoutRef.current)
    activeRef.current = true
    setCompleting(false)
    setVisible(true)
    setWidth(0)

    let w = 0
    const bump = () => {
      w = Math.min(w + (85 - w) * 0.12 + Math.random() * 4, 85)
      setWidth(w)
      tickRef.current = setTimeout(bump, 320 + Math.random() * 280)
    }
    tickRef.current = setTimeout(bump, 60)

    // Safety: auto-complete after 10 seconds
    timeoutRef.current = setTimeout(() => complete(), 10_000)
    if (completionPendingRef.current) {
      completionPendingRef.current = false
      complete()
    }
  }, [complete])

  // Intercept history.pushState to detect navigation start
  useEffect(() => {
    const orig = window.history.pushState.bind(window.history)
    window.history.pushState = (...args: Parameters<typeof orig>) => {
      startScheduledRef.current = true
      const ret = orig(...args)
      // nuqs などは useInsertionEffect 内で pushState を呼ぶ。その同期実行中に
      // start() が setState すると "useInsertionEffect must not schedule updates" になるため、
      // 状態更新を commit フェーズ外のマイクロタスクへ逃がす
      queueMicrotask(() => {
        startScheduledRef.current = false
        start()
      })
      return ret
    }
    return () => { window.history.pushState = orig }
  }, [start])

  return (
    <>
      <Suspense>
        <RouteWatcher onComplete={complete} />
      </Suspense>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: visible ? 'none' : 'opacity 0.25s ease 0.05s',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${width}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
            borderRadius: '0 2px 2px 0',
            boxShadow: '0 0 8px var(--accent)',
            transition: completing
              ? 'width 0.18s cubic-bezier(0.4, 0, 1, 1)'
              : width === 0
              ? 'none'
              : 'width 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </>
  )
}
