'use client'

import React from 'react'

const EMOJIS = [
  '👍', '❤️', '😄', '🎉', '🔥', '👏',
  '🙏', '💪', '✅', '⭐', '🏔️', '🎯',
  '😊', '😂', '🤔', '😮', '😢', '😡',
  '🌟', '💡', '📸', '🏕️', '⛰️', '🧗',
  '🚵', '🌿', '☀️', '🌧️', '❄️', '🍡',
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export const EmojiPicker = ({ onSelect, onClose }: EmojiPickerProps) => {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      marginBottom: 6,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-md)',
      padding: 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 32px)',
      gap: 2,
      zIndex: 50,
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
    </div>
  )
}
