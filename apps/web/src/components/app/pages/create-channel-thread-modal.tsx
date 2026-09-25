'use client'

import React from 'react'
import { Field, Modal, ModalHeader, fieldInputStyle, onBlurRing, onFocusRing } from '../primitives'
import { useT } from '@/components/locale-provider'
import { useCreateChannelThread } from '@/lib/chat/client'

interface CreateChannelThreadModalProps {
  channelId: string
  channelName: string
  onClose: () => void
  onCreated: (threadId: string) => void
}

export function CreateChannelThreadModal({ channelId, channelName, onClose, onCreated }: CreateChannelThreadModalProps) {
  const t = useT()
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const createThread = useCreateChannelThread()

  React.useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('Enter a thread name'))
      return
    }
    if (trimmed.length > 60) {
      setError(t('Enter 60 characters or fewer'))
      return
    }

    createThread.mutate(
      { channelId, name: trimmed },
      {
        onSuccess: thread => {
          onCreated(thread.id)
          onClose()
        },
        onError: mutationError => setError(mutationError.message),
      },
    )
  }

  const pending = createThread.isPending
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
        <ModalHeader icon="chat" title={t('Create thread')} subtitle={`# ${channelName}`} onClose={close}/>
        <div style={{ padding: '20px 22px' }}>
          <Field label={t('Thread name')} required error={error} hint={`${name.length}/60`} htmlFor="channel-thread-name">
            <input
              id="channel-thread-name"
              ref={inputRef}
              value={name}
              maxLength={60}
              onChange={event => { setName(event.target.value); if (error) setError('') }}
              placeholder={t('e.g. Release prep')}
              style={fieldInputStyle(!!error)}
              onFocus={onFocusRing}
              onBlur={event => onBlurRing(event, !!error)}
            />
          </Field>
        </div>
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={close} disabled={pending}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
            {pending ? t('Creating…') : t('Create')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
