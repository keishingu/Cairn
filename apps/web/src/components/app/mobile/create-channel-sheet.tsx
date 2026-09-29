'use client'

import React from 'react'
import { Icon } from '../primitives'
import { useCreateChannel } from '@/lib/chat/client'
import { useT } from '@/components/locale-provider'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 10, background: 'var(--card-2)',
  color: 'var(--text)', fontSize: 15,
  fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1px solid var(--red)',
}

interface CreateChannelSheetProps {
  onClose: () => void
  onCreated: (channel: WorkspaceChannelDto) => void
}

export function CreateChannelSheet({ onClose, onCreated }: CreateChannelSheetProps) {
  const t = useT()
  const [name, setName] = React.useState('')
  const [isPrivate, setIsPrivate] = React.useState(false)
  const [nameError, setNameError] = React.useState('')

  const nameRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { setTimeout(() => nameRef.current?.focus(), 150) }, [])

  const mutation = useCreateChannel()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError(t('Enter a channel name'))
      return
    }
    if (name.trim().length > 60) {
      setNameError(t('Enter 60 characters or fewer'))
      return
    }
    setNameError('')

    mutation.mutate(
      { name: name.trim(), isPrivate },
      {
        onSuccess: (channel) => {
          onCreated(channel)
          onClose()
        },
        onError: (err: Error) => setNameError(err.message),
      },
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
          background: 'var(--overlay)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'var(--z-modal-content)',
        background: 'var(--card)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: 'var(--shadow-sheet)',
        maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="hash" size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t('New channel')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{t('Enter the channel details')}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Icon name="close" size={15}/>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                {t('Channel name')} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{name.length}/60</span>
            </div>
            <input
              ref={nameRef}
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
              placeholder={t('e.g. Random')}
              style={nameError ? inputErrorStyle : inputStyle}
            />
            {nameError && (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
                {nameError}
              </div>
            )}
          </div>

          {/* 公開 / 非公開 */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>
              {t('Visibility')} <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '14px 12px', borderRadius: 12,
                  border: `1.5px solid ${!isPrivate ? 'var(--accent)' : 'var(--border)'}`,
                  background: !isPrivate ? 'var(--accent-soft)' : 'var(--card-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Icon name="hash" size={20} color={!isPrivate ? 'var(--accent-text)' : 'var(--text-3)'}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: !isPrivate ? 'var(--accent-text)' : 'var(--text-2)' }}>{t('Public')}</span>
                <span style={{ fontSize: 11, color: !isPrivate ? 'var(--accent-text)' : 'var(--text-4)', textAlign: 'center', lineHeight: 1.4 }}>{t('Anyone can join')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '14px 12px', borderRadius: 12,
                  border: `1.5px solid ${isPrivate ? 'var(--amber)' : 'var(--border)'}`,
                  background: isPrivate ? 'var(--amber-soft)' : 'var(--card-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Icon name="lock" size={20} color={isPrivate ? 'var(--amber-text)' : 'var(--text-3)'}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: isPrivate ? 'var(--amber-text)' : 'var(--text-2)' }}>{t('Private')}</span>
                <span style={{ fontSize: 11, color: isPrivate ? 'var(--amber-text)' : 'var(--text-4)', textAlign: 'center', lineHeight: 1.4 }}>{t('Invited members only')}</span>
              </button>
            </div>
          </div>

          {/* spacer for footer */}
          <div style={{ height: 8 }}/>
        </form>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--divider)',
          display: 'flex', gap: 10,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="btn btn-lg"
            style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 15 }}
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="btn btn-primary btn-lg"
            style={{ flex: 2, height: 46, borderRadius: 12, fontSize: 15 }}
          >
            {mutation.isPending ? t('Creating…') : t('Create')}
          </button>
        </div>
      </div>
    </>
  )
}
