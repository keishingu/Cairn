'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import EmojiPickerLib, { Theme, EmojiClickData, EmojiStyle } from 'emoji-picker-react'
import jaData from 'emoji-picker-react/dist/data/emojis-ja'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'

const MARGIN = 6
const PICKER_HEIGHT = 450
const PICKER_WIDTH = 350

interface EmojiPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onSelect: (emoji: string) => void
  onClose: () => void
}

export const EmojiPicker = ({ anchorRef, onSelect, onClose }: EmojiPickerProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const { resolvedTheme } = useTheme()
  const { accentId } = useAccentColor()

  const { accentColor, accentSoft } = React.useMemo(() => {
    const preset = ACCENT_PRESETS.find(p => p.id === accentId) ?? ACCENT_PRESETS[0]!
    const isDark = resolvedTheme === 'dark'
    return {
      accentColor: isDark ? preset.dark.accent : preset.light.accent,
      accentSoft: isDark ? preset.dark.accentSoft : preset.light.accentSoft,
    }
  }, [accentId, resolvedTheme])

  React.useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    const top = spaceBelow >= PICKER_HEIGHT + MARGIN || spaceBelow >= spaceAbove
      ? rect.bottom + MARGIN
      : rect.top - PICKER_HEIGHT - MARGIN

    const left = Math.min(rect.left, window.innerWidth - PICKER_WIDTH - MARGIN)

    setPos({ top, left })
  }, [anchorRef])

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current && !containerRef.current.contains(target) &&
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
    <div ref={containerRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}>
      <EmojiPickerLib
        onEmojiClick={(emojiData: EmojiClickData) => { onSelect(emojiData.emoji); onClose() }}
        theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
        emojiStyle={EmojiStyle.NATIVE}
        emojiData={jaData}
        searchPlaceholder="検索"
        previewConfig={{ showPreview: false }}
        skinTonesDisabled
        lazyLoadEmojis
        width={PICKER_WIDTH}
        height={PICKER_HEIGHT}
        style={{
          '--epr-highlight-color': accentColor,
          '--epr-hover-bg-color': accentSoft,
          '--epr-focus-bg-color': accentSoft,
          '--epr-category-icon-active-color': accentColor,
        } as React.CSSProperties}
      />
    </div>,
    document.body,
  )
}
