'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの入力欄の添付。選んだ時点で会話にアップロードし、送信時は添付の ID だけを送る
// （本体はサーバーが Storage から読む。docs/10_ai_member_design.md「会話への添付」）。

import React from 'react'
import type { Attachment } from 'ai'
import { useT } from '@/components/locale-provider'
import { GENERIC_MIME_TYPES, resolveAttachmentMimeType } from '@/lib/attachments'
import {
  AI_ATTACHMENT_IMAGE_TYPES,
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_MAX_FILES,
  isAiAttachmentType,
} from '@/lib/ai/attachment-types'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { Icon } from './primitives'

export interface PendingAiAttachment {
  localId: string
  fileName: string
  mimeType: string
  status: 'uploading' | 'ready' | 'error'
  attachmentId?: string
  /** 画像のプレビュー（送信後のメッセージの表示にも使う） */
  previewUrl?: string
  error?: string
}

async function serverError(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' ? body.error : undefined
}

/** ファイルの形式を決める。拡張子・MIME で分からなければ先頭のバイト列で判定する */
async function resolveMimeType(file: File): Promise<string | null> {
  let mimeType = resolveAttachmentMimeType(file.name, file.type)
  if (!mimeType && GENERIC_MIME_TYPES.has(file.type)) {
    mimeType = resolveAttachmentMimeType(file.name, file.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  }
  return mimeType && isAiAttachmentType(mimeType) ? mimeType : null
}

export function useAiAttachments(conversationId: string) {
  const t = useT()
  const [pending, setPending] = React.useState<PendingAiAttachment[]>([])
  const [notice, setNotice] = React.useState<string | null>(null)
  const lastSentRef = React.useRef<PendingAiAttachment[]>([])

  const update = (localId: string, patch: Partial<PendingAiAttachment>) =>
    setPending(prev => prev.map(item => (item.localId === localId ? { ...item, ...patch } : item)))

  const upload = async (localId: string, file: File, mimeType: string) => {
    try {
      const res = await fetchWithAuth(`/api/ai/conversations/${conversationId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size }),
      })
      if (!res.ok) {
        update(localId, { status: 'error', error: (await serverError(res)) ?? t('Could not upload the file') })
        return
      }
      const { attachmentId, path, token, mimeType: normalized } = (await res.json()) as {
        attachmentId: string
        path: string
        token: string
        mimeType: string
      }
      // Storage はファイル自身の type を見るため、正規化した MIME を持つ File で送る（チャットの添付と同じ）
      const body = file.type === normalized ? file : new File([file], file.name, { type: normalized })
      const { error } = await createSupabaseClient().storage.from('ai-attachments').uploadToSignedUrl(path, token, body)
      if (error) {
        update(localId, { status: 'error', attachmentId, error: t('Could not upload the file') })
        return
      }
      update(localId, { status: 'ready', attachmentId })
    } catch {
      update(localId, { status: 'error', error: t('Could not upload the file') })
    }
  }

  const add = async (files: FileList | File[]) => {
    setNotice(null)
    const list = [...files]
    const room = AI_ATTACHMENT_MAX_FILES - pending.length
    if (list.length > room) setNotice(t('You can attach up to {count} files at a time', { count: AI_ATTACHMENT_MAX_FILES }))
    for (const file of list.slice(0, Math.max(room, 0))) {
      if (file.size > AI_ATTACHMENT_MAX_BYTES) {
        setNotice(t('{name} is larger than 10MB', { name: file.name }))
        continue
      }
      const mimeType = await resolveMimeType(file)
      if (!mimeType) {
        setNotice(t('{name} cannot be attached. Use images, PDF, Word, Excel, PowerPoint, CSV, or text files.', { name: file.name }))
        continue
      }
      const localId = crypto.randomUUID()
      setPending(prev => [...prev, {
        localId,
        fileName: file.name,
        mimeType,
        status: 'uploading',
        ...(AI_ATTACHMENT_IMAGE_TYPES.has(mimeType) ? { previewUrl: URL.createObjectURL(file) } : {}),
      }])
      void upload(localId, file, mimeType)
    }
  }

  const remove = async (localId: string) => {
    const item = pending.find(candidate => candidate.localId === localId)
    setPending(prev => prev.filter(candidate => candidate.localId !== localId))
    // サーバーに行ができていれば本体ごと消す（失敗しても送らなければ定期回収で消える）
    if (item?.attachmentId) {
      await fetchWithAuth(`/api/ai/conversations/${conversationId}/attachments/${item.attachmentId}`, { method: 'DELETE' }).catch(() => undefined)
    }
  }

  return {
    pending,
    notice,
    add,
    remove,
    isUploading: pending.some(item => item.status === 'uploading'),
    hasError: pending.some(item => item.status === 'error'),
    /** 送信する添付を取り出して入力欄から外す。送信に失敗したら restoreLastSent で戻す */
    takeForSend: () => {
      const ready = pending.filter(item => item.status === 'ready' && item.attachmentId)
      lastSentRef.current = ready
      setPending([])
      setNotice(null)
      return {
        attachmentIds: ready.map(item => item.attachmentId!),
        displayAttachments: ready.map<Attachment>(item => ({ name: item.fileName, contentType: item.mimeType, url: item.previewUrl ?? '' })),
      }
    },
    restoreLastSent: () => {
      if (lastSentRef.current.length === 0) return
      const restored = lastSentRef.current
      lastSentRef.current = []
      setPending(prev => [...restored, ...prev])
    },
    clearLastSent: () => { lastSentRef.current = [] },
  }
}

/** 入力欄の上に並べる、送信前の添付 */
export function PendingAttachmentChips({ items, onRemove }: { items: PendingAiAttachment[]; onRemove: (localId: string) => void }) {
  const t = useT()
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {items.map(item => (
        <div
          key={item.localId}
          title={item.error ?? item.fileName}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240, padding: '4px 6px 4px 8px', borderRadius: 8,
            border: `1px solid ${item.status === 'error' ? 'var(--red-text)' : 'var(--border)'}`, background: 'var(--card)', fontSize: 12,
          }}
        >
          {item.previewUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.previewUrl} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}/>
            : <Icon name="file" size={14}/>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{item.fileName}</span>
          {item.status === 'uploading' && <span style={{ color: 'var(--text-4)', flexShrink: 0 }}>{t('Uploading...')}</span>}
          {item.status === 'error' && <span role="alert" style={{ color: 'var(--red-text)', flexShrink: 0 }}>{t('Upload failed')}</span>}
          <button
            type="button"
            aria-label={t('Remove {name}', { name: item.fileName })}
            onClick={() => onRemove(item.localId)}
            className="icon-btn"
            style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }}
          >
            <Icon name="close" size={12}/>
          </button>
        </div>
      ))}
    </div>
  )
}

/** 送信済みのメッセージに付いた添付（画像はサムネイル、文書はファイル名。押すと新しいタブで開く） */
export function SentAttachments({ attachments }: { attachments: ReadonlyArray<Attachment> }) {
  if (attachments.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
      {attachments.map((attachment, index) => {
        const isImage = attachment.contentType ? AI_ATTACHMENT_IMAGE_TYPES.has(attachment.contentType) : false
        const content = isImage && attachment.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={attachment.url} alt={attachment.name ?? ''} style={{ display: 'block', maxWidth: 160, maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }}/>
          : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>
              <Icon name="file" size={14}/>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
            </span>
          )
        return attachment.url && !attachment.url.startsWith('blob:')
          ? <a key={index} href={attachment.url} target="_blank" rel="noopener noreferrer">{content}</a>
          : <div key={index}>{content}</div>
      })}
    </div>
  )
}
