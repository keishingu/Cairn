'use client'

import React from 'react'

/**
 * 入力中の Esc は編集の取り消しだけにして、パネルごと閉じない。
 * Modal（Radix）は document の capture で Esc を受けるため、より手前の window の capture で止める。
 */
export function useCancelEditOnEscape(active: boolean, onCancel: () => void): void {
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCancelRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active])
}
