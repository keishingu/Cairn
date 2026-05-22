// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { AttachmentDto } from '@cairn/shared'
import { Avatar } from './primitives'
import { EmojiPicker } from './emoji-picker'
import { Icon } from './primitives'
import {
  formatChatMessageTime,
  useChannelMessages,
  useCurrentUser,
  useSendChannelMessage,
  useToggleMessageReaction,
} from '@/lib/chat/client'
import { isImeConfirmingEnter } from '@/lib/chat/ime'

const ACCEPT_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',')

function isImageMime(mimeType: string | null): boolean {
  return mimeType?.startsWith('image/') ?? false
}

function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const stripped = trimmed
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[‍️⃣]/gu, '')
    .trim()
  return stripped.length === 0
}

interface PendingAttachment {
  fileId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  previewUrl: string
}

// ─── Message ──────────────────────────────────────────────────────

const ChatMessage = ({ messageId, senderName, createdAt, content, reactions, attachments, onReact, compact }: {
  messageId: string
  senderName: string
  createdAt: string
  content: string
  reactions: Array<{ emoji: string; count: number; mine: boolean }>
  attachments: AttachmentDto[]
  onReact: (messageId: string, emoji: string) => void
  compact?: boolean
}) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const addBtnRef = React.useRef<HTMLButtonElement>(null)
  const avatarSize = compact ? 30 : 36
  const px = compact ? '8px 14px' : '6px 16px'
  const emojiOnly = isEmojiOnly(content)

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
        {content && (
          <div style={{ fontSize: emojiOnly ? 40 : compact ? 13 : 13.5, color: 'var(--text-2)', lineHeight: emojiOnly ? 1.2 : 1.6, whiteSpace: 'pre-line' }}>{content}</div>
        )}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: content ? 8 : 4 }}>
            {attachments.map(a => isImageMime(a.mimeType) ? (
              <img
                key={a.fileId}
                src={`/api/attachments/${a.fileId}`}
                alt={a.fileName}
                style={{
                  maxWidth: attachments.length === 1 ? 280 : 160,
                  maxHeight: 280,
                  width: 'auto',
                  height: 'auto',
                  borderRadius: 8,
                  objectFit: 'cover',
                  display: 'block',
                  cursor: 'pointer',
                }}
              />
            ) : (
              <a
                key={a.fileId}
                href={`/api/attachments/${a.fileId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--card-2)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', textDecoration: 'none',
                  fontSize: 12.5, maxWidth: 240,
                }}
              >
                <Icon name="file" size={16}/>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.fileName}
                </span>
              </a>
            ))}
          </div>
        )}
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

const ChatInputBar = ({ placeholder, draft, setDraft, send, isPending, sendError, setSendError, isComposing, setIsComposing, compact, pendingAttachments, onImageSelect, onRemoveAttachment, isUploading }: {
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
  pendingAttachments: PendingAttachment[]
  onImageSelect: (file: File) => void
  onRemoveAttachment: (fileId: string) => void
  isUploading: boolean
}) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const smileBtnRef = React.useRef<HTMLButtonElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !isPending && !isUploading

  const AttachmentPreviews = pendingAttachments.length > 0 || isUploading ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: compact ? '6px 10px 0' : '6px 14px 0' }}>
      {pendingAttachments.map(a => (
        <div key={a.fileId} style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
          {isImageMime(a.mimeType) ? (
            <img src={a.previewUrl} alt={a.fileName} style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Icon name="file" size={18}/>
              <span style={{ fontSize: 9, color: 'var(--text-4)', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {a.fileName.split('.').pop()?.toUpperCase()}
              </span>
            </div>
          )}
          <button
            onClick={() => onRemoveAttachment(a.fileId)}
            style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--text-3)', border: 'none',
              color: 'var(--bg)', fontSize: 9, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit', lineHeight: 1,
            }}
          >✕</button>
        </div>
      ))}
      {isUploading && (
        <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 18, flexShrink: 0 }}>
          ⋯
        </div>
      )}
    </div>
  ) : null

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT_FILE_TYPES}
      style={{ display: 'none' }}
      onChange={e => {
        const file = e.target.files?.[0]
        if (file) {
          onImageSelect(file)
          e.target.value = ''
        }
      }}
    />
  )

  if (compact) {
    return (
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--divider)' }}>
        {hiddenFileInput}
        {sendError && (
          <div style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {sendError}</span>
            <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
        )}
        <div style={{ background: 'var(--card-2)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
          {AttachmentPreviews}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px' }}>
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
            <button onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
              <Icon name="paperclip" size={15}/>
            </button>
            <button ref={smileBtnRef} onClick={() => setShowPicker(p => !p)} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
              <Icon name="smile" size={15}/>
            </button>
            {showPicker && <EmojiPicker anchorRef={smileBtnRef} onSelect={emoji => { setDraft(draft + emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>}
            <button onClick={send} disabled={!canSend} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: canSend ? 'var(--accent)' : 'var(--border-2)', color: canSend ? 'var(--on-accent)' : 'var(--text-4)', cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
              <Icon name="send" size={13}/>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 24px 18px', background: 'var(--bg)' }}>
      {hiddenFileInput}
      {sendError && (
        <div style={{ marginBottom: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {sendError}</span>
          <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={{ background: 'var(--card)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border-2)'}`, borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
          <button onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="image" size={13}/> 画像
          </button>
          {[{ i: 'sparkles', l: '@AI', accent: true }].map((b, j) => (
            <button key={j} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <Icon name={b.i} size={13}/> {b.l}
            </button>
          ))}
          <button ref={smileBtnRef} onClick={() => setShowPicker(p => !p)} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="smile" size={13}/> 絵文字
          </button>
          {showPicker && <EmojiPicker anchorRef={smileBtnRef} onSelect={emoji => { setDraft(draft + emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>}
        </div>
        {AttachmentPreviews}
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
          <button onClick={send} disabled={!canSend} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: canSend ? 'var(--accent)' : 'var(--border-2)', color: canSend ? 'var(--on-accent)' : 'var(--text-4)', cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
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
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const pendingDraftRef = React.useRef('')
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const { data: currentUser } = useCurrentUser()
  const { data: messages = [], isLoading, isError } = useChannelMessages(channelId)
  const sendMutation = useSendChannelMessage(channelId, currentUser)
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

  const handleImageSelect = async (file: File) => {
    if (!channelId) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('channelId', channelId)
      const res = await fetch('/api/attachments/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setSendError(data.error ?? 'アップロードに失敗しました')
        return
      }
      const data = await res.json() as { fileId: string; fileName: string; mimeType: string | null; fileSize: number | null }
      const previewUrl = URL.createObjectURL(file)
      setPendingAttachments(prev => [...prev, { ...data, previewUrl }])
    } catch {
      setSendError('アップロードに失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveAttachment = (fileId: string) => {
    setPendingAttachments(prev => {
      const removed = prev.find(a => a.fileId === fileId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter(a => a.fileId !== fileId)
    })
  }

  const send = () => {
    const text = draft.trim()
    if ((!text && pendingAttachments.length === 0) || !channelId) return

    pendingDraftRef.current = text
    setSendError(null)
    setDraft('')

    const optimisticAttachments: AttachmentDto[] = pendingAttachments.map((a, i) => ({
      id: `optimistic-${a.fileId}`,
      fileId: a.fileId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      displayOrder: i,
    }))

    pendingAttachments.forEach(a => URL.revokeObjectURL(a.previewUrl))
    setPendingAttachments([])

    sendMutation.mutate({
      content: text,
      attachmentFileIds: optimisticAttachments.map(a => a.fileId),
      optimisticAttachments,
    })
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
              attachments={m.attachments}
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
        pendingAttachments={pendingAttachments}
        onImageSelect={handleImageSelect}
        onRemoveAttachment={handleRemoveAttachment}
        isUploading={isUploading}
        {...(compact ? { compact: true } : {})}
      />
    </>
  )
}
