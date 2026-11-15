// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { isGalleryImageMimeType } from '@/lib/gallery-upload'
import { TaskDialog } from './task-dialog'

/** ダイアログで選ぶ画像（メッセージの添付） */
export interface MessageGalleryImage {
  fileId: string
  fileName: string
}

/** メッセージの添付のうち、ギャラリーに追加できる画像だけを返す */
export function galleryImagesOf<T extends { fileId: string; fileName: string; mimeType: string | null }>(
  attachments: T[],
): MessageGalleryImage[] {
  return attachments
    .filter(attachment => attachment.mimeType !== null && isGalleryImageMimeType(attachment.mimeType))
    .map(attachment => ({ fileId: attachment.fileId, fileName: attachment.fileName }))
}

/** 初期選択: 未追加の画像すべて */
export function initialGallerySelection(images: MessageGalleryImage[], addedFileIds: readonly string[]): Set<string> {
  const added = new Set(addedFileIds)
  return new Set(images.filter(image => !added.has(image.fileId)).map(image => image.fileId))
}

// メッセージの画像を選んで、プロジェクトのギャラリーへまとめて追加するダイアログ。
export const MessageGalleryDialog = ({ images, addedFileIds, onSubmit, onClose }: {
  images: MessageGalleryImage[]
  addedFileIds: readonly string[]
  /** 成功したら true。失敗時は呼び出し側がエラーを知らせ、ダイアログは開いたままにする */
  onSubmit: (fileIds: string[]) => Promise<boolean>
  onClose: () => void
}) => {
  const t = useT()
  const added = React.useMemo(() => new Set(addedFileIds), [addedFileIds])
  const [selected, setSelected] = React.useState<Set<string>>(() => initialGallerySelection(images, addedFileIds))
  const [submitting, setSubmitting] = React.useState(false)

  const toggle = (fileId: string, checked: boolean) =>
    setSelected(current => {
      const next = new Set(current)
      if (checked) next.add(fileId)
      else next.delete(fileId)
      return next
    })

  const fileIds = images.filter(image => selected.has(image.fileId)).map(image => image.fileId)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || fileIds.length === 0) return
    setSubmitting(true)
    try {
      const ok = await onSubmit(fileIds)
      if (ok) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TaskDialog
      title={t('Add to the gallery')}
      subtitle={t('Choose the photos to add to the project gallery')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('Add {count} photos', { count: fileIds.length })}
      submittingLabel={t('Adding...')}
      isSubmitting={submitting}
      submitDisabled={fileIds.length === 0}
      disableClose={submitting}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
        {images.map(image => {
          const done = added.has(image.fileId)
          const checked = selected.has(image.fileId)
          return (
            <li key={image.fileId}>
              <label
                style={{
                  position: 'relative', display: 'block', borderRadius: 8, overflow: 'hidden',
                  cursor: done || submitting ? 'default' : 'pointer',
                  outline: checked ? '2px solid var(--accent)' : '1px solid var(--border)',
                  outlineOffset: checked ? -2 : -1,
                }}
              >
                <img
                  src={`/api/attachments/${image.fileId}?thumb=1`}
                  alt={image.fileName}
                  style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', opacity: done ? 0.45 : 1 }}
                />
                <input
                  type="checkbox"
                  aria-label={t('Select {name}', { name: image.fileName })}
                  checked={checked}
                  disabled={done || submitting}
                  onChange={event => toggle(image.fileId, event.target.checked)}
                  style={{ position: 'absolute', top: 6, left: 6, width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                {done && (
                  <span style={{ position: 'absolute', left: 6, right: 6, bottom: 6, padding: '2px 6px', borderRadius: 4, background: 'var(--card)', color: 'var(--text-3)', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                    {t('Added')}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </TaskDialog>
  )
}
