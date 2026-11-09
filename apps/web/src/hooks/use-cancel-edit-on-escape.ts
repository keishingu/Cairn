'use client'

import React from 'react'

/**
 * 入力中の Esc は、その編集欄の取り消しだけにして、パネルごと閉じない。
 * Modal（Radix）は document の capture で Esc を受けるため、より手前の window の capture で止める。
 *
 * blur で閉じないため編集欄が同時に複数開くことがある。window の capture リスナーは
 * stopPropagation() では互いを止められないので、フォーカスが `containerRef` の中にあるときだけ反応する
 * （フォーカスがどの編集欄にもなければ素通しにし、パネルを閉じる側に任せる）。
 */
export function useCancelEditOnEscape(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  onCancel: () => void,
): void {
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const container = containerRef.current
      const focused = e.target instanceof Node ? e.target : document.activeElement
      if (!container || !focused || !container.contains(focused)) return
      e.stopPropagation()
      onCancelRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, containerRef])
}
