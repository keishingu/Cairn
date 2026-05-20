// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Avatar } from './primitives'
import { EmojiPicker } from './emoji-picker'
import { Icon } from './primitives'
import {
  formatChatMessageTime,
  useChannelMessages,
  useSendChannelMessage,
  useToggleMessageReaction,
} from '@/lib/chat/client'
import { isImeConfirmingEnter } from '@/lib/chat/ime'

// ─── Message ──────────────────────────────────────────────────────

const ChatMessage = ({ messageId, senderName, createdAt, content, reactions, onReact, compact }: {
  messageId: string
  senderName: string
  createdAt: string
  content: string
  reactions: Array<{ emoji: string; count: number; mine: boolean }>
  onReact: (messageId: string, emoji: string) => void
  compact?: boolean
}) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const addBtnRef = React.useRef<HTMLButtonElement>(null)
  const avatarSize = compact ? 30 : 36
  const px = compact ? '8px 14px' : '6px 16px'

  return (
    <div
      style={{ display: 'flex', gap: compact ? 8 : 12, padding: px, alignItems: 'flex-start' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <Avatar name={senderName} size={avatarSize}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: 'var(--text)' }}>{senderName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatChatMessageTime(createdAt)}</span>
        </div>
        <div style={{ fontSize: compact ? 13 : 13.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{content}</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {reactions.map((r, i) => (
            <button key={i} onClick={() => onReact(messageId, r.emoji)} style={{
              height: compact ? 22 : 24, padding: '0 7px', borderRadius: 12,
              background: r.mine ? 'var(--accent-soft)' : 'var(--card-2)',
              border: `1px solid ${r.mine ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 11, fontWeight: 600,
              color: r.mine ? 'var(--accent-text)' : 'var(--text-2)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{r.emoji} {r.count}</button>
          ))}
          <button ref={addBtnRef} onClick={() => setShowPicker(p => !p)} style={{
            width: compact ? 22 : 24, height: compact ? 22 : 24, borderRadius: 12,
            background: 'var(--card-2)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>+</button>
          {showPicker && (
            <EmojiPicker anchorRef={addBtnRef} onSelect={emoji => { onReact(messageId, emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────

const ChatInputBar = ({ placeholder, draft, setDraft, send, isPending, sendError, setSendError, isComposing, setIsComposing, compact }: {
  placeholder: string
  draft: string
  setDraft: (v: string) => void
  send: () => void
  isPending: boolean
  sendError: string | null
  setSendError: (v: string | null) => void
  isComposing: boolean
  setIsComposing: (v: boolean) => void
  compact?: boolean
}) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const smileBtnRef = React.useRef<HTMLButtonElement>(null)

  if (compact) {
    return (
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--divider)' }}>
        {sendError && (
          <div style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {sendError}</span>
            <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, padding: '7px 10px' }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (isImeConfirmingEnter(e, isComposing)) return
              e.preventDefault()
              send()
            }}
            placeholder={placeholder}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
            <Icon name="paperclip" size={15}/>
          </button>
          <button ref={smileBtnRef} onClick={() => setShowPicker(p => !p)} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
            <Icon name="smile" size={15}/>
          </button>
          {showPicker && <EmojiPicker anchorRef={smileBtnRef} onSelect={emoji => { setDraft(draft + emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>}
          <button onClick={send} disabled={!draft.trim() || isPending} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: draft.trim() && !isPending ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() && !isPending ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() && !isPending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 24px 18px', background: 'var(--bg)' }}>
      {sendError && (
        <div style={{ marginBottom: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {sendError}</span>
          <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={{ background: 'var(--card)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border-2)'}`, borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
          {[{ i: 'paperclip', l: '添付' }, { i: 'image', l: '画像' }, { i: 'sparkles', l: '@AI', accent: true }].map((b, j) => (
            <button key={j} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: (b as {accent?:boolean}).accent ? 'var(--accent)' : 'var(--text-3)', fontSize: 11.5, fontWeight: (b as {accent?:boolean}).accent ? 600 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <Icon name={b.i} size={13}/> {b.l}
            </button>
          ))}
          <button ref={smileBtnRef} onClick={() => setShowPicker(p => !p)} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="smile" size={13}/> 絵文字
          </button>
          {showPicker && <EmojiPicker anchorRef={smileBtnRef} onSelect={emoji => { setDraft(draft + emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px 12px' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (isImeConfirmingEnter(e, isComposing)) return
              e.preventDefault()
              send()
            }}
            placeholder={placeholder}
            rows={1}
            style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160 }}
          />
          <button onClick={send} disabled={!draft.trim() || isPending} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: draft.trim() && !isPending ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() && !isPending ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() && !isPending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ChatThread ───────────────────────────────────────────────────

export const ChatThread = ({ channelId, channelName, isPrivate, compact }: {
  channelId: string | null
  channelName?: string
  isPrivate?: boolean
  compact?: boolean
}) => {
  const [draft, setDraft] = React.useState('')
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [isComposing, setIsComposing] = React.useState(false)
  const pendingDraftRef = React.useRef('')
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const { data: messages = [], isLoading, isError } = useChannelMessages(channelId)
  const sendMutation = useSendChannelMessage(channelId)
  const reactMutation = useToggleMessageReaction(channelId)

  React.useEffect(() => {
    if (!sendMutation.isError) return
    setSendError(sendMutation.error.message)
    setDraft(pendingDraftRef.current)
  }, [sendMutation.error, sendMutation.isError])

  React.useEffect(() => {
    if (sendMutation.isSuccess) setSendError(null)
  }, [sendMutation.isSuccess])

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const send = () => {
    const text = draft.trim()
    if (!text || !channelId) return
    pendingDraftRef.current = text
    setSendError(null)
    setDraft('')
    sendMutation.mutate(text)
  }

  const placeholder = channelName
    ? `${isPrivate ? '🔒' : '#'} ${channelName} にメッセージ送信`
    : 'メッセージを入力...'

  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: compact ? '8px 0 16px' : '16px 0' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>読み込み中...</div>
        ) : isError ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--red-text)', fontSize: 13 }}>メッセージの取得に失敗しました</div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>まだメッセージはありません。最初のメッセージを送ってみましょう！</div>
        ) : (
          messages.map(m => (
            <ChatMessage
              key={m.id}
              messageId={m.id}
              senderName={m.senderName}
              createdAt={m.createdAt}
              content={m.content}
              reactions={m.reactions}
              onReact={(messageId, emoji) => reactMutation.mutate({ messageId, emoji })}
              {...(compact ? { compact: true } : {})}
            />
          ))
        )}
      </div>
      <ChatInputBar
        placeholder={placeholder}
        draft={draft}
        setDraft={setDraft}
        send={send}
        isPending={sendMutation.isPending}
        sendError={sendError}
        setSendError={setSendError}
        isComposing={isComposing}
        setIsComposing={setIsComposing}
        {...(compact ? { compact: true } : {})}
      />
    </>
  )
}
