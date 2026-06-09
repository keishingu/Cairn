// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { AttachmentDto } from '@cairn/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from './primitives'
import { EmojiPicker } from './emoji-picker'
import { Icon } from './primitives'
import { FileTypeIcon } from './file-type-icon'
import { CreateTextFileDialog } from './create-text-file-dialog'
import {
  formatChatMessageTime,
  useChannelMessages,
  useChannelMembers,
  useCurrentUser,
  useDeleteMessage,
  useEditMessage,
  useSendChannelMessage,
  useToggleMessageReaction,
  useWorkspaceMembers,
} from '@/lib/chat/client'
import { isImeConfirmingEnter } from '@/lib/chat/ime'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const GOOGLE_DOCS_URL_RE = /https:\/\/(?:docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*|drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*)/g
const URL_RE = /https?:\/\/[^\s<>"']+/g
const STRUCTURED_MENTION_RE = /<@[^|>\s]+\|[^>\n]+>/g

function extractGoogleDocsUrls(text: string): string[] {
  const matches = text.match(GOOGLE_DOCS_URL_RE) ?? []
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)>]+$/, '')))]
}

function renderTextWithLinks(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(`${STRUCTURED_MENTION_RE.source}|${URL_RE.source}`, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]!
    if (token.startsWith('<@')) {
      const pipeIdx = token.indexOf('|')
      const displayName = token.slice(pipeIdx + 1, -1)
      nodes.push(
        <span key={match.index} style={{ display: 'inline', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4, padding: '1px 5px', fontWeight: 600, fontSize: '0.92em' }}>
          @{displayName}
        </span>,
      )
    } else {
      const url = token.replace(/[.,;:!?)>\]]+$/, '')
      nodes.push(
        <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {url}
        </a>,
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : nodes
}

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

const ChatMessage = React.memo(function ChatMessage({ messageId, senderId, currentUserId, senderName, senderAvatarUrl, createdAt, isEdited, content, reactions, attachments, onReact, onEdit, onDelete, compact, isMobile }: {
  messageId: string
  senderId: string
  currentUserId: string | undefined
  senderName: string
  senderAvatarUrl?: string | null
  createdAt: string
  isEdited: boolean
  content: string
  reactions: Array<{ emoji: string; count: number; mine: boolean }>
  attachments: AttachmentDto[]
  onReact: (messageId: string, emoji: string) => void
  onEdit: (messageId: string, content: string) => void
  onDelete: (messageId: string) => void
  compact?: boolean
  isMobile?: boolean
}) {
  const [showPicker, setShowPicker] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)
  const [editDraft, setEditDraft] = React.useState('')
  const [editComposing, setEditComposing] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const addBtnRef = React.useRef<HTMLButtonElement>(null)
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const avatarSize = compact ? 30 : 36
  const px = compact ? '8px 14px' : '6px 16px'
  const emojiOnly = isEmojiOnly(content)
  const isOwn = currentUserId === senderId

  const startEdit = () => {
    setMobileMenuOpen(false)
    setEditDraft(content)
    setEditMode(true)
    requestAnimationFrame(() => {
      if (editTextareaRef.current) {
        editTextareaRef.current.focus()
        editTextareaRef.current.setSelectionRange(content.length, content.length)
      }
    })
  }

  const submitEdit = () => {
    const trimmed = editDraft.trim()
    if (trimmed && trimmed !== content) onEdit(messageId, trimmed)
    setEditMode(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditMode(false) }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isImeConfirmingEnter(e, editComposing)) return
      e.preventDefault()
      submitEdit()
    }
  }

  // PC: ホバー時に右上に表示するアクションパネル
  const pcActions = !isMobile && hovered && isOwn && !editMode && (
    <div style={{
      position: 'absolute', top: 4, right: 8,
      display: 'flex', gap: 4, alignItems: 'center',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '2px 4px', boxShadow: 'var(--shadow-sm)',
    }}>
      <button onClick={startEdit} title="編集"
        style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '3px 5px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
      ><Icon name="edit" size={13}/></button>
      {deleteConfirm ? (
        <>
          <span style={{ fontSize: 11, color: 'var(--red-text)', padding: '0 2px' }}>削除？</span>
          <button onClick={() => { onDelete(messageId); setDeleteConfirm(false) }}
            style={{ border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontFamily: 'inherit' }}>はい</button>
          <button onClick={() => setDeleteConfirm(false)}
            style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontFamily: 'inherit' }}>いいえ</button>
        </>
      ) : (
        <button onClick={() => setDeleteConfirm(true)} title="削除"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '3px 5px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
        ><Icon name="trash" size={13}/></button>
      )}
    </div>
  )

  // モバイル: 常時表示の「⋯」ボタン → タップで展開
  const mobileActions = isMobile && isOwn && !editMode && (
    <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start', paddingTop: 2 }}>
      {mobileMenuOpen ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '2px 4px', boxShadow: 'var(--shadow-sm)' }}>
          <button onClick={startEdit}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
          ><Icon name="edit" size={14}/></button>
          {deleteConfirm ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--red-text)', padding: '0 2px' }}>削除？</span>
              <button onClick={() => { onDelete(messageId); setDeleteConfirm(false); setMobileMenuOpen(false) }}
                style={{ border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontFamily: 'inherit' }}>はい</button>
              <button onClick={() => { setDeleteConfirm(false); setMobileMenuOpen(false) }}
                style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontFamily: 'inherit' }}>いいえ</button>
            </>
          ) : (
            <button onClick={() => setDeleteConfirm(true)}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
            ><Icon name="trash" size={14}/></button>
          )}
          <button onClick={() => { setMobileMenuOpen(false); setDeleteConfirm(false) }}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', padding: '4px 4px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
          ><Icon name="close" size={12}/></button>
        </div>
      ) : (
        <button onClick={() => setMobileMenuOpen(true)}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}
        ><Icon name="more" size={16}/></button>
      )}
    </div>
  )

  return (
    <div
      data-message-id={messageId}
      style={{ display: 'flex', gap: compact ? 8 : 12, padding: px, alignItems: 'flex-start', position: 'relative', background: hovered ? 'var(--card-2)' : 'transparent' }}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => { if (!isMobile) { setHovered(false); setDeleteConfirm(false) } }}
    >
      <Avatar name={senderName} url={senderAvatarUrl ?? null} size={avatarSize}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: 'var(--text)' }}>{senderName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatChatMessageTime(createdAt)}</span>
          {isEdited && <span style={{ fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>編集済み</span>}
        </div>
        {editMode ? (
          <div style={{ marginBottom: 4 }}>
            <textarea
              ref={editTextareaRef}
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              onCompositionStart={() => setEditComposing(true)}
              onCompositionEnd={() => setEditComposing(false)}
              onKeyDown={handleEditKeyDown}
              rows={2}
              style={{
                width: '100%', border: '1px solid var(--accent)', borderRadius: 8,
                background: 'var(--card)', padding: '6px 10px',
                fontSize: compact ? 13 : 13.5, color: 'var(--text)', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.5, resize: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button onClick={submitEdit}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >保存</button>
              <button onClick={() => setEditMode(false)}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >キャンセル</button>
              {!isMobile && <span style={{ fontSize: 11, color: 'var(--text-4)', alignSelf: 'center' }}>Enter で保存 · Esc でキャンセル</span>}
            </div>
          </div>
        ) : (
          content && (
            <div style={{ fontSize: emojiOnly ? 40 : compact ? 13 : 13.5, color: 'var(--text-2)', lineHeight: emojiOnly ? 1.2 : 1.6, whiteSpace: 'pre-line' }}>
              {emojiOnly ? content : renderTextWithLinks(content)}
            </div>
          )
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
                <FileTypeIcon mimeType={a.mimeType} fileName={a.fileName} width={28} height={32}/>
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
      {pcActions}
      {mobileActions}
    </div>
  )
})

// ─── Input ────────────────────────────────────────────────────────

const ChatInputBar = ({ placeholder, draft, setDraft, send, isPending, sendError, setSendError, isComposing, setIsComposing, compact, pendingAttachments, onImageSelect, onRemoveAttachment, isUploading, mentionMembers, onMentionInserted, onCreateTextFile }: {
  placeholder: React.ReactNode
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
  mentionMembers?: { userId: string; displayName: string }[]
  onMentionInserted?: (userId: string, displayName: string) => void
  onCreateTextFile: () => void
}) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null)
  const [mentionAnchorPos, setMentionAnchorPos] = React.useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = React.useState(0)
  const [insertedMentionNames, setInsertedMentionNames] = React.useState<Set<string>>(new Set())
  const smileBtnRef = React.useRef<HTMLButtonElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const docInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const compactInputRef = React.useRef<HTMLInputElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)

  // draft がクリアされたらメンション状態もリセット
  React.useEffect(() => {
    if (!draft) {
      setMentionQuery(null)
      setMentionAnchorPos(null)
      setInsertedMentionNames(new Set())
    }
  }, [draft])

  const mentionCandidates = React.useMemo(() => {
    if (mentionQuery === null || !mentionMembers) return []
    const q = mentionQuery.toLowerCase()
    return mentionMembers.filter(m => m.displayName.toLowerCase().includes(q)).slice(0, 6)
  }, [mentionQuery, mentionMembers])

  // 候補が変わったら選択をリセット
  React.useEffect(() => { setSelectedIdx(0) }, [mentionCandidates.length])

  const detectMention = (val: string, cursorPos: number) => {
    const before = val.slice(0, cursorPos)
    const m = /@([^\s@]*)$/.exec(before)
    if (m) { setMentionQuery(m[1]!); setMentionAnchorPos(m.index) }
    else { setMentionQuery(null); setMentionAnchorPos(null) }
  }

  const insertMention = (userId: string, displayName: string) => {
    if (mentionAnchorPos === null) return
    const cursor = (textareaRef.current ?? compactInputRef.current)?.selectionStart ?? draft.length
    const newDraft = `${draft.slice(0, mentionAnchorPos)}@${displayName} ${draft.slice(cursor)}`
    setDraft(newDraft)
    onMentionInserted?.(userId, displayName)
    setInsertedMentionNames(prev => { const next = new Set(prev); next.add(displayName); return next })
    setMentionQuery(null)
    setMentionAnchorPos(null)
    const targetPos = mentionAnchorPos + displayName.length + 2
    requestAnimationFrame(() => {
      const el = textareaRef.current ?? compactInputRef.current
      if (el) { el.focus(); el.setSelectionRange(targetPos, targetPos) }
    })
  }

  const handleKeyDownWithMention = (e: React.KeyboardEvent, fallback: () => void) => {
    if (mentionCandidates.length > 0) {
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => (i + 1) % mentionCandidates.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const m = mentionCandidates[selectedIdx] ?? mentionCandidates[0]
        if (m) insertMention(m.userId, m.displayName)
        return
      }
    }
    fallback()
  }

  const MentionPicker = (() => {
    if (mentionCandidates.length === 0) return null
    const el = textareaRef.current ?? compactInputRef.current
    const rect = el?.getBoundingClientRect()
    const style: React.CSSProperties = rect
      ? { position: 'fixed', bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width, zIndex: 200 }
      : { position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, zIndex: 200 }
    return (
      <div style={{ ...style, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        {mentionCandidates.map((m, i) => (
          <button key={m.userId}
            onMouseDown={e => { e.preventDefault(); insertMention(m.userId, m.displayName) }}
            onMouseEnter={() => setSelectedIdx(i)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: i === selectedIdx ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <Avatar name={m.displayName} size={22}/>
            <span style={{ fontSize: 13.5, color: i === selectedIdx ? 'var(--accent)' : 'var(--text-2)', fontWeight: 500 }}>{m.displayName}</span>
          </button>
        ))}
      </div>
    )
  })()

  // ピッカーで挿入されたメンションをテキストエリア上でハイライト表示するオーバーレイ
  const draftOverlay = React.useMemo(() => {
    if (insertedMentionNames.size === 0 || !draft) return null
    const sorted = [...insertedMentionNames].sort((a, b) => b.length - a.length)
    const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const re = new RegExp(`@(${escaped.join('|')})(?=[\\s、。！？]|$)`, 'g')
    const nodes: React.ReactNode[] = []
    let last = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(draft)) !== null) {
      if (match.index > last) nodes.push(<span key={`t${last}`} style={{ color: 'var(--text)' }}>{draft.slice(last, match.index)}</span>)
      nodes.push(<span key={`m${match.index}`} style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4, padding: '1px 5px', fontWeight: 600, fontSize: '0.92em' }}>@{match[1]}</span>)
      last = match.index + match[0]!.length
    }
    if (nodes.length === 0) return null
    if (last < draft.length) nodes.push(<span key="last" style={{ color: 'var(--text)' }}>{draft.slice(last)}</span>)
    return nodes
  }, [draft, insertedMentionNames])

  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !isPending && !isUploading

  const AttachmentPreviews = pendingAttachments.length > 0 || isUploading ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: compact ? '6px 10px 0' : '6px 14px 0' }}>
      {pendingAttachments.map(a => (
        <div key={a.fileId} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          {isImageMime(a.mimeType) ? (
            <img src={a.previewUrl} alt={a.fileName} style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12.5, maxWidth: 240 }}>
              <FileTypeIcon mimeType={a.mimeType} fileName={a.fileName} width={28} height={32}/>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</span>
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

  const makeFileHandler = (ref: React.RefObject<HTMLInputElement | null>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { onImageSelect(file); e.target.value = '' }
  }

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT_FILE_TYPES}
      style={{ display: 'none' }}
      onChange={makeFileHandler(fileInputRef)}
    />
  )

  const hiddenImageInput = (
    <input
      ref={imageInputRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={makeFileHandler(imageInputRef)}
    />
  )

  const hiddenDocInput = (
    <input
      ref={docInputRef}
      type="file"
      style={{ display: 'none' }}
      onChange={makeFileHandler(docInputRef)}
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
            <div style={{ flex: 1, position: 'relative' }}>
              {MentionPicker}
              {typeof placeholder !== 'string' && !draft && (
                <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-4)', fontSize: 13 }}>
                  {placeholder}
                </div>
              )}
              {draftOverlay && (
                <div ref={overlayRef} aria-hidden style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, fontSize: 13, fontFamily: 'inherit', lineHeight: 1, whiteSpace: 'nowrap', pointerEvents: 'none', overflow: 'hidden' }}>
                  {draftOverlay}
                </div>
              )}
              <input
                ref={compactInputRef}
                value={draft}
                onChange={e => { setDraft(e.target.value); detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={e => handleKeyDownWithMention(e, () => {
                  if (e.key !== 'Enter' || e.shiftKey) return
                  if (isImeConfirmingEnter(e, isComposing)) return
                  e.preventDefault()
                  send()
                })}
                placeholder={typeof placeholder === 'string' ? placeholder : ''}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, color: draftOverlay ? 'transparent' : 'var(--text)', caretColor: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <button onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
              <Icon name="paperclip" size={15}/>
            </button>
            <button onClick={onCreateTextFile} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
              <Icon name="file-text" size={15}/>
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
      {hiddenImageInput}
      {hiddenDocInput}
      {sendError && (
        <div style={{ marginBottom: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {sendError}</span>
          <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={{ background: 'var(--card)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border-2)'}`, borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
          <button onClick={() => imageInputRef.current?.click()} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="image" size={13}/> 画像
          </button>
          <button onClick={() => docInputRef.current?.click()} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="paperclip" size={13}/> ファイル
          </button>
          <button onClick={onCreateTextFile} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="file-text" size={13}/> テキストファイル
          </button>
          <button ref={smileBtnRef} onClick={() => setShowPicker(p => !p)} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="smile" size={13}/> 絵文字
          </button>
          {showPicker && <EmojiPicker anchorRef={smileBtnRef} onSelect={emoji => { setDraft(draft + emoji); setShowPicker(false) }} onClose={() => setShowPicker(false)}/>}
        </div>
        {AttachmentPreviews}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px 12px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {MentionPicker}
            {typeof placeholder !== 'string' && !draft && (
              <div style={{ position: 'absolute', top: 2, left: 0, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-4)', fontSize: 14 }}>
                {placeholder}
              </div>
            )}
            {draftOverlay && (
              <div ref={overlayRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '2px 0', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none', overflow: 'hidden', maxHeight: 160 }}>
                {draftOverlay}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={e => handleKeyDownWithMention(e, () => {
                if (e.key !== 'Enter' || e.shiftKey) return
                if (isImeConfirmingEnter(e, isComposing)) return
                e.preventDefault()
                send()
              })}
              onScroll={draftOverlay ? e => { if (overlayRef.current) overlayRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop } : undefined}
              placeholder={typeof placeholder === 'string' ? placeholder : ''}
              rows={1}
              style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', fontSize: 14, color: draftOverlay ? 'transparent' : 'var(--text)', caretColor: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160 }}
            />
          </div>
          <button onClick={send} disabled={!canSend} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: canSend ? 'var(--accent)' : 'var(--border-2)', color: canSend ? 'var(--on-accent)' : 'var(--text-4)', cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ChatThread ───────────────────────────────────────────────────

export const ChatThread = ({ channelId, channelName, isPrivate, compact, isMobile, targetMessageId }: {
  channelId: string | null
  channelName?: string
  isPrivate?: boolean
  compact?: boolean
  isMobile?: boolean
  targetMessageId?: string | null
}) => {
  const [draft, setDraft] = React.useState('')
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [isComposing, setIsComposing] = React.useState(false)
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const [showTextFileDialog, setShowTextFileDialog] = React.useState(false)
  const pendingDraftRef = React.useRef('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  // displayName → userId map for structured mention serialization
  const mentionMapRef = React.useRef<Map<string, string>>(new Map())

  const onMentionInserted = React.useCallback((userId: string, displayName: string) => {
    mentionMapRef.current.set(displayName, userId)
  }, [])

  const transformContent = (text: string): string => {
    const entries = [...mentionMapRef.current.entries()]
    if (entries.length === 0) return text
    // Longest name first to avoid partial replacements
    entries.sort((a, b) => b[0].length - a[0].length)
    let result = text
    for (const [displayName, userId] of entries) {
      const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(
        new RegExp(`@${escaped}(?=[\\s、。！？]|$)`, 'g'),
        `<@${userId}|${displayName}>`,
      )
    }
    return result
  }

  const { data: currentUser } = useCurrentUser()
  const { data: messages = [], isLoading, isError } = useChannelMessages(channelId)
  const { data: wsMembers = [] } = useWorkspaceMembers()
  const { data: chMemberIds = [] } = useChannelMembers(channelId)
  const sendMutation = useSendChannelMessage(channelId, currentUser)
  const reactMutation = useToggleMessageReaction(channelId)
  const editMutation = useEditMessage(channelId)
  const deleteMutation = useDeleteMessage(channelId)

  const mentionMembers = React.useMemo(() => {
    if (chMemberIds.length > 0) {
      const idSet = new Set(chMemberIds.map(m => m.userId))
      return wsMembers.filter(m => idSet.has(m.userId) && m.userId !== currentUser?.id)
    }
    return wsMembers.filter(m => m.userId !== currentUser?.id)
  }, [chMemberIds, wsMembers, currentUser?.id])

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

  React.useEffect(() => {
    if (!targetMessageId || isLoading || !scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('message-highlight')
    const t = setTimeout(() => el.classList.remove('message-highlight'), 2000)
    return () => { clearTimeout(t); el.classList.remove('message-highlight') }
  }, [targetMessageId, isLoading])

  const handleImageSelect = async (file: File) => {
    if (!channelId) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('channelId', channelId)
      const res = await fetchWithAuth('/api/attachments/upload', { method: 'POST', body: formData })
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

  const registerGoogleDocsLinks = (text: string) => {
    if (!channelId) return
    const urls = extractGoogleDocsUrls(text)
    if (urls.length === 0) return
    for (const url of urls) {
      void fetchWithAuth('/api/external-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, channelId }),
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['project-files'] })
      }).catch(() => {})
    }
  }

  const send = () => {
    const rawText = draft.trim()
    if ((!rawText && pendingAttachments.length === 0) || !channelId) return
    const text = transformContent(rawText)
    mentionMapRef.current.clear()

    // Google Docs URL を検出してファイルタブに自動登録
    if (text) registerGoogleDocsLinks(text)

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

  const placeholder: React.ReactNode = channelName ? (
    <>
      <Icon name={isPrivate ? 'lock' : 'hash'} size={isPrivate ? 12 : 13} color="var(--text-4)" strokeWidth={2}/>
      <span>{channelName} にメッセージ送信</span>
    </>
  ) : 'メッセージを入力...'

  const handleTextFileCreated = (file: File) => {
    setShowTextFileDialog(false)
    void handleImageSelect(file)
  }

  return (
    <>
      {showTextFileDialog && (
        <CreateTextFileDialog
          onClose={() => setShowTextFileDialog(false)}
          onCreated={handleTextFileCreated}
        />
      )}
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
              senderId={m.senderId}
              currentUserId={currentUser?.id}
              senderName={m.senderName}
              senderAvatarUrl={m.senderAvatarUrl}
              createdAt={m.createdAt}
              isEdited={m.isEdited}
              content={m.content}
              reactions={m.reactions}
              attachments={m.attachments}
              onReact={(messageId, emoji) => reactMutation.mutate({ messageId, emoji })}
              onEdit={(messageId, content) => editMutation.mutate({ messageId, content })}
              onDelete={(messageId) => deleteMutation.mutate(messageId)}
              {...(compact ? { compact: true } : {})}
              {...(isMobile ? { isMobile: true } : {})}
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
        mentionMembers={mentionMembers}
        onMentionInserted={onMentionInserted}
        onCreateTextFile={() => setShowTextFileDialog(true)}
        {...(compact ? { compact: true } : {})}
      />
    </>
  )
}
