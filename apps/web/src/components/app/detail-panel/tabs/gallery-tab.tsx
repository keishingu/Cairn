'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import { InlineError } from '../../inline-error'
import { RowActionMenu } from '../../row-action-menu'
import { ImageLightbox, type LightboxImage } from '../../image-lightbox'
import type { GalleryItemDto } from '@/app/api/projects/[id]/gallery/route'
import { processImageForUpload } from '@/lib/process-image'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/components/locale-provider'

type Translate = (message: string, values?: Record<string, string | number>) => string

interface UploadState {
  total: number
  done: number
  errors: string[]
}

async function uploadFile(projectId: string, original: File, t: Translate): Promise<void> {
  const {
    file: derivedFile,
    originalFile,
    takenAt,
    latitude,
    longitude,
  } = await processImageForUpload(original)
  const urlRes = await fetchWithAuth(`/api/projects/${projectId}/gallery/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      original: { fileName: originalFile.name, mimeType: originalFile.type },
      derived: { fileName: derivedFile.name, mimeType: derivedFile.type },
    }),
  })
  if (!urlRes.ok) {
    const data = (await urlRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? t('Could not prepare the upload for {name}', { name: original.name }))
  }

  const signed = (await urlRes.json()) as {
    uploadId: string
    derived: { bucket: string; token: string; path: string; storagePath: string }
    original: { bucket: string; token: string; path: string; storagePath: string } | null
  }
  const supabase = createClient()
  const uploads = [
    supabase.storage
      .from(signed.derived.bucket)
      .uploadToSignedUrl(signed.derived.path, signed.derived.token, derivedFile),
    ...(signed.original
      ? [
          supabase.storage
            .from(signed.original.bucket)
            .uploadToSignedUrl(signed.original.path, signed.original.token, originalFile),
        ]
      : []),
  ]
  const uploadResults = await Promise.all(uploads)
  const uploadError = uploadResults.find((result) => result.error)?.error
  if (uploadError) throw new Error(t('Could not upload {name}', { name: original.name }))

  const res = await fetchWithAuth(`/api/projects/${projectId}/gallery/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId: signed.uploadId,
      takenAt: takenAt?.toISOString() ?? null,
      latitude: latitude === null ? null : String(latitude),
      longitude: longitude === null ? null : String(longitude),
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? t('Could not upload {name}', { name: original.name }))
  }
}

export const GalleryTab = ({ projectId }: { projectId: string }) => {
  const t = useT()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [uploadState, setUploadState] = React.useState<UploadState | null>(null)
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)

  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery<GalleryItemDto[]>({
    queryKey: ['project-gallery', projectId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/gallery`)
      if (!res.ok) throw new Error('Failed to fetch gallery')
      return res.json() as Promise<GalleryItemDto[]>
    },
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setUploadState({ total: files.length, done: 0, errors: [] })

    const results = await Promise.allSettled(
      files.map((file) =>
        uploadFile(projectId, file, t).then(() => {
          setUploadState((s) => (s ? { ...s, done: s.done + 1 } : s))
        }),
      ),
    )

    // サーバーの汎用エラーが並ぶとどの写真か分からないため、名前を含まない文言には先頭に付ける
    const errors = results.flatMap((r, i) => {
      if (r.status !== 'rejected') return []
      const name = files[i]?.name ?? ''
      const message = r.reason instanceof Error ? r.reason.message : t('Could not upload')
      return [name && !message.includes(name) ? `${name}: ${message}` : message]
    })

    const succeeded = files.length - errors.length
    void queryClient.invalidateQueries({ queryKey: ['project-gallery', projectId] })
    if (succeeded > 0) toast.success(t('Added {count} photos', { count: succeeded }))
    // 失敗は一過性にせず、どのファイルかを閉じるまで残す。完了後に「アップロード中」の文言を残さない
    setUploadState(errors.length > 0 ? { total: files.length, done: files.length, errors } : null)
  }

  const deleteItem = async (itemId: string) => {
    const res = await fetchWithAuth(`/api/projects/${projectId}/gallery/${itemId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(t('Could not delete'))
    void queryClient.invalidateQueries({ queryKey: ['project-gallery', projectId] })
  }

  const isUploading = uploadState !== null && uploadState.done < uploadState.total

  const lightboxImages = React.useMemo<LightboxImage[]>(
    () =>
      items.map((it) => ({
        key: it.id,
        src: it.originalUrl ?? it.publicUrl,
      })),
    [items],
  )

  if (isLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-4)',
          fontSize: 13,
        }}
      >
        {t('Loading…')}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--red-text)',
          fontSize: 13,
        }}
      >
        {t('Could not load the gallery')}
      </div>
    )
  }

  return (
    <>
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {/* アップロードボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn btn-sm"
          >
            <Icon name="plus" size={13} />
            {isUploading
              ? t('Uploading {done}/{total} photos...', { done: uploadState.done, total: uploadState.total })
              : t('Add photos')}
          </button>
        </div>

        {uploadState?.errors && uploadState.errors.length > 0 && (
          <InlineError variant="box" onDismiss={() => setUploadState(null)} style={{ marginBottom: 8 }}>
            {uploadState.errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </InlineError>
        )}

        {items.length === 0 && !isUploading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '40px 0',
              color: 'var(--text-4)',
            }}
          >
            <Icon name="image" size={28} />
            <span style={{ fontSize: 13 }}>{t('No photos yet')}</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  aspectRatio: '1/1',
                  borderRadius: 5,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: 'var(--card-2)',
                }}
                onClick={() => setLightboxIndex(items.indexOf(item))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.publicUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
                <div
                  style={{ position: 'absolute', top: 4, right: 4 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionMenu
                    triggerStyle={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: 6,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                    }}
                    actions={[
                      {
                        icon: 'trash',
                        label: t('Delete'),
                        danger: true,
                        onSelect: () => setDeleteTargetId(item.id),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title={t('Delete photo')}
        message={t('Delete this photo? This cannot be undone.')}
        onConfirm={async () => {
          if (deleteTargetId) await deleteItem(deleteTargetId)
        }}
        onClose={() => setDeleteTargetId(null)}
      />

      {/* ライトボックス */}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={Math.min(lightboxIndex, lightboxImages.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
