// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

interface Props {
  onClose: () => void
  onCreated: (file: File) => void
}

export const CreateTextFileDialog = ({ onClose, onCreated }: Props) => {
  const [title, setTitle] = React.useState('')
  const [ext, setExt] = React.useState<'txt' | 'md'>('md')
  const [content, setContent] = React.useState('')
  const contentRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    contentRef.current?.focus()
  }, [])

  const handleContentChange = (value: string) => {
    setContent(value)
    if (title === '') {
      const firstLine = value.split('\n')[0] ?? ''
      if (firstLine.startsWith('# ')) {
        setTitle(firstLine.slice(2).trim())
      }
    }
  }

  const handleSubmit = () => {
    const fileName = (title.trim() || 'snippet') + '.' + ext
    const mimeType = ext === 'md' ? 'text/markdown' : 'text/plain'
    const blob = new Blob([content], { type: mimeType })
    const file = new File([blob], fileName, { type: mimeType })
    onCreated(file)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', width: 520, maxWidth: '95vw', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 14px', borderBottom: '1px solid var(--divider)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>テキストファイルを作成する</span>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 20px' }}>
          {/* Title + ext row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>ファイル名（任意）</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例: memo"
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--input)', color: 'var(--text)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-2)')}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>形式</label>
              <select
                value={ext}
                onChange={e => setExt(e.target.value as 'txt' | 'md')}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--input)', color: 'var(--text)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', minWidth: 80 }}
              >
                <option value="txt">.txt</option>
                <option value="md">.md</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>内容</label>
            <textarea
              ref={contentRef}
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              rows={10}
              style={{ padding: '9px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--input)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, resize: 'vertical', minHeight: 140 }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-2)')}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
            <button
              onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >キャンセル</button>
            <button
              onClick={handleSubmit}
              disabled={!content.trim()}
              style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: content.trim() ? 'var(--accent)' : 'var(--border-2)', color: content.trim() ? 'var(--on-accent)' : 'var(--text-4)', fontSize: 13, fontWeight: 500, cursor: content.trim() ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'background .12s' }}
            >添付する</button>
          </div>
        </div>
      </div>
    </div>
  )
}
