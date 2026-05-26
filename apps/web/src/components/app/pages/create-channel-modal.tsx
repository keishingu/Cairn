'use client'

import React from 'react'
import { Icon } from '../primitives'
import { useCreateChannel } from '@/lib/chat/client'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'

// ─── スタイルヘルパー（project-list と同じパターン）─────────────────

function fieldInputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: '100%', height: 36, padding: '0 12px',
    border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 8, background: 'var(--card)', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color .12s, box-shadow .12s',
    boxSizing: 'border-box',
  }
}

function onFocusRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = 'var(--ring)'
}

function onBlurRing(e: React.FocusEvent<HTMLInputElement>, invalid: boolean) {
  e.currentTarget.style.borderColor = invalid ? 'var(--red)' : 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

const Field = ({ label, hint, required, error, children, htmlFor }: {
  label: string; hint?: string; required?: boolean; error?: string
  children: React.ReactNode; htmlFor?: string
}) => (
  <label htmlFor={htmlFor} style={{ display: 'block' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{hint}</span>}
    </div>
    {children}
    {error && (
      <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--red-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
        {error}
      </div>
    )}
  </label>
)

// ─── モーダル本体 ─────────────────────────────────────────────────

interface CreateChannelModalProps {
  onClose: () => void
  onCreated: (channel: WorkspaceChannelDto) => void
}

export function CreateChannelModal({ onClose, onCreated }: CreateChannelModalProps) {
  const [name, setName] = React.useState('')
  const [isPrivate, setIsPrivate] = React.useState(false)
  const [nameError, setNameError] = React.useState('')
  const nameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { setTimeout(() => nameRef.current?.focus(), 80) }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mutation = useCreateChannel()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setNameError('チャンネル名を入力してください'); return }
    if (name.trim().length > 60) { setNameError('60文字以内で入力してください'); return }
    setNameError('')
    mutation.mutate(
      { name: name.trim(), isPrivate },
      {
        onSuccess: (channel) => { onCreated(channel); onClose() },
        onError: (err: Error) => setNameError(err.message),
      },
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} onClick={onClose}/>

      <form onSubmit={handleSubmit} style={{
        position: 'relative',
        width: '100%', maxWidth: 480,
        background: 'var(--card)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="hash" size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>新規チャンネル</h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>チャンネルを作成してチームで会話できます</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="close" size={16}/>
          </button>
        </header>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* チャンネル名 */}
          <Field label="チャンネル名" required error={nameError} hint={`${name.length}/60`} htmlFor="ccm-name">
            <input
              id="ccm-name"
              ref={nameRef}
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
              placeholder="例: 雑談"
              style={fieldInputStyle(!!nameError)}
              onFocus={onFocusRing}
              onBlur={e => onBlurRing(e, !!nameError)}
            />
          </Field>

          {/* 公開設定 */}
          <Field label="公開設定" required>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: false, icon: 'hash',  label: '公開',   desc: '誰でも参加できます',        color: 'var(--accent)',      bg: 'var(--accent-soft)',  text: 'var(--accent-text)' },
                { value: true,  icon: 'lock',  label: '非公開', desc: '招待されたメンバーのみ',    color: 'var(--amber)',       bg: 'var(--amber-soft)',   text: 'var(--amber-text)' },
              ] as const).map(opt => {
                const selected = isPrivate === opt.value
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setIsPrivate(opt.value)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 6, padding: '14px 12px', borderRadius: 10,
                      border: `1.5px solid ${selected ? opt.color : 'var(--border)'}`,
                      background: selected ? opt.bg : 'var(--card-2)',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'border-color .12s, background .12s',
                    }}
                  >
                    <Icon name={opt.icon} size={20} color={selected ? opt.text : 'var(--text-3)'}/>
                    <span style={{ fontSize: 13, fontWeight: 600, color: selected ? opt.text : 'var(--text-2)' }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: selected ? opt.text : 'var(--text-4)', textAlign: 'center', lineHeight: 1.4 }}>{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </Field>
        </div>

        {/* Footer */}
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" size={12}/>
            作成後にメンバーを招待できます
          </span>
          <div style={{ flex: 1 }}/>
          <button type="button" onClick={onClose} className="btn" disabled={mutation.isPending}>キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending} style={{ opacity: mutation.isPending ? 0.7 : 1 }}>
            {mutation.isPending ? '作成中…' : '作成する'}
          </button>
        </footer>
      </form>
    </div>
  )
}
