'use client'

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import { Icon } from '../../primitives'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../../image-lightbox'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useProjectFiles } from '@/hooks/use-project-files'
import { useT } from '@/components/locale-provider'

const ACCEPT_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'text/markdown',
  '.csv', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.md', '.markdown',
].join(',')

function IndexingBadge({ status }: { status: string | undefined }) {
  const t = useT()
  if (!status || status === 'indexed' || status === 'skipped') return null
  if (status === 'pending') {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--card-2)', color: 'var(--text-3)', flexShrink: 0 }}>
        {t('Indexing')}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--red-soft)', color: 'var(--red-text)', flexShrink: 0 }}>
        {t('Private')}
      </span>
    )
  }
  return null
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isImageFile(file: ProjectFileDto): boolean {
  return file.fileType !== 'link' && (file.mimeType?.startsWith('image/') ?? false)
}

export const FilesTab = ({ projectId, channelId }: { projectId: string; channelId: string | null }) => {
  const t = useT()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const { data: files = [], isLoading, isError, deleteMutation, setLatestMutation } = useProjectFiles(projectId)

  const imageFiles = React.useMemo(() => files.filter(isImageFile), [files])
  const lightboxImages = React.useMemo<LightboxImage[]>(() => imageFiles.map(f => ({
    key: f.id,
    src: `/api/attachments/${f.id}`,
    caption: f.fileName,
  })), [imageFiles])
  const openLightbox = React.useCallback((fileId: string) => {
    const idx = imageFiles.findIndex(f => f.id === fileId)
    if (idx >= 0) setLightboxIndex(idx)
  }, [imageFiles])

  const handleFilesSelect = async (selectedFiles: FileList | null) => {
    if (!channelId || !selectedFiles || selectedFiles.length === 0) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const results = await Promise.allSettled(
        Array.from(selectedFiles).map(async (file) => {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('channelId', channelId)
          const res = await fetchWithAuth('/api/attachments/upload', { method: 'POST', body: formData })
          if (!res.ok) {
            const data = await res.json().catch(() => ({})) as { error?: string }
            throw new Error(data.error ?? t('Could not upload {name}', { name: file.name }))
          }
        }),
      )

      const hasSuccess = results.some((result) => result.status === 'fulfilled')
      const firstFailure = results.find((result) => result.status === 'rejected')

      if (hasSuccess) {
        await queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
        await queryClient.invalidateQueries({ queryKey: ['files'] })
      }

      if (firstFailure?.status === 'rejected') {
        throw firstFailure.reason
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('Could not upload'))
    } finally {
      setIsUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        {t('Loading…')}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red-text)', fontSize: 13 }}>
        {t('Could not load files')}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_FILE_TYPES}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleFilesSelect(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!channelId || isUploading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text-2)',
            fontSize: 12,
            cursor: !channelId || isUploading ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: !channelId || isUploading ? 0.6 : 1,
          }}
        >
          <Icon name="plus" size={13} />
          {isUploading ? t('Uploading...') : t('Add a file')}
        </button>
      </div>

      {uploadError && (
        <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 12 }}>
          {uploadError}
        </div>
      )}

      {files.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13, padding: '24px 0' }}>
          {t('There are no files yet')}
        </div>
      )}

      {files.map((f: ProjectFileDto) => {
        const sizeStr = formatFileSize(f.fileSize)
        const dateStr = formatDate(f.createdAt)
        const meta = [sizeStr, dateStr].filter(Boolean).join(' · ')

        const isLink = f.fileType === 'link'
        const linkHref = isLink ? f.externalUrl : `/api/attachments/${f.id}`
        const isImage = isImageFile(f)

        return (
          <div key={f.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--divider)', borderRadius: 6 }}>
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={isImage ? (e => { e.preventDefault(); openLightbox(f.id) }) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', cursor: 'pointer' }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {isLink && f.externalUrl
                  ? <GoogleDocsIcon url={f.externalUrl}/>
                  : <FileTypeIcon mimeType={f.mimeType} fileName={f.fileName} fileId={f.id}/>
                }
                <IndexDot status={f.indexingStatus}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.fileName}
                  {f.isLatest && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>{t('Latest')}</span>}
                  {isLink && <IndexingBadge status={f.indexingStatus}/>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{isLink ? t('External link') : meta}</div>
              </div>
            </a>

            <RowActionMenu
              actions={[
                f.isLatest
                  ? { icon: 'star', label: t('Unmark as latest'), onSelect: () => setLatestMutation.mutate({ fileId: f.id, isLatest: false }) }
                  : { icon: 'star', label: t('Mark as latest'), onSelect: () => setLatestMutation.mutate({ fileId: f.id, isLatest: true }) },
                { icon: 'trash', label: t('Delete'), danger: true, onSelect: () => setDeleteTarget({ id: f.id, name: f.fileName }) },
              ]}
            />
          </div>
        )
      })}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('Delete this file')}
        message={t('Delete "{name}"? This cannot be undone.', { name: deleteTarget?.name ?? '' })}
        onConfirm={async () => { if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.id) }}
        onClose={() => setDeleteTarget(null)}
      />

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
