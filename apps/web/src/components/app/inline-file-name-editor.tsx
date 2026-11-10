'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { useCancelEditOnEscape } from '@/hooks/use-cancel-edit-on-escape'
import { useTextDraft } from '@/hooks/use-text-draft'
import { DraftNotice, UnsavedDraftMarker } from './draft-notice'
import { Icon } from './primitives'

const fileNameDraftKey = (fileId: string) => `file:${fileId}:name`

/** ファイル名の表示モードに添える、未保存の名前変更の下書きがあることを示す印。 */
export const FileNameDraftMarker = ({ fileId, fileName }: { fileId: string; fileName: string }) => {
  const { stored } = useTextDraft({ key: fileNameDraftKey(fileId), savedValue: fileName })
  return stored ? <UnsavedDraftMarker /> : null
}

export const InlineFileNameEditor = ({ fileId, fileName, onSave, onCancel, fontSize = 13 }: {
  /** 下書きの保存先を決めるファイル ID */
  fileId: string
  fileName: string
  onSave: (fileName: string) => Promise<unknown>
  onCancel: () => void
  fontSize?: number
}) => {
  const t = useT()
  const [draft, setDraft] = React.useState(fileName)
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const savingRef = React.useRef(false)

  React.useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const dotIndex = fileName.lastIndexOf('.')
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : fileName.length)
  }, [fileName])

  const nextFileName = draft.trim()
  const canSave = !isSaving && nextFileName !== '' && nextFileName !== fileName

  // 未保存の名前は端末に残し、開き直したときに復元を案内する（閉じ方を問わず失われない）
  const store = useTextDraft({ key: fileNameDraftKey(fileId), savedValue: fileName })
  const [restored, setRestored] = React.useState(false)
  const appliedRef = React.useRef(false)
  const storedRef = React.useRef(store.stored)
  storedRef.current = store.stored
  React.useEffect(() => {
    if (!store.loaded || appliedRef.current) return
    appliedRef.current = true
    const entry = storedRef.current
    if (entry) {
      setDraft(entry.value)
      setRestored(true)
    }
  }, [store.loaded])

  const changeDraft = (next: string) => {
    setDraft(next)
    store.update(next.trim() === fileName ? fileName : next)
  }

  const discardDraft = () => {
    store.clear()
    setRestored(false)
    setDraft(fileName)
  }

  const cancel = () => {
    store.clear()
    onCancel()
  }

  // Esc は編集の取り消しだけにして、周りのパネルは閉じない
  const wrapRef = React.useRef<HTMLDivElement>(null)
  useCancelEditOnEscape(wrapRef, !isSaving, cancel)

  // 明示保存: Enter / 保存ボタンで保存、Esc / キャンセルボタンで破棄。blur では何もしない
  const commit = async () => {
    if (!canSave || savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    try {
      await onSave(nextFileName)
    } catch {
      // 失敗の通知は onSave 側が行う。編集を開いたまま下書きを残す
      savingRef.current = false
      setIsSaving(false)
      return
    }
    // onCancel（編集を閉じる処理）の例外を保存失敗と取り違えないよう、try の外で呼ぶ
    store.clear()
    onCancel()
  }

  React.useEffect(() => {
    if (!isSaving) inputRef.current?.focus()
  }, [isSaving])

  const iconButtonStyle: React.CSSProperties = {
    width: 24, height: 24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 5, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)',
    cursor: 'pointer', padding: 0,
  }

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }} onClick={event => event.stopPropagation()}>
      {restored && <DraftNotice baseChanged={store.baseChanged} onDiscard={discardDraft}/>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
      <input
        ref={inputRef}
        aria-label={t('Change file name')}
        value={draft}
        disabled={isSaving}
        onChange={event => changeDraft(event.target.value)}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void commit()
          }
        }}
        style={{
          flex: 1, minWidth: 0, height: 26, boxSizing: 'border-box', borderRadius: 5,
          border: '1px solid var(--accent)', background: 'var(--card)',
          color: 'var(--text)', outline: 'none', padding: '2px 6px',
          fontFamily: 'inherit', fontSize, fontWeight: 600,
        }}
      />
      <button
        type="button"
        aria-label={t('Save')}
        title={t('Save')}
        disabled={!canSave}
        onClick={() => void commit()}
        style={{ ...iconButtonStyle, color: 'var(--accent)', opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'default' }}
      >
        <Icon name="check" size={13} />
      </button>
      <button
        type="button"
        aria-label={t('Cancel')}
        title={t('Cancel')}
        disabled={isSaving}
        onClick={cancel}
        style={iconButtonStyle}
      >
        <Icon name="close" size={13} />
      </button>
      </div>
    </div>
  )
}
