'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'

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
      <Picker
        data={data}
        onEmojiSelect={(e: { native: string }) => { onSelect(e.native); onClose() }}
        locale="ja"
        theme="light"
        previewPosition="none"
        skinTonePosition="none"
        maxFrequentRows={1}
      />
    </div>,
    document.body,
  )
}
