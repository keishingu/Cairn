'use client'

import React from 'react'
import {
  MONTH_NAV_LOCK_MS,
  MONTH_WHEEL_THRESHOLD,
  monthStepFromSwipe,
  monthStepFromWheel,
  wheelDeltaToPixels,
} from './calendar-period-gesture'

export function useMonthWheelNavigation(
  ref: React.RefObject<HTMLElement | null>,
  onStep: (step: -1 | 1) => void,
  enabled: boolean,
) {
  const onStepRef = React.useRef(onStep)
  onStepRef.current = onStep

  React.useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let accum = 0
    let lockedUntil = 0
    const onWheel = (event: WheelEvent) => {
      const deltaX = wheelDeltaToPixels(event.deltaX, event.deltaMode)
      const deltaY = wheelDeltaToPixels(event.deltaY, event.deltaMode)
      if (monthStepFromWheel(deltaX, deltaY) === 0) return
      event.preventDefault()
      const now = Date.now()
      if (now < lockedUntil) {
        accum = 0
        return
      }
      accum += deltaY
      if (Math.abs(accum) < MONTH_WHEEL_THRESHOLD) return
      const step: -1 | 1 = accum > 0 ? 1 : -1
      accum = 0
      lockedUntil = now + MONTH_NAV_LOCK_MS
      onStepRef.current(step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [enabled, ref])
}

export function useMonthSwipeNavigation(onStep: ((step: -1 | 1) => void) | undefined) {
  const onStepRef = React.useRef(onStep)
  onStepRef.current = onStep
  const startRef = React.useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = React.useRef(false)

  const onTouchStart = (event: React.TouchEvent) => {
    if (!onStepRef.current) return
    const touch = event.changedTouches[0]
    if (!touch) return
    startRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = startRef.current
    startRef.current = null
    const stepFn = onStepRef.current
    const touch = event.changedTouches[0]
    if (!start || !touch || !stepFn) return
    const step = monthStepFromSwipe(touch.clientX - start.x, touch.clientY - start.y)
    if (step === 0) return
    suppressClickRef.current = true
    stepFn(step)
  }

  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { onTouchStart, onTouchEnd, onClickCapture }
}
