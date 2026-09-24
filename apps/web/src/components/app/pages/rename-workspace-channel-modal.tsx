'use client'

import React from 'react'
import { WORKSPACE_CHANNEL_NAME_MAX } from '@cairn/shared'
import { Field, Modal, ModalHeader, fieldInputStyle, onBlurRing, onFocusRing } from '../primitives'
import { useRenameWorkspaceChannel } from '@/lib/chat/client'

interface RenameWorkspaceChannelModalProps {
  channelId: string
  currentName: string
  isThread: boolean
  onClose: () => void
}

export function RenameWorkspaceChannelModal({
  channelId,
  currentName,
  isThread,
  onClose,
}: RenameWorkspaceChannelModalProps) {
  const [name, setName] = React.useState(currentName)
  const [error, setError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const renameChannel = useRenameWorkspaceChannel()
  const label = isThread ? 'スレッド名' : 'チャンネル名'

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(`${label}を入力してください`)
      return
    }
    if (trimmed.length > WORKSPACE_CHANNEL_NAME_MAX) {
      setError('60文字以内で入力してください')
      return
    }

    renameChannel.mutate(
      { channelId, name: trimmed },
      {
        onSuccess: () => onClose(),
        onError: mutationError => setError(mutationError.message),
      },
    )
  }

  const pending = renameChannel.isPending
  const close = () => { if (!pending) onClose() }

  return (
    <Modal onClose={close}>
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative', width: '100%', maxWidth: 460,
          background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <ModalHeader icon="edit" title={`${label}を変更`} onClose={close}/>
        <div style={{ padding: '20px 22px' }}>
          <Field label={label} required error={error} hint={`${name.length}/${WORKSPACE_CHANNEL_NAME_MAX}`} htmlFor="rename-workspace-channel-name">
            <input
              id="rename-workspace-channel-name"
              ref={inputRef}
              value={name}
              maxLength={WORKSPACE_CHANNEL_NAME_MAX}
              onChange={event => { setName(event.target.value); if (error) setError('') }}
              style={fieldInputStyle(!!error)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, !!error)}
            />
          </Field>
        </div>
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={close} disabled={pending}>キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
            {pending ? '保存中…' : '保存する'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
