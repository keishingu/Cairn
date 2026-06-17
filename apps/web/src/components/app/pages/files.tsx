'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar } from '../primitives'
import { ConfirmDialog } from '../confirm-dialog'
import { RowActionMenu } from '../row-action-menu'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../image-lightbox'
import type { FileDto } from '@/app/api/files/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

type FilterKey = 'all' | 'pdf' | 'img' | 'doc'

const DOC_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const REINDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
])

const PAGE_SIZE = 20

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

function isImageFile(file: FileDto): boolean {
  return file.fileType !== 'link' && (file.mimeType?.startsWith('image/') ?? false)
}

function matchesFilter(file: FileDto, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'pdf') return file.mimeType === 'application/pdf'
  if (filter === 'img') return file.mimeType?.startsWith('image/') ?? false
  if (filter === 'doc') return DOC_MIME_TYPES.includes(file.mimeType ?? '')
  return true
}

// ─── FileRow ──────────────────────────────────────────────────────

const FileRow = ({ file, isMobile, onDelete, onReindex, onImageClick }: { file: FileDto; isMobile: boolean; onDelete: (id: string, name: string) => void; onReindex: (id: string) => void; onImageClick: (id: string) => void }) => {
  const sizeStr = formatFileSize(file.fileSize)
  const dateStr = formatDate(file.createdAt)
  const projectLabel = file.projectTitle ?? file.channelName ?? 'チャット'
  const metaParts = [projectLabel, sizeStr, dateStr].filter(Boolean).join(' · ')
  const isImage = isImageFile(file)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: isMobile ? '10px 12px' : '10px 16px',
        borderBottom: '1px solid var(--divider)',
      }}
    >
      <a
        href={file.fileType === 'link' ? (file.externalUrl ?? '#') : `/api/attachments/${file.id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={isImage ? (e => { e.preventDefault(); onImageClick(file.id) }) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', cursor: 'pointer' }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {file.fileType === 'link' && file.externalUrl
            ? <GoogleDocsIcon url={file.externalUrl} />
            : <FileTypeIcon mimeType={file.mimeType} fileName={file.fileName} fileId={file.id} />
          }
          <IndexDot status={file.indexingStatus} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {file.fileName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {metaParts}
          </div>
        </div>
      </a>
      <Avatar name={file.uploaderName} url={file.uploaderAvatarUrl} size={22} />
      <RowActionMenu
        actions={[
          ...(REINDEXABLE_MIME_TYPES.has(file.mimeType ?? '') && file.fileType !== 'link'
            ? [{ icon: 'refresh', label: '再インデックス', onSelect: () => onReindex(file.id) }]
            : []),
          { icon: 'trash', label: '削除', danger: true, onSelect: () => onDelete(file.id, file.fileName) },
        ]}
      />
    </div>
  )
}

const FileRowSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
    <div style={{ width: 32, height: 36, borderRadius: 4, background: 'var(--card-2)', flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ height: 13, width: '50%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 6 }} />
      <div style={{ height: 11, width: '35%', borderRadius: 4, background: 'var(--card-2)' }} />
    </div>
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--card-2)', flexShrink: 0 }} />
  </div>
)

// ─── PageFiles ────────────────────────────────────────────────────

export const PageFiles = ({ isMobile = false, externalSearch }: { isMobile?: boolean; externalSearch?: string }) => {
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [search, setSearch] = React.useState('')
  const effectiveSearch = isMobile ? search : (externalSearch ?? search)
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  const { data: files = [], isLoading } = useQuery<FileDto[]>({
    queryKey: ['files'],
    queryFn: () => fetchWithAuth('/api/files').then(r => r.json()),
  })

  const deleteFile = useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error('削除に失敗しました')
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      void queryClient.invalidateQueries({ queryKey: ['project-files'] })
    },
  })

  const reindexFile = useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}/reindex`, { method: 'POST' }).then(r => {
        if (!r.ok) throw new Error('再インデックスに失敗しました')
      }),
    onMutate: (fileId: string) => {
      queryClient.setQueryData<FileDto[]>(['files'], prev =>
        prev?.map(f => f.id === fileId ? { ...f, indexingStatus: 'pending' } : f),
      )
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['files'] }),
  })

  const handleDelete = (fileId: string, fileName: string) => {
    setDeleteTarget({ id: fileId, name: fileName })
  }

  const handleReindex = (fileId: string) => {
    reindexFile.mutate(fileId)
  }

  const filtered = React.useMemo(() => {
    const q = effectiveSearch.trim().toLowerCase()
    return files.filter(f =>
      matchesFilter(f, filter) &&
      (!q || f.fileName.toLowerCase().includes(q) || (f.projectTitle ?? f.channelName ?? '').toLowerCase().includes(q)),
    )
  }, [files, filter, effectiveSearch])

  // 現在の絞り込み結果に含まれる画像だけをライトボックスで前後送りできるようにする
  const imageFiles = React.useMemo(() => filtered.filter(isImageFile), [filtered])
  const lightboxImages = React.useMemo<LightboxImage[]>(() => imageFiles.map(f => ({
    key: f.id,
    src: `/api/attachments/${f.id}`,
    caption: f.fileName,
  })), [imageFiles])
  const openLightbox = React.useCallback((fileId: string) => {
    const idx = imageFiles.findIndex(f => f.id === fileId)
    if (idx >= 0) setLightboxIndex(idx)
  }, [imageFiles])

  React.useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter, effectiveSearch])

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) setVisibleCount(c => c + PAGE_SIZE) },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const counts = React.useMemo(() => ({
    all: files.length,
    pdf: files.filter(f => f.mimeType === 'application/pdf').length,
    img: files.filter(f => f.mimeType?.startsWith('image/') ?? false).length,
    doc: files.filter(f => DOC_MIME_TYPES.includes(f.mimeType ?? '')).length,
  }), [files])

  const visibleFiles = filtered.slice(0, visibleCount)

  const filterDefs: { id: FilterKey; label: string }[] = [
    { id: 'all', label: `すべて (${counts.all})` },
    { id: 'pdf', label: `PDF (${counts.pdf})` },
    { id: 'img', label: `画像 (${counts.img})` },
    { id: 'doc', label: `ドキュメント (${counts.doc})` },
  ]

  // ⌥[/⌥]: フィルタタブ切替
  React.useEffect(() => {
    const onTab = (e: Event) => {
      const dir = (e as CustomEvent<'prev' | 'next'>).detail
      const idx = filterDefs.findIndex(f => f.id === filter)
      const next = dir === 'next'
        ? (idx + 1) % filterDefs.length
        : (idx - 1 + filterDefs.length) % filterDefs.length
      setFilter(filterDefs[next]!.id)
    }
    window.addEventListener('cairn:filter-tab', onTab)
    return () => window.removeEventListener('cairn:filter-tab', onTab)
  }, [filter, filterDefs])

  // ⌥Delete: 最初のファイルを削除（選択概念がないため、リスト先頭のファイル）
  React.useEffect(() => {
    const onDelete = () => {
      const first = visibleFiles[0]
      if (first) handleDelete(first.id, first.fileName)
    }
    window.addEventListener('cairn:delete-selected', onDelete)
    return () => window.removeEventListener('cairn:delete-selected', onDelete)
  }, [visibleFiles])

  // ⌥R: 最初のファイルを再インデックス
  React.useEffect(() => {
    const onReindex = () => {
      const first = visibleFiles.find(f => REINDEXABLE_MIME_TYPES.has(f.mimeType ?? '') && f.fileType !== 'link')
      if (first) handleReindex(first.id)
    }
    window.addEventListener('cairn:reindex-selected', onReindex)
    return () => window.removeEventListener('cairn:reindex-selected', onReindex)
  }, [visibleFiles])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        padding: isMobile ? '8px 12px' : '10px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '0 10px', height: 32 }}>
            <Icon name="search" size={13} color="var(--text-4)"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ファイル名・プロジェクトで検索"
              style={{ flex: 1, fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', caretColor: 'var(--accent)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-4)' }}>
                <Icon name="close" size={12}/>
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto' }}>
          {filterDefs.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                borderRadius: 6, border: 'none',
                background: filter === f.id ? 'var(--card-hover)' : 'transparent',
                color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: isMobile ? 12 : 12.5, fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <FileRowSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: 'var(--text-3)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
              <Icon name="file" size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ファイルはありません</div>
            <div style={{ fontSize: 12.5 }}>
              {filter === 'all'
                ? 'チャットでファイルを送ると、ここに表示されます'
                : 'このフィルターに一致するファイルはありません'}
            </div>
          </div>
        ) : (
          <>
            {visibleFiles.map(f => <FileRow key={f.id} file={f} isMobile={isMobile} onDelete={handleDelete} onReindex={handleReindex} onImageClick={openLightbox} />)}
            <div ref={sentinelRef} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ファイルを削除"
        message={`「${deleteTarget?.name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={async () => { if (deleteTarget) await deleteFile.mutateAsync(deleteTarget.id) }}
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
