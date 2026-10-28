'use client'

// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの添付の表示（送信前の添付・送信済みのメッセージの添付）。
// アップロードと状態の管理は hooks/use-ai-attachments.ts

import React from 'react'
import type { Attachment } from 'ai'
import { useT } from '@/components/locale-provider'
import { AI_ATTACHMENT_IMAGE_TYPES } from '@/lib/ai/attachment-types'
import type { PendingAiAttachment } from '@/hooks/use-ai-attachments'
import { Icon } from './primitives'

/** リンクを発行できなかった送信済みの添付の印（表示用の Attachment.url に入れる） */
export const ATTACHMENT_URL_UNAVAILABLE = 'cairn-attachment:unavailable'

/** サーバーが返した送信済みの添付を、メッセージの表示用の形にする */
export function toDisplayAttachments(attachments: ReadonlyArray<{ fileName: string; mimeType: string; url: string | null }>): Attachment[] {
  return attachments.map(attachment => ({
    name: attachment.fileName,
    contentType: attachment.mimeType,
    url: attachment.url ?? ATTACHMENT_URL_UNAVAILABLE,
  }))
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
          title={'error' in item.state ? item.state.error : item.fileName}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240, padding: '4px 6px 4px 8px', borderRadius: 8,
            border: `1px solid ${'error' in item.state ? 'var(--red-text)' : 'var(--border)'}`, background: 'var(--card)', fontSize: 12,
          }}
        >
          {item.previewUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.previewUrl} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}/>
            : <Icon name="file" size={14}/>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{item.fileName}</span>
          {item.state.kind === 'uploading' && <span style={{ color: 'var(--text-4)', flexShrink: 0 }}>{t('Uploading...')}</span>}
          {item.state.kind === 'upload-failed' && <span role="alert" style={{ color: 'var(--red-text)', flexShrink: 0 }}>{t('Upload failed')}</span>}
          {item.state.kind === 'remove-failed' && <span role="alert" style={{ color: 'var(--red-text)', flexShrink: 0 }}>{t('Could not remove')}</span>}
          <button
            type="button"
            aria-label={t('Remove {name}', { name: item.fileName })}
            onClick={() => onRemove(item.localId)}
            disabled={item.state.kind === 'removing'}
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
  const t = useT()
  if (attachments.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
      {attachments.map((attachment, index) => {
        const unavailable = attachment.url === ATTACHMENT_URL_UNAVAILABLE
        const isImage = attachment.contentType ? AI_ATTACHMENT_IMAGE_TYPES.has(attachment.contentType) : false
        const content = isImage && attachment.url && !unavailable
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={attachment.url} alt={attachment.name ?? ''} style={{ display: 'block', maxWidth: 160, maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }}/>
          : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>
              <Icon name="file" size={14}/>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
              {unavailable && <span role="alert" style={{ color: 'var(--red-text)', flexShrink: 0 }}>{t('Could not get the link')}</span>}
            </span>
          )
        return attachment.url && !unavailable && !attachment.url.startsWith('blob:')
          ? <a key={index} href={attachment.url} target="_blank" rel="noopener noreferrer">{content}</a>
          : <div key={index}>{content}</div>
      })}
    </div>
  )
}
