'use client'

import React from 'react'
import { createPortal } from 'react-dom'

const EMOJIS = [
  '👍', '❤️', '😄', '🎉', '🔥', '👏',
  '🙏', '💪', '✅', '⭐', '🏔️', '🎯',
  '😊', '😂', '🤔', '😮', '😢', '😡',
  '🌟', '💡', '📸', '🏕️', '⛰️', '🧗',
  '🚵', '🌿', '☀️', '🌧️', '❄️', '🍡',
]

const PICKER_WIDTH = 204  // 6 * 32 + 2 * 5 (gap) + 8 * 2 (padding)
const PICKER_HEIGHT = 136 // 5 rows * 32 + 4 * 2 (gap) + 8 * 2 (padding)
const MARGIN = 6

interface EmojiPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onSelect: (emoji: string) => void
  onClose: () => void
}

export const EmojiPicker = ({ anchorRef, onSelect, onClose }: EmojiPickerProps) => {
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    const top = spaceBelow >= PICKER_HEIGHT + MARGIN || spaceBelow >= spaceAbove
      ? rect.bottom + MARGIN
      : rect.top - PICKER_HEIGHT - MARGIN

    const left = Math.min(
      rect.left,
      window.innerWidth - PICKER_WIDTH - MARGIN,
    )

    setPos({ top, left })
  }, [anchorRef])

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        pickerRef.current && !pickerRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorRef, onClose])

  if (!pos) return null

  return createPortal(
    <div ref={pickerRef} style={{
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-md)',
      padding: 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 32px)',
      gap: 2,
      zIndex: 9999,
    }}>
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose() }}
          style={{
            width: 32, height: 32, borderRadius: 6,
            border: 'none', background: 'transparent',
            fontSize: 18, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body,
  )
}
