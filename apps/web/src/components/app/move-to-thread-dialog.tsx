// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { WORKSPACE_CHANNEL_NAME_MAX, workspaceChannelDisplayName } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { useMoveMessagesToThread } from '@/lib/chat/client'
import {
  buildMoveToThreadBody,
  defaultMoveThreadName,
  type MoveSourceMessage,
  type MoveToThreadScope,
} from '@/lib/chat/move-to-thread'
import { Field, Modal, ModalHeader, fieldInputStyle, onBlurRing, onFocusRing } from './primitives'
import { InlineError } from './inline-error'

export interface MoveToThreadDialogThread {
  id: string
  name: string | null
}

interface MoveToThreadDialogProps {
  parentChannelId: string
  parentChannelName: string
  /** メニューを開いたメッセージ。「このメッセージだけ」「以降すべて」の起点になる */
  anchor: MoveSourceMessage
  /** 選択モードで選び終えたメッセージ。渡すと範囲は「選択したメッセージ」に固定される */
  selected: ReadonlyArray<MoveSourceMessage> | null
  /** 同じ親チャンネル配下の、アーカイブされていないスレッド */
  threads: ReadonlyArray<MoveToThreadDialogThread>
  onClose: () => void
  /** 範囲に「選択したメッセージ」を選んで進んだとき。呼び出し側が選択モードへ切り替える */
  onStartSelection: () => void
  onMoved: (result: { threadId: string; movedCount: number }) => void
}

const SCOPES: ReadonlyArray<{ value: MoveToThreadScope; label: string }> = [
  { value: 'single', label: 'This message only' },
  { value: 'after', label: 'This message and everything after' },
  { value: 'selected', label: 'Selected messages' },
]

/** 親チャンネルのメッセージを、新規または既存のスレッドへ切り出す確認ダイアログ。 */
export function MoveToThreadDialog({
  parentChannelId,
  parentChannelName,
  anchor,
  selected,
  threads,
  onClose,
  onStartSelection,
  onMoved,
}: MoveToThreadDialogProps) {
  const t = useT()
  const move = useMoveMessagesToThread()
  const selectedMessages = selected ?? []
  const [scope, setScope] = React.useState<MoveToThreadScope>(selected ? 'selected' : 'after')
  const [destination, setDestination] = React.useState<'new' | 'existing'>('new')
  const [threadId, setThreadId] = React.useState('')
  const [name, setName] = React.useState(() => defaultMoveThreadName(selected ? 'selected' : 'after', anchor, selectedMessages))
  // 利用者が名前を編集したら、範囲を切り替えても上書きしない
  const [nameEdited, setNameEdited] = React.useState(false)
  const [error, setError] = React.useState('')
  const nameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (destination !== 'new') return
    const timer = window.setTimeout(() => nameRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [destination])

  const changeScope = (next: MoveToThreadScope) => {
    setScope(next)
    if (!nameEdited) setName(defaultMoveThreadName(next, anchor, selectedMessages))
  }

  const pending = move.isPending
  const close = () => { if (!pending) onClose() }
  const choosingMessages = scope === 'selected' && !selected

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (choosingMessages) {
      onStartSelection()
      return
    }
    const trimmed = name.trim()
    if (destination === 'new') {
      if (!trimmed) { setError(t('Enter a thread name')); return }
      if (Array.from(trimmed).length > WORKSPACE_CHANNEL_NAME_MAX) { setError(t('Enter 60 characters or fewer')); return }
    } else if (!threadId) {
      setError(t('Choose a thread'))
      return
    }
    setError('')
    move.mutate(
      {
        channelId: parentChannelId,
        body: buildMoveToThreadBody({
          scope,
          anchorId: anchor.id,
          selectedIds: selectedMessages.map(message => message.id),
          destination: destination === 'new' ? { kind: 'new', name: trimmed } : { kind: 'existing', threadId },
        }),
      },
      {
        onSuccess: onMoved,
        onError: mutationError => setError(mutationError.message),
      },
    )
  }

  const radioRow = (checked: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, color: 'var(--text)',
    background: checked ? 'var(--accent-soft)' : 'transparent',
    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
  })

  return (
    <Modal onClose={close} label={t('Move to thread')}>
      <form
        onSubmit={submit}
        style={{
          position: 'relative', width: '100%', maxWidth: 460, maxHeight: 'calc(100dvh - 48px)',
          background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <ModalHeader icon="arrowRight" title={t('Move to thread')} subtitle={`# ${parentChannelName}`} onClose={close}/>
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0 }}>
          <div role="radiogroup" aria-label={t('Messages to move')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 2 }}>{t('Messages to move')}</span>
            {selected ? (
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('{count} selected', { count: selected.length })}</span>
            ) : SCOPES.map(option => (
              <label key={option.value} style={radioRow(scope === option.value)}>
                <input
                  type="radio"
                  name="move-to-thread-scope"
                  value={option.value}
                  checked={scope === option.value}
                  onChange={() => changeScope(option.value)}
                  style={{ accentColor: 'var(--accent)', margin: 0 }}
                />
                {t(option.label)}
              </label>
            ))}
          </div>

          {!choosingMessages && (
            <>
              <div role="radiogroup" aria-label={t('Destination')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 2 }}>{t('Destination')}</span>
                <label style={radioRow(destination === 'new')}>
                  <input type="radio" name="move-to-thread-destination" checked={destination === 'new'} onChange={() => { setDestination('new'); setError('') }} style={{ accentColor: 'var(--accent)', margin: 0 }}/>
                  {t('New thread')}
                </label>
                <label style={radioRow(destination === 'existing')}>
                  <input type="radio" name="move-to-thread-destination" checked={destination === 'existing'} onChange={() => { setDestination('existing'); setError('') }} style={{ accentColor: 'var(--accent)', margin: 0 }}/>
                  {t('Existing thread')}
                </label>
              </div>

              {destination === 'new' ? (
                <Field label={t('Thread name')} required hint={`${Array.from(name).length}/${WORKSPACE_CHANNEL_NAME_MAX}`} htmlFor="move-to-thread-name">
                  <input
                    id="move-to-thread-name"
                    ref={nameRef}
                    value={name}
                    maxLength={WORKSPACE_CHANNEL_NAME_MAX}
                    onChange={event => { setName(event.target.value); setNameEdited(true); if (error) setError('') }}
                    placeholder={t('e.g. Release prep')}
                    style={fieldInputStyle(!!error)}
                    onFocus={onFocusRing}
                    onBlur={event => onBlurRing(event, !!error)}
                  />
                </Field>
              ) : threads.length === 0 ? (
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('No threads to move to yet')}</span>
              ) : (
                <Field label={t('Existing thread')} required htmlFor="move-to-thread-existing">
                  <select
                    id="move-to-thread-existing"
                    value={threadId}
                    onChange={event => { setThreadId(event.target.value); if (error) setError('') }}
                    style={fieldInputStyle(false)}
                  >
                    <option value="">{t('Choose a thread')}</option>
                    {threads.map(thread => (
                      <option key={thread.id} value={thread.id}>{workspaceChannelDisplayName(thread.name, true)}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          {error && <InlineError variant="box">{error}</InlineError>}
        </div>
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button type="button" className="btn" onClick={close} disabled={pending}>{t('Cancel')}</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || (destination === 'existing' && !choosingMessages && threads.length === 0) || (!!selected && selected.length === 0)}
            style={{ opacity: pending ? 0.7 : 1 }}
          >
            {choosingMessages ? t('Choose messages') : pending ? t('Moving...') : t('Move')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
