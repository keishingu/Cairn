'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'

const MARGIN = 6
// emoji-mart デフォルトサイズ
const PICKER_HEIGHT = 435
const PICKER_WIDTH = 352

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

  // emoji-mart はシャドウ DOM 内で `rgb(var(--em-rgb-accent))` を使い、
  // `--em-rgb-accent` は `var(--rgb-accent, <デフォルト青>)` にフォールバックする。
  // `--rgb-accent` を継承で渡せばハイライト色を上書きできる（値は "R, G, B" 形式）。
  // Picker は Portal で `.app-root` の外（document.body）に描画されるため、
  // `.app-root` の `--accent` は継承されない。ラッパー div に直接セットする。
  const accentRgb = React.useMemo(() => {
    const preset = ACCENT_PRESETS.find(p => p.id === accentId) ?? ACCENT_PRESETS[0]!
    const hex = (resolvedTheme === 'dark' ? preset.dark.accent : preset.light.accent).replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `${r}, ${g}, ${b}`
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
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, '--rgb-accent': accentRgb } as React.CSSProperties}
    >
      <Picker
        data={data}
        onEmojiSelect={(e: { native: string }) => { onSelect(e.native); onClose() }}
        locale="ja"
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        previewPosition="none"
        skinTonePosition="none"
        maxFrequentRows={1}
      />
    </div>,
    document.body,
  )
}
