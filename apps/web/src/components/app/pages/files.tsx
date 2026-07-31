'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar } from '../primitives'
import { ConfirmDialog } from '../confirm-dialog'
import { RowActionMenu } from '../row-action-menu'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../image-lightbox'
import { MarkdownContent } from '../markdown-content'
import type { FileDto } from '@/app/api/files/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useListSelection } from '@/hooks/use-list-selection'
import { useCommand } from '@/lib/command-registry'

type FilterKey = 'all' | 'pdf' | 'img' | 'doc'

const DOC_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
]

const REINDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
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

function hasTxtExtension(file: FileDto): boolean {
  return file.fileName.toLowerCase().endsWith('.txt')
}

function isMarkdownFile(file: FileDto): boolean {
  return (
    file.fileType !== 'link' &&
    !hasTxtExtension(file) &&
    (file.mimeType === 'text/markdown' || file.fileName.toLowerCase().endsWith('.md'))
  )
}

function isPlainTextFile(file: FileDto): boolean {
  return (
    file.fileType !== 'link' &&
    (file.mimeType === 'text/plain' || hasTxtExtension(file))
  )
}

function isPreviewableTextFile(file: FileDto): boolean {
  return isMarkdownFile(file) || isPlainTextFile(file)
}

function openFileTarget(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function matchesFilter(file: FileDto, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'pdf') return file.mimeType === 'application/pdf'
  if (filter === 'img') return file.mimeType?.startsWith('image/') ?? false
  if (filter === 'doc') return DOC_MIME_TYPES.includes(file.mimeType ?? '')
  return true
}

// ─── FileRow ──────────────────────────────────────────────────────

const FileRow = ({
  file,
  isMobile,
  onDelete,
  onReindex,
  onImageClick,
  onTextPreviewClick,
  selected,
  index,
}: {
  file: FileDto
  isMobile: boolean
  onDelete: (id: string, name: string) => void
  onReindex: (id: string) => void
  onImageClick: (id: string) => void
  onTextPreviewClick: (file: FileDto) => void
  selected?: boolean
  index?: number
}) => {
  const sizeStr = formatFileSize(file.fileSize)
  const dateStr = formatDate(file.createdAt)
  const projectLabel = file.projectTitle ?? file.channelName ?? 'チャット'
  const metaParts = [projectLabel, sizeStr, dateStr].filter(Boolean).join(' · ')
  const isImage = isImageFile(file)
  const isPreviewableText = isPreviewableTextFile(file)
  const fileHref = file.fileType === 'link' ? (file.externalUrl ?? '#') : `/api/attachments/${file.id}`
  const primaryAction = file.fileType === 'link'
    ? { icon: 'external', label: 'リンクを開く', onSelect: () => openFileTarget(fileHref) }
    : isImage
      ? { icon: 'image', label: 'プレビュー', onSelect: () => onImageClick(file.id) }
      : isPreviewableText
        ? { icon: 'eye', label: 'プレビュー', onSelect: () => onTextPreviewClick(file) }
        : { icon: 'download', label: 'ダウンロード', onSelect: () => openFileTarget(fileHref) }

  return (
    <div
      data-list-index={index}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: isMobile ? '10px 12px' : '10px 16px',
        borderBottom: '1px solid var(--divider)',
        background: selected ? 'var(--accent-soft)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <a
        href={fileHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={
          isImage
            ? (e) => {
                e.preventDefault()
                onImageClick(file.id)
              }
            : isPreviewableText
              ? (e) => {
                  e.preventDefault()
                  onTextPreviewClick(file)
                }
              : undefined
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flex: 1,
          minWidth: 0,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {file.fileType === 'link' && file.externalUrl ? (
            <GoogleDocsIcon url={file.externalUrl} />
          ) : (
            <FileTypeIcon mimeType={file.mimeType} fileName={file.fileName} fileId={file.id} />
          )}
          <IndexDot status={file.indexingStatus} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {file.fileName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {metaParts}
          </div>
        </div>
      </a>
      <Avatar name={file.uploaderName} url={file.uploaderAvatarUrl} size={22} />
      <RowActionMenu
        actions={[
          primaryAction,
          ...(REINDEXABLE_MIME_TYPES.has(file.mimeType ?? '') && file.fileType !== 'link'
            ? [{ icon: 'refresh', label: '再インデックス', onSelect: () => onReindex(file.id) }]
            : []),
          {
            icon: 'trash',
            label: '削除',
            danger: true,
            onSelect: () => onDelete(file.id, file.fileName),
          },
        ]}
      />
    </div>
  )
}

const FileRowSkeleton = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      borderBottom: '1px solid var(--divider)',
    }}
  >
    <div
      style={{ width: 32, height: 36, borderRadius: 4, background: 'var(--card-2)', flexShrink: 0 }}
    />
    <div style={{ flex: 1 }}>
      <div
        style={{
          height: 13,
          width: '50%',
          borderRadius: 4,
          background: 'var(--card-2)',
          marginBottom: 6,
        }}
      />
      <div style={{ height: 11, width: '35%', borderRadius: 4, background: 'var(--card-2)' }} />
    </div>
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--card-2)',
        flexShrink: 0,
      }}
    />
  </div>
)

// ─── PageFiles ────────────────────────────────────────────────────

export const PageFiles = ({
  isMobile = false,
  externalSearch,
}: {
  isMobile?: boolean
  externalSearch?: string
}) => {
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [search, setSearch] = React.useState('')
  const effectiveSearch = isMobile ? search : (externalSearch ?? search)
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [textPreviewFile, setTextPreviewFile] = React.useState<FileDto | null>(null)
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  const { data: files = [], isLoading } = useQuery<FileDto[]>({
    queryKey: ['files'],
    queryFn: () => fetchWithAuth('/api/files').then((r) => r.json()),
  })

  const {
    data: textPreviewContent,
    isLoading: isTextPreviewLoading,
    isError: isTextPreviewError,
  } = useQuery<string>({
    queryKey: ['attachment-text-preview', textPreviewFile?.id],
    enabled: textPreviewFile !== null,
    queryFn: async () => {
      if (!textPreviewFile) throw new Error('プレビュー対象のテキストファイルがありません')
      const res = await fetchWithAuth(`/api/attachments/${textPreviewFile.id}`)
      if (!res.ok) throw new Error('テキストプレビューの取得に失敗しました')
      return res.text()
    },
  })

  const deleteFile = useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('削除に失敗しました')
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      void queryClient.invalidateQueries({ queryKey: ['project-files'] })
    },
  })

  const reindexFile = useMutation({
    mutationFn: (fileId: string) =>
      fetchWithAuth(`/api/attachments/${fileId}/reindex`, { method: 'POST' }).then((r) => {
        if (!r.ok) throw new Error('再インデックスに失敗しました')
      }),
    onMutate: (fileId: string) => {
      queryClient.setQueryData<FileDto[]>(['files'], (prev) =>
        prev?.map((f) => (f.id === fileId ? { ...f, indexingStatus: 'pending' } : f)),
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
    return files.filter(
      (f) =>
        matchesFilter(f, filter) &&
        (!q ||
          f.fileName.toLowerCase().includes(q) ||
          (f.projectTitle ?? f.channelName ?? '').toLowerCase().includes(q)),
    )
  }, [files, filter, effectiveSearch])

  // 現在の絞り込み結果に含まれる画像だけをライトボックスで前後送りできるようにする
  const imageFiles = React.useMemo(() => filtered.filter(isImageFile), [filtered])
  const lightboxImages = React.useMemo<LightboxImage[]>(
    () =>
      imageFiles.map((f) => ({
        key: f.id,
        src: `/api/attachments/${f.id}`,
        caption: f.fileName,
      })),
    [imageFiles],
  )
  const openLightbox = React.useCallback(
    (fileId: string) => {
      const idx = imageFiles.findIndex((f) => f.id === fileId)
      if (idx >= 0) setLightboxIndex(idx)
    },
    [imageFiles],
  )

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filter, effectiveSearch])

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE)
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const counts = React.useMemo(
    () => ({
      all: files.length,
      pdf: files.filter((f) => f.mimeType === 'application/pdf').length,
      img: files.filter((f) => f.mimeType?.startsWith('image/') ?? false).length,
      doc: files.filter((f) => DOC_MIME_TYPES.includes(f.mimeType ?? '')).length,
    }),
    [files],
  )

  const visibleFiles = filtered.slice(0, visibleCount)

  const filterDefs: { id: FilterKey; label: string }[] = [
    { id: 'all', label: `すべて (${counts.all})` },
    { id: 'pdf', label: `PDF (${counts.pdf})` },
    { id: 'img', label: `画像 (${counts.img})` },
    { id: 'doc', label: `ドキュメント (${counts.doc})` },
  ]

  const { selectedIndex: navIdx, setSelectedIndex: setNavIdx } = useListSelection({
    count: visibleFiles.length,
    onEnter: React.useCallback(
      (idx: number) => {
        const file = visibleFiles[idx]
        if (!file) return
        if (isImageFile(file)) openLightbox(file.id)
        else if (isPreviewableTextFile(file)) setTextPreviewFile(file)
      },
      [visibleFiles, openLightbox],
    ),
  })

  // ⌥[ / ⌥]: フィルタタブ切替
  const cycleFilterTab = (dir: 'prev' | 'next') => {
    const idx = filterDefs.findIndex((f) => f.id === filter)
    const next =
      dir === 'next'
        ? (idx + 1) % filterDefs.length
        : (idx - 1 + filterDefs.length) % filterDefs.length
    setFilter(filterDefs[next]!.id)
  }
  useCommand('ctx.filterTabPrev', () => cycleFilterTab('prev'))
  useCommand('ctx.filterTabNext', () => cycleFilterTab('next'))

  // ⌥Delete: 選択中のファイルを削除（↑↓ で選択していない時は何もしない）
  useCommand('files.delete', () => {
    const file = navIdx >= 0 ? visibleFiles[navIdx] : undefined
    if (file) handleDelete(file.id, file.fileName)
  })

  // ⌥R: 選択中のファイルを再インデックス（インデックス対象のみ）
  useCommand('files.reindex', () => {
    const file = navIdx >= 0 ? visibleFiles[navIdx] : undefined
    if (file && REINDEXABLE_MIME_TYPES.has(file.mimeType ?? '') && file.fileType !== 'link') {
      handleReindex(file.id)
    }
  })

  // フィルタ変更で選択をリセット
  React.useEffect(() => {
    setNavIdx(-1)
  }, [filter, effectiveSearch, setNavIdx])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          padding: isMobile ? '8px 12px' : '10px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--card-2)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '0 10px',
              height: 32,
            }}
          >
            <Icon name="search" size={13} color="var(--text-4)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ファイル名・プロジェクトで検索"
              style={{
                flex: 1,
                fontSize: 12.5,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                caretColor: 'var(--accent)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  color: 'var(--text-4)',
                }}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto' }}>
          {filterDefs.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: filter === f.id ? 'var(--card-hover)' : 'transparent',
                color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: isMobile ? 12 : 12.5,
                fontWeight: filter === f.id ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined,
        }}
      >
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <FileRowSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              gap: 12,
              color: 'var(--text-3)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--card-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-4)',
              }}
            >
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
            {visibleFiles.map((f, i) => (
              <FileRow
                key={f.id}
                file={f}
                isMobile={isMobile}
                onDelete={handleDelete}
                onReindex={handleReindex}
                onImageClick={openLightbox}
                onTextPreviewClick={setTextPreviewFile}
                selected={i === navIdx}
                index={i}
              />
            ))}
            <div ref={sentinelRef} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ファイルを削除"
        message={`「${deleteTarget?.name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={async () => {
          if (deleteTarget) await deleteFile.mutateAsync(deleteTarget.id)
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {textPreviewFile !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${textPreviewFile.fileName} のプレビュー`}
          onClick={() => setTextPreviewFile(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? 12 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 100%)',
              maxHeight: 'min(760px, 90vh)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <FileTypeIcon
                mimeType={textPreviewFile.mimeType}
                fileName={textPreviewFile.fileName}
                fileId={textPreviewFile.id}
              />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {textPreviewFile.fileName}
              </div>
              <a
                href={`/api/attachments/${textPreviewFile.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                別タブで開く
              </a>
              <button
                onClick={() => setTextPreviewFile(null)}
                aria-label="プレビューを閉じる"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: 4,
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div
              style={{
                padding: isMobile ? 16 : 24,
                overflowY: 'auto',
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {isTextPreviewLoading ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                  テキストを読み込んでいます...
                </div>
              ) : isTextPreviewError ? (
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                  テキストプレビューを読み込めませんでした。
                </div>
              ) : isMarkdownFile(textPreviewFile) ? (
                <MarkdownContent
                  content={textPreviewContent ?? ''}
                  fontSize={14}
                  lineHeight={1.7}
                />
              ) : (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  {textPreviewContent ?? ''}
                </pre>
              )}
            </div>
          </div>
        </div>
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
