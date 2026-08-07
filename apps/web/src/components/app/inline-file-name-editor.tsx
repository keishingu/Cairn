'use client'

import React from 'react'

export const InlineFileNameEditor = ({ fileName, onSave, onCancel, fontSize = 13 }: {
  fileName: string
  onSave: (fileName: string) => Promise<unknown>
  onCancel: () => void
  fontSize?: number
}) => {
  const [draft, setDraft] = React.useState(fileName)
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cancelledRef = React.useRef(false)
  const savingRef = React.useRef(false)

  React.useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const dotIndex = fileName.lastIndexOf('.')
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : fileName.length)
  }, [fileName])

  const commit = async () => {
    if (cancelledRef.current || savingRef.current) return
    const nextFileName = draft.trim()
    if (!nextFileName || nextFileName === fileName) {
      onCancel()
      return
    }

    savingRef.current = true
    setIsSaving(true)
    try {
      await onSave(nextFileName)
      onCancel()
    } catch {
      savingRef.current = false
      setIsSaving(false)
      inputRef.current?.focus()
    }
  }

  return (
    <input
      ref={inputRef}
      aria-label="ファイル名を変更"
      value={draft}
      disabled={isSaving}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelledRef.current = true
          onCancel()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      style={{
        width: '100%', height: 26, boxSizing: 'border-box', borderRadius: 5,
        border: '1px solid var(--accent)', background: 'var(--card)',
        color: 'var(--text)', outline: 'none', padding: '2px 6px',
        fontFamily: 'inherit', fontSize, fontWeight: 600,
      }}
    />
  )
}
