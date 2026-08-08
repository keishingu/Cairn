'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar } from '../primitives'
import { ConfirmDialog } from '../confirm-dialog'
import { RowActionMenu } from '../row-action-menu'
import { InlineFileNameEditor } from '../inline-file-name-editor'
import { FileFilterToolbar } from '../file-filter-toolbar'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../image-lightbox'
import { MarkdownContent } from '../markdown-content'
import type { FileDto } from '@/app/api/files/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useListSelection } from '@/hooks/use-list-selection'
import { useCommand } from '@/lib/command-registry'
import { useRenameFile } from '@/hooks/use-rename-file'
import { useSavedFileFilters } from '@/hooks/use-saved-file-filters'
import {
  DEFAULT_FILE_FILTER_CONDITIONS,
  type FileFilterConditions,
  type FileTypeFilter,
} from '@/lib/files/saved-file-filter'

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

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  return file.fileType !== 'link' && (file.mimeType === 'text/plain' || hasTxtExtension(file))
}

function isPreviewableTextFile(file: FileDto): boolean {
  return isMarkdownFile(file) || isPlainTextFile(file)
}

function matchesFilter(file: FileDto, filter: FileTypeFilter): boolean {
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
  onRename,
  selected,
  index,
}: {
  file: FileDto
  isMobile: boolean
  onDelete: (id: string, name: string) => void
  onReindex: (id: string) => void
  onImageClick: (id: string) => void
  onTextPreviewClick: (file: FileDto) => void
  onRename: (fileId: string, fileName: string) => Promise<unknown>
  selected?: boolean
  index?: number
}) => {
  const router = useRouter()
  const [isRenaming, setIsRenaming] = React.useState(false)
  const sizeStr = formatFileSize(file.fileSize)
  const dateStr = formatDate(file.createdAt)
  const projectLabel = file.projectTitle ?? file.channelName ?? 'チャット'
  const metaParts = [projectLabel, sizeStr, dateStr].filter(Boolean).join(' · ')
  const isImage = isImageFile(file)
  const isPreviewableText = isPreviewableTextFile(file)
  const chatHref = file.sourceChannelId
    ? `/chats/${encodeURIComponent(file.sourceChannelId)}${file.sourceMessageId ? `?m=${encodeURIComponent(file.sourceMessageId)}` : ''}`
    : null
  const fileIcon = (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {file.fileType === 'link' && file.externalUrl ? (
        <GoogleDocsIcon url={file.externalUrl} />
      ) : (
        <FileTypeIcon mimeType={file.mimeType} fileName={file.fileName} fileId={file.id} />
      )}
      <IndexDot status={file.indexingStatus} />
    </div>
  )
  const fileMeta = (
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
  )

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
      {isRenaming ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {fileIcon}
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineFileNameEditor
              fileName={file.fileName}
              onSave={(fileName) => onRename(file.id, fileName)}
              onCancel={() => setIsRenaming(false)}
            />
            {fileMeta}
          </div>
        </div>
      ) : (
        <a
          href={
            file.fileType === 'link' ? (file.externalUrl ?? '#') : `/api/attachments/${file.id}`
          }
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
          {fileIcon}
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
            {fileMeta}
          </div>
        </a>
      )}
      <Avatar name={file.uploaderName} url={file.uploaderAvatarUrl} size={22} />
      {!isRenaming && (
        <RowActionMenu
          actions={[
            ...(chatHref
              ? [{ icon: 'chat', label: 'チャットに移動', onSelect: () => router.push(chatHref) }]
              : []),
            { icon: 'edit', label: '名前を変更', onSelect: () => setIsRenaming(true) },
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
      )}
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

const FileSection = ({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) => (
  <section>
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        border: 'none',
        background: 'var(--card-2)',
        borderBottom: '1px solid var(--divider)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <Icon name={open ? 'chevDown' : 'chevRight'} size={12} color="var(--text-3)" />
      <Icon name="folder" size={14} color="var(--text-3)" />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', flex: 1 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-3)',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          padding: '1px 6px',
          borderRadius: 999,
        }}
      >
        {count}
      </span>
    </button>
    {open && children}
  </section>
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
  const renameFile = useRenameFile()
  const [conditions, setConditions] = React.useState<FileFilterConditions>(
    DEFAULT_FILE_FILTER_CONDITIONS,
  )
  const [activeSavedFilterId, setActiveSavedFilterId] = React.useState<string | null>(null)
  const [sectionOverride, setSectionOverride] = React.useState<Record<string, boolean>>({})
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
    data: savedFilters = [],
    isLoading: isLoadingSavedFilters,
    isError: isSavedFiltersError,
    createMutation: createSavedFilter,
    deleteMutation: deleteSavedFilter,
  } = useSavedFileFilters()

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
    const q = conditions.search.trim().toLowerCase()
    const externalQ = isMobile ? '' : (externalSearch ?? '').trim().toLowerCase()
    return files.filter(
      (f) =>
        matchesFilter(f, conditions.type) &&
        (conditions.projectId === 'all' ||
          (conditions.projectId === 'none'
            ? f.projectId === null
            : f.projectId === conditions.projectId)) &&
        (conditions.uploaderId === 'all' || f.uploaderId === conditions.uploaderId) &&
        (!conditions.createdFrom || localDate(f.createdAt) >= conditions.createdFrom) &&
        (!conditions.createdTo || localDate(f.createdAt) <= conditions.createdTo) &&
        (!q ||
          f.fileName.toLowerCase().includes(q) ||
          (f.projectTitle ?? f.channelName ?? '').toLowerCase().includes(q)) &&
        (!externalQ ||
          f.fileName.toLowerCase().includes(externalQ) ||
          (f.projectTitle ?? f.channelName ?? '').toLowerCase().includes(externalQ)),
    )
  }, [files, conditions, externalSearch, isMobile])

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
  }, [conditions, externalSearch])

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

  const pagedFiles = filtered.slice(0, visibleCount)

  const grouped = React.useMemo(() => {
    const projectOrder: string[] = []
    const projectMap = new Map<string, FileDto[]>()
    for (const file of filtered) {
      const key = file.projectId ?? 'none'
      if (!projectMap.has(key)) {
        projectMap.set(key, [])
        projectOrder.push(key)
      }
      projectMap.get(key)!.push(file)
    }
    const pagedIds = new Set(pagedFiles.map((file) => file.id))
    return projectOrder
      .map((projectId) => {
        const allProjectFiles = projectMap.get(projectId)!
        return {
          key: projectId,
          label: allProjectFiles[0]!.projectTitle ?? 'プロジェクトなし',
          count: allProjectFiles.length,
          files: allProjectFiles.filter((file) => pagedIds.has(file.id)),
        }
      })
      .filter((group) => group.files.length > 0)
  }, [filtered, pagedFiles])

  const isSectionOpen = React.useCallback(
    (key: string, index: number) => sectionOverride[key] ?? index < 3,
    [sectionOverride],
  )

  const visibleFiles = React.useMemo(
    () => grouped.flatMap((group, index) => (isSectionOpen(group.key, index) ? group.files : [])),
    [grouped, isSectionOpen],
  )

  const sectionBases = React.useMemo(() => {
    const bases: number[] = []
    let cursor = 0
    grouped.forEach((group, index) => {
      bases[index] = cursor
      if (isSectionOpen(group.key, index)) cursor += group.files.length
    })
    return bases
  }, [grouped, isSectionOpen])

  const filterDefs: FileTypeFilter[] = ['all', 'pdf', 'img', 'doc']

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
    const idx = filterDefs.indexOf(conditions.type)
    const next =
      dir === 'next'
        ? (idx + 1) % filterDefs.length
        : (idx - 1 + filterDefs.length) % filterDefs.length
    setConditions((current) => ({ ...current, type: filterDefs[next]! }))
    setActiveSavedFilterId(null)
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
  }, [conditions, externalSearch, grouped.length, setNavIdx])

  const projectOptions = React.useMemo(() => {
    const projects = new Map<string, string>()
    files.forEach((file) => {
      if (file.projectId && file.projectTitle) projects.set(file.projectId, file.projectTitle)
    })
    return [...projects]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
  }, [files])

  const uploaderOptions = React.useMemo(() => {
    const uploaders = new Map<string, string>()
    files.forEach((file) => uploaders.set(file.uploaderId, file.uploaderName))
    return [...uploaders]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
  }, [files])

  const handleConditionsChange = (next: FileFilterConditions) => {
    setConditions(next)
    setActiveSavedFilterId(null)
  }

  const handleSaveFilter = async (name: string) => {
    const created = await createSavedFilter.mutateAsync({ name, conditions })
    setActiveSavedFilterId(created.id)
  }

  const handleDeleteSavedFilter = (filterId: string) => {
    deleteSavedFilter.mutate(filterId, {
      onSuccess: () => {
        if (activeSavedFilterId === filterId) setActiveSavedFilterId(null)
      },
    })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <FileFilterToolbar
        isMobile={isMobile}
        conditions={conditions}
        counts={counts}
        projects={projectOptions}
        uploaders={uploaderOptions}
        savedFilters={savedFilters}
        activeSavedFilterId={activeSavedFilterId}
        isSaving={createSavedFilter.isPending}
        isLoadingSavedFilters={isLoadingSavedFilters}
        savedFiltersError={isSavedFiltersError}
        onChange={handleConditionsChange}
        onApplySavedFilter={(savedFilter) => {
          setConditions(savedFilter.conditions)
          setActiveSavedFilterId(savedFilter.id)
        }}
        onDeleteSavedFilter={handleDeleteSavedFilter}
        onSave={handleSaveFilter}
        onClear={() => {
          setConditions(DEFAULT_FILE_FILTER_CONDITIONS)
          setActiveSavedFilterId(null)
        }}
      />

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
          <div
            style={{
              margin: isMobile ? 12 : '16px 20px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <FileRowSkeleton key={i} />
            ))}
          </div>
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
              {files.length === 0
                ? 'チャットでファイルを送ると、ここに表示されます'
                : 'このフィルターに一致するファイルはありません'}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                margin: isMobile ? 12 : '16px 20px',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {grouped.map((group, groupIndex) => (
                <FileSection
                  key={group.key}
                  label={group.label}
                  count={group.count}
                  open={isSectionOpen(group.key, groupIndex)}
                  onToggle={() =>
                    setSectionOverride((current) => ({
                      ...current,
                      [group.key]: !isSectionOpen(group.key, groupIndex),
                    }))
                  }
                >
                  {group.files.map((file, fileIndex) => {
                    const index = (sectionBases[groupIndex] ?? 0) + fileIndex
                    return (
                      <FileRow
                        key={file.id}
                        file={file}
                        isMobile={isMobile}
                        onDelete={handleDelete}
                        onReindex={handleReindex}
                        onImageClick={openLightbox}
                        onTextPreviewClick={setTextPreviewFile}
                        onRename={(fileId, fileName) =>
                          renameFile.mutateAsync({ fileId, fileName })
                        }
                        selected={index === navIdx}
                        index={index}
                      />
                    )
                  })}
                </FileSection>
              ))}
            </div>
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
