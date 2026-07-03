'use client'

import React from 'react'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../../image-lightbox'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'
import { useProjectFiles } from '@/hooks/use-project-files'

function IndexingBadge({ status }: { status: string | undefined }) {
  if (!status || status === 'indexed' || status === 'skipped') return null
  if (status === 'pending') {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--card-2)', color: 'var(--text-3)', flexShrink: 0 }}>
        インデックス中
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--red-soft)', color: 'var(--red-text)', flexShrink: 0 }}>
        非公開
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

export const FilesTab = ({ projectId }: { projectId: string }) => {
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
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

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        読み込み中...
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red-text)', fontSize: 13 }}>
        ファイルの取得に失敗しました
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        まだファイルがありません
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
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
                  {f.isLatest && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>最新版</span>}
                  {isLink && <IndexingBadge status={f.indexingStatus}/>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{isLink ? '外部リンク' : meta}</div>
              </div>
            </a>

            <RowActionMenu
              actions={[
                f.isLatest
                  ? { icon: 'star', label: '最新版を解除', onSelect: () => setLatestMutation.mutate({ fileId: f.id, isLatest: false }) }
                  : { icon: 'star', label: '最新版にする', onSelect: () => setLatestMutation.mutate({ fileId: f.id, isLatest: true }) },
                { icon: 'trash', label: '削除', danger: true, onSelect: () => setDeleteTarget({ id: f.id, name: f.fileName }) },
              ]}
            />
          </div>
        )
      })}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ファイルを削除"
        message={`「${deleteTarget?.name}」を削除しますか？この操作は取り消せません。`}
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
