// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { AttachmentDto, MessageType } from '@cairn/shared'
import type { ReplyToDto } from '@/app/api/channels/[channelId]/messages/route'
import type { AiNudgeDto } from '@/app/api/ai/nudges/route'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from './primitives'
import { ConfirmDialog } from './confirm-dialog'
import { RowActionMenu } from './row-action-menu'
import { EmojiPicker } from './emoji-picker'
import { Icon } from './primitives'
import { FileTypeIcon } from './file-type-icon'
import { CreateTextFileDialog } from './create-text-file-dialog'
import { MarkdownContent } from './markdown-content'
import { ImageLightbox, type LightboxImage } from './image-lightbox'
import {
  formatChatMessageTime,
  useChannelMessages,
  useChannelMembers,
  useCurrentUser,
  useDeleteMessage,
  useEditMessage,
  useEnsureMessageLoaded,
  useMarkChannelRead,
  useSendChannelMessage,
  useToggleBookmark,
  useToggleMessageReaction,
  useWorkspaceMembers,
  useProjectChannels,
  ChannelMessagesError,
} from '@/lib/chat/client'
import { useProjectMembers } from '@/hooks/use-project-members'
import { isImeConfirmingEnter } from '@/lib/chat/ime'
import { stripMentionsToText } from '@/lib/chat/mentions'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { chatDraftKey } from '@/lib/storage-keys'
import { useCommand } from '@/lib/command-registry'
import { toast } from '@/lib/toast'
import { GENERIC_MIME_TYPES, resolveAttachmentMimeType } from '@/lib/attachments'
import { aiNudgeQueryKey, useAiNudgeFeedback, useAiNudges } from '@/hooks/use-ai-nudges'

const GOOGLE_DOCS_URL_RE = /https:\/\/(?:docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*|drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+(?:\/[^\s]*)*)/g

function extractGoogleDocsUrls(text: string): string[] {
  const matches = text.match(GOOGLE_DOCS_URL_RE) ?? []
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)>]+$/, '')))]
}

// MIME タイプに加えて拡張子も列挙する。OS が拡張子→MIME のマッピングを持たない
// 環境ではファイルピッカーが MIME 指定だけだと PDF 等を選択不可にしてしまうため。
const ACCEPT_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  // OS/ブラウザが.csvにtext/csvを正しく対応付けられない環境では、
  // MIMEタイプのみのacceptだとネイティブファイル選択ダイアログで.csvが除外されてしまうため、
  // 拡張子も明示してnormalizeMimeType側の救済ロジックまで到達できるようにする
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx',
  '.txt', '.md', '.markdown', '.csv',
].join(',')

function isImageMime(mimeType: string | null): boolean {
  return mimeType?.startsWith('image/') ?? false
}

// 引用バーやプレビューでは Markdown を描画せず、メンション記法を素朴な @表示名 に戻した一行テキストにする。
// 通知バーと同じ stripMentionsToText を使い、canonical な `<@userId>` も旧形式 `<@userId|名前>` も可読化する。
// 送信/編集直後の楽観・POST/PATCH レスポンスはメンションが canonical のままキャッシュに載るため、
// nameOf（ワークスペースメンバーの userId→表示名）を渡して GET 再取得前でも @不明なメンバー を避ける
function toPlainSnippet(content: string, nameOf?: (userId: string) => string | undefined): string {
  return stripMentionsToText(content, nameOf)
    .replace(/\s+/g, ' ')
    .trim()
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

export async function copyMessageContent(content: string): Promise<boolean> {
  if (!content.length) return false
  try {
    await navigator.clipboard.writeText(content)
    toast.success('メッセージをコピーしました')
    return true
  } catch {
    toast.error('メッセージをコピーできませんでした')
    return false
  }
}

interface PendingAttachment {
  fileId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  previewUrl: string
}

interface PersistedDraft {
  text: string
  attachments: Omit<PendingAttachment, 'previewUrl'>[]
}

// ─── Message ──────────────────────────────────────────────────────

export const ChatMessage = React.memo(function ChatMessage({ messageId, messageType, senderId, currentUserId, senderName, senderAvatarUrl, senderEmail, createdAt, isEdited, content, reactions, attachments, replyTo, bookmarked, onReact, onEdit, onDelete, onCheckboxToggle, onReply, onBookmark, onJumpToMessage, onCopyLink, onImageClick, mentionNames, compact, isMobile, focused }: {
  messageId: string
  messageType: MessageType
  senderId: string
  currentUserId: string | undefined
  senderName: string
  senderAvatarUrl?: string | null
  senderEmail?: string | null
  createdAt: string
  isEdited: boolean
  content: string
  reactions: Array<{ emoji: string; count: number; mine: boolean; userNames: string[] }>
  attachments: AttachmentDto[]
  replyTo: ReplyToDto | null
  bookmarked: boolean
  onReact: (messageId: string, emoji: string) => void
  onEdit: (messageId: string, content: string) => void
  onDelete: (messageId: string) => void
  onCheckboxToggle: (messageId: string, index: number, checked: boolean) => void
  onReply: (messageId: string) => void
  onBookmark: (messageId: string) => void
  onJumpToMessage: (messageId: string) => void
  onCopyLink: (messageId: string) => void
  onImageClick: (attachmentId: string) => void
  mentionNames?: Map<string, string>
  compact?: boolean
  isMobile?: boolean
  focused?: boolean
}) {
  const [showPicker, setShowPicker] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)
  const [editDraft, setEditDraft] = React.useState('')
  const [editComposing, setEditComposing] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState(false)
  const [hoveredReaction, setHoveredReaction] = React.useState<number | null>(null)
  const addBtnRef = React.useRef<HTMLButtonElement>(null)
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const avatarSize = compact ? 30 : 36
  const px = compact ? '8px 14px' : '6px 16px'
  const emojiOnly = isEmojiOnly(content)
  const isOwn = currentUserId === senderId
  const canCopy = content.length > 0

  const startEdit = () => {
    setEditDraft(content)
    setEditMode(true)
  }

  // 編集モードに入ったら確実に textarea をフォーカスする（rAF は commit 前に走り不安定なため effect で）
  React.useEffect(() => {
    if (!editMode) return
    const el = editTextareaRef.current
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }, [editMode])

  // メッセージ選択中のキーボード操作（e=編集 / r=リアクション / d=削除）を受ける
  React.useEffect(() => {
    const onEditEvt = (e: Event) => { if ((e as CustomEvent<string>).detail === messageId && isOwn) startEdit() }
    const onReactEvt = (e: Event) => { if ((e as CustomEvent<string>).detail === messageId) setShowPicker(true) }
    const onDeleteEvt = (e: Event) => { if ((e as CustomEvent<string>).detail === messageId && isOwn) setDeleteConfirm(true) }
    window.addEventListener('cairn:edit-message', onEditEvt)
    window.addEventListener('cairn:react-message', onReactEvt)
    window.addEventListener('cairn:delete-message', onDeleteEvt)
    return () => {
      window.removeEventListener('cairn:edit-message', onEditEvt)
      window.removeEventListener('cairn:react-message', onReactEvt)
      window.removeEventListener('cairn:delete-message', onDeleteEvt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, isOwn, content])

  const submitEdit = () => {
    const trimmed = editDraft.trim()
    if (trimmed && trimmed !== content) onEdit(messageId, trimmed)
    setEditMode(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditMode(false) }
    if (e.key === 'Enter' && !e.shiftKey) {
      // スマホは Enter を改行に使い、保存はボタンのみ（誤操作防止）
      if (isMobile) return
      if (isImeConfirmingEnter(e, editComposing)) return
      e.preventDefault()
      submitEdit()
    }
  }

  // ホバーツールバー（モバイルは常時表示、PC はホバー時）。返信・ブックマークは全メッセージ、コピーは内容がある場合、編集/削除は自分のみ
  const handleCopy = React.useCallback(() => {
    void copyMessageContent(content)
  }, [content])

  // MarkdownContent の React.memo を効かせるため、チェックボックストグルを安定参照で渡す
  const handleCheckboxToggle = React.useCallback(
    (index: number, checked: boolean) => onCheckboxToggle(messageId, index, checked),
    [onCheckboxToggle, messageId],
  )

  // システムメッセージ（プロジェクトのステータス・日程・概要変更の通知）は中央寄せの控えめな1行で表示する
  if (messageType === 'system') {
    return (
      <div data-message-id={messageId} style={{ display: 'flex', justifyContent: 'center', padding: '6px 16px' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)', background: 'var(--card-2)', border: '1px solid var(--divider)', borderRadius: 999, padding: '3px 12px', textAlign: 'center', lineHeight: 1.5 }}>
          {toPlainSnippet(content, id => mentionNames?.get(id))}
        </span>
      </div>
    )
  }

  const menuActions = [
    { icon: 'link' as const, label: 'リンクをコピー', onSelect: () => onCopyLink(messageId) },
    ...(canCopy ? [{ icon: 'copy' as const, label: 'コピー', onSelect: handleCopy }] : []),
    ...(isOwn ? [
      { icon: 'edit' as const, label: '編集', onSelect: startEdit },
      { icon: 'trash' as const, label: '削除', danger: true, onSelect: () => setDeleteConfirm(true) },
    ] : []),
  ]
  const iconBtnStyle: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 3, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }
  const messageActions = !editMode && (isMobile || hovered) && (
    <div style={isMobile
      ? { flexShrink: 0, alignSelf: 'flex-start', paddingTop: 2, display: 'flex', alignItems: 'center', gap: 2 }
      : { position: 'absolute', top: 4, right: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '1px 3px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 1 }
    }>
      <button onClick={() => onReply(messageId)} title="返信" style={iconBtnStyle}>
        <Icon name="reply" size={14}/>
      </button>
      <button onClick={() => onBookmark(messageId)} title={bookmarked ? 'ブックマーク解除' : 'ブックマーク'} style={{ ...iconBtnStyle, color: bookmarked ? 'var(--accent)' : 'var(--text-3)' }}>
        <Icon name="bookmark" size={14}/>
      </button>
      <RowActionMenu actions={menuActions}/>
    </div>
  )

  return (
    <div
      data-message-id={messageId}
      style={{
        display: 'flex', gap: compact ? 8 : 12, padding: px, alignItems: 'flex-start', position: 'relative',
        background: focused ? 'var(--accent-soft)' : hovered ? 'var(--card-2)' : 'transparent',
        borderLeft: focused ? '3px solid var(--accent)' : '3px solid transparent',
        transition: 'background .1s, border-color .1s',
      }}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
    >
      <div title={senderEmail ?? undefined}>
        <Avatar name={senderName} url={senderAvatarUrl ?? null} size={avatarSize}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={senderEmail ?? undefined} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: 'var(--text)' }}>{senderName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{formatChatMessageTime(createdAt)}</span>
          {isEdited && <span style={{ fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>編集済み</span>}
        </div>
        {replyTo && (
          <button
            onClick={() => !replyTo.isDeleted && onJumpToMessage(replyTo.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '2px 8px',
              borderLeft: '2px solid var(--accent)', background: 'transparent',
              cursor: replyTo.isDeleted ? 'default' : 'pointer', width: '100%', maxWidth: '100%',
              minWidth: 0, overflow: 'hidden', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <Icon name="reply" size={11} color="var(--text-4)"/>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', flexShrink: 0 }}>{replyTo.senderName}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-4)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.isDeleted ? '削除されたメッセージ' : toPlainSnippet(replyTo.content, id => mentionNames?.get(id)) || '（添付ファイル）'}
            </span>
          </button>
        )}
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
            <div style={{ fontSize: emojiOnly ? 40 : compact ? 13 : 13.5, color: 'var(--text-2)', lineHeight: emojiOnly ? 1.2 : 1.6 }}>
              {emojiOnly ? content : (
                <MarkdownContent
                  content={content}
                  fontSize={compact ? 13 : 13.5}
                  lineHeight={1.6}
                  mentionNames={mentionNames}
                  onCheckboxToggle={handleCheckboxToggle}
                />
              )}
            </div>
          )
        )}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: content ? 8 : 4 }}>
            {attachments.map(a => isImageMime(a.mimeType) ? (
              <img
                key={a.fileId}
                src={`/api/attachments/${a.fileId}?thumb=1`}
                alt={a.fileName}
                onClick={() => onImageClick(a.id)}
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
            <span key={i} style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={() => !isMobile && setHoveredReaction(i)}
              onMouseLeave={() => !isMobile && setHoveredReaction(null)}
            >
              <button onClick={() => onReact(messageId, r.emoji)} style={{
                height: compact ? 22 : 24, padding: '0 7px', borderRadius: 12,
                background: r.mine ? 'var(--accent-soft)' : 'var(--card-2)',
                border: `1px solid ${r.mine ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 11, fontWeight: 600,
                color: r.mine ? 'var(--accent-text)' : 'var(--text-2)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{r.emoji} {r.count}</button>
              {/* PC: ホバーでリアクションしたユーザーを一覧表示（モバイルはネイティブ長押しで表示するため不要） */}
              {hoveredReaction === i && r.userNames.length > 0 && (
                <span style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6,
                  background: 'var(--text)', color: 'var(--bg)', borderRadius: 6, padding: '5px 9px',
                  fontSize: 11, fontWeight: 500, lineHeight: 1.4, whiteSpace: 'nowrap', zIndex: 100,
                  boxShadow: 'var(--shadow-lg)', pointerEvents: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.userNames.join('、')}
                </span>
              )}
            </span>
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
      {messageActions}

      <ConfirmDialog
        open={deleteConfirm}
        title="メッセージを削除"
        message="このメッセージを削除しますか？この操作は取り消せません。"
        onConfirm={() => onDelete(messageId)}
        onClose={() => setDeleteConfirm(false)}
      />
    </div>
  )
})

// ─── Input ────────────────────────────────────────────────────────

const ChatInputBar = ({ placeholder, draft, setDraft, send, isPending, sendError, setSendError, isComposing, setIsComposing, compact, isMobile, pendingAttachments, onFilesSelect, onRemoveAttachment, isUploading, mentionMembers, mentionNames, onMentionInserted, onCreateTextFile, replyTarget, onCancelReply }: {
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
  isMobile?: boolean
  pendingAttachments: PendingAttachment[]
  onFilesSelect: (files: File[]) => void
  onRemoveAttachment: (fileId: string) => void
  isUploading: boolean
  mentionMembers?: { userId: string; displayName: string }[]
  mentionNames?: Map<string, string>
  onMentionInserted?: (userId: string, displayName: string) => void
  onCreateTextFile: () => void
  replyTarget: ReplyToDto | null
  onCancelReply: () => void
}) => {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const dragCounterRef = React.useRef(0)

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length > 0) {
      e.preventDefault()
      onFilesSelect(files)
    }
  }

  const hasFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    setIsDragOver(true)
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.stopPropagation()
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFilesSelect(files)
  }

  const dropHandlers = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  }

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
  const compactInputRef = React.useRef<HTMLTextAreaElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)

  // ⌥I: メッセージ入力欄にフォーカス
  useCommand('chats.focusComposer', () => (textareaRef.current ?? compactInputRef.current)?.focus())

  // テキストエリアの高さを内容に合わせて自動調整する（改行・長文で行が増えても見切れないように）
  React.useEffect(() => {
    const el = textareaRef.current ?? compactInputRef.current
    if (!el) return
    const max = compact ? 240 : 320
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }, [draft, compact])

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
    } else if (e.key === 'Escape') {
      // メンション候補が無い時の Esc は入力欄から離脱（ブラー）する
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).blur()
      return
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
      // ハイライトは文字送り幅を変えない装飾のみにする。padding / fontWeight / fontSize を変えると
      // 透明な実テキスト（キャレット基準）とオーバーレイの表示位置がずれ、メンション後にカーソルがずれて見える
      nodes.push(<span key={`m${match.index}`} style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 4 }}>@{match[1]}</span>)
      last = match.index + match[0]!.length
    }
    if (nodes.length === 0) return null
    if (last < draft.length) nodes.push(<span key="last" style={{ color: 'var(--text)' }}>{draft.slice(last)}</span>)
    return nodes
  }, [draft, insertedMentionNames])

  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !isPending && !isUploading

  // 返信開始時に入力欄へフォーカスする
  React.useEffect(() => {
    if (replyTarget) (textareaRef.current ?? compactInputRef.current)?.focus()
  }, [replyTarget])

  const ReplyPreview = replyTarget ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '6px 10px' : '8px 14px', borderBottom: '1px solid var(--divider)' }}>
      <Icon name="reply" size={13} color="var(--accent)"/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{replyTarget.senderName} に返信</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {toPlainSnippet(replyTarget.content, id => mentionNames?.get(id)) || '（添付ファイル）'}
        </div>
      </div>
      <button onClick={onCancelReply} title="返信をキャンセル" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
        <Icon name="close" size={14}/>
      </button>
    </div>
  ) : null

  const AttachmentPreviews = pendingAttachments.length > 0 || isUploading ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: compact ? '6px 10px 0' : '6px 14px 0' }}>
      {pendingAttachments.map(a => (
        <div key={a.fileId} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          {isImageMime(a.mimeType) && a.previewUrl ? (
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

  const makeFileHandler = () => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) { onFilesSelect(files); e.target.value = '' }
  }

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT_FILE_TYPES}
      multiple
      style={{ display: 'none' }}
      onChange={makeFileHandler()}
    />
  )

  const hiddenImageInput = (
    <input
      ref={imageInputRef}
      type="file"
      accept="image/*"
      multiple
      style={{ display: 'none' }}
      onChange={makeFileHandler()}
    />
  )

  const hiddenDocInput = (
    <input
      ref={docInputRef}
      type="file"
      multiple
      style={{ display: 'none' }}
      onChange={makeFileHandler()}
    />
  )

  if (compact) {
    return (
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--divider)', position: 'relative' }} {...dropHandlers}>
        {hiddenFileInput}
        {sendError && (
          <div style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚠️ {sendError}</span>
            <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
        )}
        {isDragOver && (
          <div style={{ position: 'absolute', inset: 6, zIndex: 10, borderRadius: 10, background: 'var(--accent-soft)', border: '2px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>ドロップしてアップロード</span>
          </div>
        )}
        <div style={{ background: 'var(--card-2)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
          {ReplyPreview}
          {AttachmentPreviews}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '7px 10px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              {MentionPicker}
              {typeof placeholder !== 'string' && !draft && (
                <div style={{ position: 'absolute', top: 2, left: 0, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-4)', fontSize: 13 }}>
                  {placeholder}
                </div>
              )}
              {draftOverlay && (
                <div ref={overlayRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '2px 0', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none', overflow: 'hidden', maxHeight: 240 }}>
                  {draftOverlay}
                </div>
              )}
              <textarea
                ref={compactInputRef}
                value={draft}
                onChange={e => { setDraft(e.target.value); detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={e => handleKeyDownWithMention(e, () => {
                  if (e.key !== 'Enter' || e.shiftKey) return
                  // スマホは Enter を改行に使い、送信はボタンのみ（誤送信防止）
                  if (isMobile) return
                  if (isImeConfirmingEnter(e, isComposing)) return
                  e.preventDefault()
                  send()
                })}
                onPaste={handlePaste}
                onScroll={draftOverlay ? e => { if (overlayRef.current) overlayRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop } : undefined}
                placeholder={typeof placeholder === 'string' ? placeholder : ''}
                rows={1}
                style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', fontSize: 13, color: draftOverlay ? 'transparent' : 'var(--text)', caretColor: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 20, maxHeight: 240, boxSizing: 'border-box' }}
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
    <div style={{ padding: '8px 24px 18px', background: 'var(--bg)', position: 'relative' }} {...dropHandlers}>
      {hiddenFileInput}
      {hiddenImageInput}
      {hiddenDocInput}
      {sendError && (
        <div style={{ marginBottom: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {sendError}</span>
          <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
        </div>
      )}
      {isDragOver && (
        <div style={{ position: 'absolute', inset: '8px 24px 18px', zIndex: 10, borderRadius: 12, background: 'var(--accent-soft)', border: '2px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent)' }}>ドロップしてアップロード</span>
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
        {ReplyPreview}
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
              <div ref={overlayRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '2px 0', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none', overflow: 'hidden', maxHeight: 320 }}>
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
                // スマホは Enter を改行に使い、送信はボタンのみ（誤送信防止）
                if (isMobile) return
                if (isImeConfirmingEnter(e, isComposing)) return
                e.preventDefault()
                send()
              })}
              onPaste={handlePaste}
              onScroll={draftOverlay ? e => { if (overlayRef.current) overlayRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop } : undefined}
              placeholder={typeof placeholder === 'string' ? placeholder : ''}
              rows={1}
              style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', fontSize: 14, color: draftOverlay ? 'transparent' : 'var(--text)', caretColor: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 320, boxSizing: 'border-box' }}
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

// ─── Private AI nudge ─────────────────────────────────────────────

const AiNudgeCard = ({
  nudge,
  feedbackPending,
  completing,
  onFeedback,
  onComplete,
}: {
  nudge: AiNudgeDto
  feedbackPending: boolean
  completing: boolean
  onFeedback: (feedback: 'later' | 'not_helpful') => void
  onComplete: () => void
}) => (
  <article
    data-nudge-id={nudge.id}
    style={{ margin: '10px 16px', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="sparkles" size={14}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>AI PMO · {nudge.title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--accent-text)', marginTop: 1 }}>このメッセージはあなただけに見えています</div>
      </div>
      <time style={{ marginLeft: 'auto', alignSelf: 'flex-start', fontSize: 10.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
        {formatChatMessageTime(nudge.createdAt)}
      </time>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{nudge.body}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      {nudge.taskId && (
        <a
          href={`/tasks?taskId=${encodeURIComponent(nudge.taskId)}`}
          className="btn btn-ghost"
          style={{ height: 28, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
        >
          <Icon name="external-link" size={11}/> タスクを開く
        </a>
      )}
      {nudge.taskId && (
        <button className="btn btn-ghost" style={{ height: 28, padding: '0 9px', fontSize: 11.5 }} onClick={onComplete} disabled={completing || feedbackPending}>
          {completing ? '更新中…' : '完了にする'}
        </button>
      )}
      <button className="btn btn-ghost" style={{ height: 28, padding: '0 9px', fontSize: 11.5 }} onClick={() => onFeedback('later')} disabled={feedbackPending || completing}>
        あとで
      </button>
      <button className="btn btn-ghost" style={{ height: 28, padding: '0 9px', fontSize: 11.5 }} onClick={() => onFeedback('not_helpful')} disabled={feedbackPending || completing}>
        これは問題ない
      </button>
    </div>
  </article>
)

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
  const [replyTarget, setReplyTarget] = React.useState<ReplyToDto | null>(null)
  // ジャンプ/ハイライト対象（パーマリンク・検索・引用バークリックで設定される）
  const [highlightId, setHighlightId] = React.useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [focusedMsgIdx, setFocusedMsgIdx] = React.useState(-1)
  const [completingNudgeId, setCompletingNudgeId] = React.useState<string | null>(null)
  const [nudgeActionError, setNudgeActionError] = React.useState<string | null>(null)
  const pendingDraftRef = React.useRef('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  // displayName → userId map for structured mention serialization
  const mentionMapRef = React.useRef<Map<string, string>>(new Map())
  // Ref to latest draft state for cleanup-time saves (avoids stale closure)
  const latestDraftRef = React.useRef({ draft: '', pendingAttachments: [] as PendingAttachment[] })
  latestDraftRef.current = { draft, pendingAttachments }

  const persistDraft = React.useCallback((id: string, text: string, attachments: PendingAttachment[]) => {
    const key = chatDraftKey(id)
    const payload: PersistedDraft = {
      text,
      attachments: attachments.map(({ previewUrl: _url, ...rest }) => rest),
    }
    if (payload.text || payload.attachments.length > 0) {
      localStorage.setItem(key, JSON.stringify(payload))
    } else {
      localStorage.removeItem(key)
    }
  }, [])

  // channelId 切り替え時: 旧チャンネルのドラフトを保存し、新チャンネルのドラフトを復元
  React.useEffect(() => {
    if (!channelId) {
      setDraft('')
      setPendingAttachments([])
      return
    }
    const saved = localStorage.getItem(chatDraftKey(channelId))
    if (saved) {
      try {
        const parsed: PersistedDraft = JSON.parse(saved)
        setDraft(parsed.text ?? '')
        // blob URL は復元不可なので空文字にしてファイル名表示にフォールバック
        setPendingAttachments((parsed.attachments ?? []).map(a => ({ ...a, previewUrl: '' })))
      } catch {
        setDraft('')
        setPendingAttachments([])
      }
    } else {
      setDraft('')
      setPendingAttachments([])
    }
    return () => {
      const { draft: d, pendingAttachments: p } = latestDraftRef.current
      persistDraft(channelId, d, p)
    }
  }, [channelId, persistDraft])

  // 300ms デバウンスで自動保存（ページリロード対策）
  React.useEffect(() => {
    if (!channelId) return
    const timer = setTimeout(() => persistDraft(channelId, draft, pendingAttachments), 300)
    return () => clearTimeout(timer)
  }, [channelId, draft, pendingAttachments, persistDraft])

  const onMentionInserted = React.useCallback((userId: string, displayName: string) => {
    mentionMapRef.current.set(displayName, userId)
  }, [])

  // 保存形式は canonical な `<@userId>`。表示名は read 時に解決するため本文に焼き込まない
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
        `<@${userId}>`,
      )
    }
    return result
  }

  const { data: currentUser } = useCurrentUser()
  const { data: messages = [], isLoading, isError, error: messagesError } = useChannelMessages(channelId)
  const { data: nudges = [], isError: nudgesError } = useAiNudges(channelId)
  const nudgeFeedback = useAiNudgeFeedback(channelId)
  // アクセス権のないチャンネル（参加外プロジェクトのゲスト等）は 403 を返す。
  // 生のエラーではなく「参加していない」ことを明示する案内を出す。
  const isAccessDenied = messagesError instanceof ChannelMessagesError && messagesError.status === 403
  const { data: wsMembers = [] } = useWorkspaceMembers()
  const { data: chMemberIds = [] } = useChannelMembers(channelId)
  const { data: projectChannels = [] } = useProjectChannels()
  // このチャンネルがプロジェクトチャンネルなら projectId を引く（メンション候補の絞り込み用）
  const projectId = React.useMemo(
    () => projectChannels.find(c => c.channelId === channelId)?.projectId ?? null,
    [projectChannels, channelId],
  )
  const { data: projectMembers = [] } = useProjectMembers(projectId)
  const sendMutation = useSendChannelMessage(channelId, currentUser)
  const reactMutation = useToggleMessageReaction(channelId, currentUser)
  const bookmarkMutation = useToggleBookmark(channelId)
  const editMutation = useEditMessage(channelId)
  const deleteMutation = useDeleteMessage(channelId)
  const markChannelRead = useMarkChannelRead()
  const markChannelReadFn = markChannelRead.mutate
  const lastReadMessageIdRef = React.useRef<string | null>(null)
  const ensureMessageLoaded = useEnsureMessageLoaded(channelId)

  const timeline = React.useMemo(() => [
    ...messages.map((message, index) => ({ kind: 'message' as const, createdAt: message.createdAt, message, messageIndex: index })),
    ...nudges.map(nudge => ({ kind: 'nudge' as const, createdAt: nudge.createdAt, nudge })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [messages, nudges])

  const handleNudgeFeedback = React.useCallback((id: string, feedback: 'later' | 'not_helpful') => {
    setNudgeActionError(null)
    nudgeFeedback.mutate({ id, feedback }, {
      onError: error => setNudgeActionError((error as Error).message),
    })
  }, [nudgeFeedback])

  const handleCompleteNudgeTask = React.useCallback(async (nudge: AiNudgeDto) => {
    if (!nudge.taskId) return
    setCompletingNudgeId(nudge.id)
    setNudgeActionError(null)
    try {
      const res = await fetchWithAuth(`/api/tasks/${nudge.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'タスクの更新に失敗しました')
      }
      // DB 上の resolved 化は次のハートビートが担う。操作直後は完了したカードだけを
      // ローカルから除き、同じ画面で解消済みの催促を残さない。
      queryClient.setQueryData<AiNudgeDto[]>(aiNudgeQueryKey(channelId), current =>
        current?.filter(item => item.id !== nudge.id) ?? [])
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    } catch (error) {
      setNudgeActionError((error as Error).message)
    } finally {
      setCompletingNudgeId(null)
    }
  }, [channelId, queryClient])

  // 表示中チャンネルに新着が届いたら自動で既読化する。
  // 開いて読んでいるのにバッジが増え続ける問題への対処。タブ非表示時は既読にしない
  React.useEffect(() => {
    if (!channelId || messages.length === 0) return
    const lastId = messages[messages.length - 1]?.id
    if (!lastId || lastId.startsWith('optimistic-')) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    if (lastReadMessageIdRef.current === lastId) return
    lastReadMessageIdRef.current = lastId
    markChannelReadFn(channelId)
  }, [channelId, messages, markChannelReadFn])

  const handleCheckboxToggle = React.useCallback(async (messageId: string, index: number, checked: boolean) => {
    try {
      const res = await fetchWithAuth(`/api/messages/${messageId}/checkbox`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, checked }),
      })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] })
      }
    } catch {
      // サイレントに失敗
    }
  }, [channelId, queryClient])

  // スレッド内の全画像添付をフラットに集約し、ライトボックスで前後に送れるようにする
  const lightboxImages = React.useMemo<(LightboxImage & { attachmentId: string })[]>(() => {
    const imgs: (LightboxImage & { attachmentId: string })[] = []
    for (const m of messages) {
      for (const a of m.attachments) {
        if (isImageMime(a.mimeType)) {
          imgs.push({ attachmentId: a.id, key: a.id, src: `/api/attachments/${a.fileId}`, alt: a.fileName, caption: a.fileName })
        }
      }
    }
    return imgs
  }, [messages])

  const openLightbox = React.useCallback((attachmentId: string) => {
    setLightboxIndex(prev => {
      const idx = lightboxImages.findIndex(img => img.attachmentId === attachmentId)
      return idx >= 0 ? idx : prev
    })
  }, [lightboxImages])

  const mentionMembers = React.useMemo(() => {
    // プライベートチャンネル・DM はチャンネルメンバーのみを候補にする
    if (chMemberIds.length > 0) {
      const idSet = new Set(chMemberIds.map(m => m.userId))
      return wsMembers.filter(m => idSet.has(m.userId) && m.userId !== currentUser?.id)
    }
    // プロジェクトチャンネルは、そのプロジェクトにアクセスできる人だけを候補にする。
    // member 以上は全プロジェクトチャンネルにアクセスできるため候補に残し、
    // guest は参加プロジェクト（project_members）に居る場合のみ候補にする。
    // これによりアクセスできない人へメンション通知が飛ぶのを未然に防ぐ（サーバー側でも防御）。
    if (projectId) {
      const projectMemberIds = new Set(projectMembers.map(m => m.userId))
      return wsMembers.filter(m =>
        m.userId !== currentUser?.id &&
        (m.role !== 'guest' || projectMemberIds.has(m.userId)),
      )
    }
    return wsMembers.filter(m => m.userId !== currentUser?.id)
  }, [chMemberIds, wsMembers, currentUser?.id, projectId, projectMembers])

  // userId → 現在の表示名。メンションを描画時に最新名へ解決するため
  // （保存本文は名前なしの `<@userId>` であり、楽観更新メッセージもこのマップで解決する）
  const mentionNames = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of wsMembers) map.set(m.userId, m.displayName)
    return map
  }, [wsMembers])
  const emailByUserId = React.useMemo(() => {
    const map = new Map<string, string | null>()
    for (const m of wsMembers) map.set(m.userId, m.email ?? null)
    return map
  }, [wsMembers])

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
  }, [messages.length, nudges.length])

  // チャンネル切替時にフォーカスをリセット
  React.useEffect(() => { setFocusedMsgIdx(-1) }, [channelId])

  // 上下矢印キーでメッセージ選択（入力欄フォーカス時は無効）
  React.useEffect(() => {
    if (messages.length === 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      e.preventDefault()
      setFocusedMsgIdx(prev => {
        if (e.code === 'ArrowDown') return Math.min(prev + 1, messages.length - 1)
        return Math.max(prev - 1, 0)
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [messages.length])

  // フォーカス中のメッセージへスクロール
  React.useEffect(() => {
    if (focusedMsgIdx < 0 || focusedMsgIdx >= messages.length) return
    const msgId = messages[focusedMsgIdx]?.id
    if (!msgId || !scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-message-id="${msgId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedMsgIdx, messages])

  // フォーカス中のメッセージに対するキーボードアクション
  React.useEffect(() => {
    if (focusedMsgIdx < 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      const msg = messages[focusedMsgIdx]
      if (!msg) return
      const isOwn = msg.senderId === currentUser?.id
      if (e.key === 'Escape') {
        e.preventDefault()
        setFocusedMsgIdx(-1)
      } else if (e.key === 'e' && isOwn) {
        // 編集モードに入る（ChatMessage 側で editMode を起動）
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:edit-message', { detail: msg.id }))
      } else if (e.key === 'r') {
        // リアクション（絵文字ピッカーを開く）
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:react-message', { detail: msg.id }))
      } else if ((e.key === 'd' || e.key === 'Delete') && isOwn) {
        // 削除（確認ダイアログを開く・自分のメッセージのみ）
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cairn:delete-message', { detail: msg.id }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedMsgIdx, messages, currentUser])

  // チャンネル切替時は返信対象・ハイライトをリセットする
  React.useEffect(() => {
    setReplyTarget(null)
    setHighlightId(null)
  }, [channelId])

  // 親（PageChat）からの targetMessageId（パーマリンク・ブックマーク・検索）を内部のハイライト状態へ取り込む。
  // 直近100件の外にある古いメッセージの場合は、前後ウィンドウを取得してキャッシュへマージする
  React.useEffect(() => {
    if (!targetMessageId) return
    setHighlightId(targetMessageId)
    void ensureMessageLoaded(targetMessageId)
  }, [targetMessageId, ensureMessageLoaded])

  // 引用バー（返信先プレビュー）クリックでのジャンプ。targetMessageId 同様、
  // 直近100件の外にある古い親メッセージの場合は前後ウィンドウを取得してから表示する
  const jumpToMessage = React.useCallback((messageId: string) => {
    setHighlightId(messageId)
    void ensureMessageLoaded(messageId)
  }, [ensureMessageLoaded])

  React.useEffect(() => {
    if (!highlightId || isLoading || !scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-message-id="${highlightId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('message-highlight')
    const t = setTimeout(() => { el.classList.remove('message-highlight'); setHighlightId(null) }, 2000)
    return () => { clearTimeout(t); el.classList.remove('message-highlight') }
  }, [highlightId, isLoading, messages.length])

  const handleReply = React.useCallback((messageId: string) => {
    // 送信中（楽観的更新）のメッセージはまだサーバーに存在しないため返信対象にしない
    if (messageId.startsWith('optimistic-')) return
    const m = messages.find(msg => msg.id === messageId)
    if (!m) return
    setReplyTarget({ id: m.id, senderName: m.senderName, content: m.content, isDeleted: false })
  }, [messages])

  const handleBookmark = React.useCallback((messageId: string) => {
    if (messageId.startsWith('optimistic-')) return
    bookmarkMutation.mutate(messageId)
  }, [bookmarkMutation])

  // リアクション・編集・削除のハンドラも安定参照にする。インラインの矢印関数だと毎レンダーで
  // 関数の同一性が変わり React.memo(ChatMessage) が無効化され、全メッセージが再パースされる
  const reactMutate = reactMutation.mutate
  const handleReact = React.useCallback((messageId: string, emoji: string) => {
    reactMutate({ messageId, emoji })
  }, [reactMutate])

  const editMutate = editMutation.mutate
  const handleEdit = React.useCallback((messageId: string, content: string) => {
    editMutate({ messageId, content })
  }, [editMutate])

  const deleteMutate = deleteMutation.mutate
  const handleDelete = React.useCallback((messageId: string) => {
    deleteMutate(messageId)
  }, [deleteMutate])

  const handleCopyLink = React.useCallback((messageId: string) => {
    if (!channelId) return
    const url = `${window.location.origin}/chats/${channelId}?m=${messageId}`
    void navigator.clipboard?.writeText(url)
  }, [channelId])

  const uploadFile = async (file: File): Promise<PendingAttachment | null> => {
    if (!channelId) return null
    try {
      let uploadMimeType = resolveAttachmentMimeType(file.name, file.type)
      if (!uploadMimeType && GENERIC_MIME_TYPES.has(file.type)) {
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
        uploadMimeType = resolveAttachmentMimeType(file.name, file.type, head)
      }
      if (!uploadMimeType) {
        const identifiable = file.name.includes('.') || !GENERIC_MIME_TYPES.has(file.type)
        setSendError(identifiable
          ? '対応していないファイル形式です（画像・PDF・Word・Excel・PowerPoint・CSV・テキスト）'
          : 'ファイル形式が不明です。拡張子をつけて再度アップロードしてください')
        return null
      }

      // 1. 署名付きアップロードURLを発行してもらう(メタデータのみ送信)。
      //    ファイル本体を /api/attachments/upload に直接送ると Vercel の
      //    4.5MB リクエストボディ上限(FUNCTION_PAYLOAD_TOO_LARGE)に阻まれるため。
      const urlRes = await fetchWithAuth('/api/attachments/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          fileName: file.name,
          mimeType: uploadMimeType,
          fileSize: file.size,
        }),
      })
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => ({})) as { error?: string }
        setSendError(data.error ?? 'アップロードに失敗しました')
        return null
      }
      const { token, path, storagePath, mimeType } = await urlRes.json() as {
        token: string; path: string; storagePath: string; mimeType: string
      }

      // 2. Supabase Storage へクライアントから直接アップロード(Vercel を経由しない)。
      //    storage-js は Blob/File を渡すと FormData 化し fileOptions.contentType を無視するため、
      //    Storage はファイル自身の File.type を見る。upload-url が正規化した MIME
      //    (例: .csv の application/octet-stream → text/csv) を反映させるには
      //    File.type がバケット許可リストに含まれる正規化後の値になっている必要がある。
      //    元の File.type が異なる場合は正規化後の type を持つ File でラップして渡す。
      const uploadBody = file.type === mimeType ? file : new File([file], file.name, { type: mimeType })
      const supabase = createSupabaseClient()
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .uploadToSignedUrl(path, token, uploadBody)
      if (uploadError) {
        setSendError('アップロードに失敗しました')
        return null
      }

      // 3. files レコードを登録し検索インデックスジョブを発火する
      const finalizeRes = await fetchWithAuth('/api/attachments/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          storagePath,
          fileName: file.name,
          mimeType: mimeType,
          fileSize: file.size,
        }),
      })
      if (!finalizeRes.ok) {
        const data = await finalizeRes.json().catch(() => ({})) as { error?: string }
        setSendError(data.error ?? 'アップロードに失敗しました')
        return null
      }
      const data = await finalizeRes.json() as { fileId: string; fileName: string; mimeType: string | null; fileSize: number | null }
      const previewUrl = URL.createObjectURL(file)
      return { ...data, previewUrl }
    } catch {
      setSendError('アップロードに失敗しました')
      return null
    }
  }

  const handleFilesSelect = async (files: File[]) => {
    if (!channelId || files.length === 0) return
    setIsUploading(true)
    try {
      const results = await Promise.all(files.map(uploadFile))
      const successful = results.filter((r): r is PendingAttachment => r !== null)
      if (successful.length > 0) setPendingAttachments(prev => [...prev, ...successful])
    } finally {
      setIsUploading(false)
    }
  }

  // メッセージ一覧エリアへのドラッグ&ドロップ
  const [isListDragOver, setIsListDragOver] = React.useState(false)
  const listDragCounterRef = React.useRef(0)
  const hasFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  const handleListDragEnter = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    listDragCounterRef.current += 1
    setIsListDragOver(true)
  }
  const handleListDragOver = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
  }
  const handleListDragLeave = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    listDragCounterRef.current = Math.max(0, listDragCounterRef.current - 1)
    if (listDragCounterRef.current === 0) setIsListDragOver(false)
  }
  const handleListDrop = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return
    e.preventDefault()
    listDragCounterRef.current = 0
    setIsListDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) void handleFilesSelect(files)
  }

  const handleRemoveAttachment = (fileId: string) => {
    setPendingAttachments(prev => {
      const removed = prev.find(a => a.fileId === fileId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter(a => a.fileId !== fileId)
    })
  }

  // Google Docs URL を検出してファイルタブ・チャンネルファイル一覧に自動登録する。
  // 完了を待たずにメッセージを送信すると、メッセージ挿入の Realtime broadcast が
  // リンクの files レコード挿入より先に飛び、他クライアントの channel-files invalidate が
  // 早すぎて新着リンクを取りこぼすことがあるため、呼び出し側で完了を待つ
  const registerGoogleDocsLinks = async (text: string): Promise<void> => {
    if (!channelId) return
    const urls = extractGoogleDocsUrls(text)
    if (urls.length === 0) return
    await Promise.allSettled(urls.map(url =>
      fetchWithAuth('/api/external-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, channelId }),
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['project-files'] })
        void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
      }),
    ))
  }

  const send = () => {
    const rawText = draft.trim()
    if ((!rawText && pendingAttachments.length === 0) || !channelId) return
    const text = transformContent(rawText)
    mentionMapRef.current.clear()

    pendingDraftRef.current = text
    setSendError(null)
    setDraft('')
    if (channelId) localStorage.removeItem(chatDraftKey(channelId))

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

    const replyTo = replyTarget
    setReplyTarget(null)

    const postMessage = () => {
      sendMutation.mutate({
        content: text,
        attachmentFileIds: optimisticAttachments.map(a => a.fileId),
        optimisticAttachments,
        ...(replyTo ? { parentMessageId: replyTo.id, optimisticReplyTo: replyTo } : {}),
      })
    }

    // 入力欄のクリア等は即座に反映しつつ、Google Docs リンクを含む場合のみ
    // 登録完了を待ってからメッセージを送信する
    if (text) {
      void registerGoogleDocsLinks(text).finally(postMessage)
    } else {
      postMessage()
    }
  }

  const placeholder: React.ReactNode = channelName ? (
    <>
      <Icon name={isPrivate ? 'lock' : 'hash'} size={isPrivate ? 12 : 13} color="var(--text-4)" strokeWidth={2}/>
      <span>{channelName} にメッセージ送信</span>
    </>
  ) : 'メッセージを入力...'

  const handleTextFileCreated = (file: File) => {
    setShowTextFileDialog(false)
    void handleFilesSelect([file])
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
      onDragEnter={handleListDragEnter}
      onDragOver={handleListDragOver}
      onDragLeave={handleListDragLeave}
      onDrop={handleListDrop}
    >
      {showTextFileDialog && (
        <CreateTextFileDialog
          onClose={() => setShowTextFileDialog(false)}
          onCreated={handleTextFileCreated}
        />
      )}
      {isListDragOver && (
        <div style={{ position: 'absolute', inset: 8, zIndex: 50, borderRadius: 12, background: 'var(--accent-soft)', border: '2px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>ファイルをドロップしてアップロード</span>
        </div>
      )}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: compact ? '8px 0 16px' : '16px 0' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>読み込み中...</div>
        ) : isAccessDenied ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 24px', textAlign: 'center' }}>
            <Icon name="lock" size={24} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>このチャンネルは表示できません</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.6 }}>
              このプロジェクトに参加していないため、チャットを開けません。閲覧するにはワークスペースの管理者にプロジェクトへの招待を依頼してください。
            </div>
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--red-text)', fontSize: 13 }}>メッセージの取得に失敗しました</div>
        ) : timeline.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>まだメッセージはありません。最初のメッセージを送ってみましょう！</div>
        ) : (
          timeline.map(item => item.kind === 'nudge' ? (
            <AiNudgeCard
              key={`nudge:${item.nudge.id}`}
              nudge={item.nudge}
              feedbackPending={nudgeFeedback.isPending}
              completing={completingNudgeId === item.nudge.id}
              onFeedback={feedback => handleNudgeFeedback(item.nudge.id, feedback)}
              onComplete={() => void handleCompleteNudgeTask(item.nudge)}
            />
          ) : (
            <ChatMessage
              key={item.message.id}
              messageId={item.message.id}
              messageType={item.message.messageType}
              senderId={item.message.senderId}
              currentUserId={currentUser?.id}
              senderName={item.message.senderName}
              senderAvatarUrl={item.message.senderAvatarUrl}
              senderEmail={emailByUserId.get(item.message.senderId) ?? null}
              createdAt={item.message.createdAt}
              isEdited={item.message.isEdited}
              content={item.message.content}
              reactions={item.message.reactions}
              attachments={item.message.attachments}
              replyTo={item.message.replyTo}
              bookmarked={item.message.bookmarked}
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCheckboxToggle={handleCheckboxToggle}
              onReply={handleReply}
              onBookmark={handleBookmark}
              onJumpToMessage={jumpToMessage}
              onCopyLink={handleCopyLink}
              onImageClick={openLightbox}
              focused={item.messageIndex === focusedMsgIdx}
              mentionNames={mentionNames}
              {...(compact ? { compact: true } : {})}
              {...(isMobile ? { isMobile: true } : {})}
            />
          ))
        )}
        {(nudgesError || nudgeActionError) && (
          <div role="alert" style={{ margin: '8px 16px', color: 'var(--red-text)', fontSize: 12 }}>
            {nudgeActionError ?? 'ナッジの取得に失敗しました'}
          </div>
        )}
      </div>
      {!isAccessDenied && (
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
        onFilesSelect={handleFilesSelect}
        onRemoveAttachment={handleRemoveAttachment}
        isUploading={isUploading}
        mentionMembers={mentionMembers}
        mentionNames={mentionNames}
        onMentionInserted={onMentionInserted}
        onCreateTextFile={() => setShowTextFileDialog(true)}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        {...(compact ? { compact: true } : {})}
        {...(isMobile ? { isMobile: true } : {})}
      />
      )}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={Math.min(lightboxIndex, lightboxImages.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
