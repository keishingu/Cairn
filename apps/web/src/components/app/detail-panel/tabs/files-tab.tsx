'use client'

import React from 'react'
import { isVideoAttachmentMime } from '@cairn/shared'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import { Icon } from '../../primitives'
import { InlineError } from '../../inline-error'
import { toast } from '@/lib/toast'
import { describeUploadFailures } from '@/lib/files/upload-failures'
import { FileTypeIcon, GoogleDocsIcon, IndexDot } from '../../file-type-icon'
import { ImageLightbox, type LightboxImage } from '../../image-lightbox'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'
import { AttachmentUploadError, uploadAttachment, type UploadedAttachment } from '@/lib/attachments/upload-client'
import { useProjectFiles } from '@/hooks/use-project-files'
import { useT } from '@/components/locale-provider'
import { useAppShell } from '../../app-shell-context'
import { useHeicAccept } from '@/hooks/use-heic-accept'
import { convertHeicToJpeg, isHeicLike } from '@/lib/process-image'
import { useUploadRights } from '@/hooks/use-upload-rights'
import { openFileDownload } from '@/lib/attachments/download-original'

const ACCEPT_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // 動画は Solo の支援者本人だけが送れる。送信時にサーバーが理由つきで断る
  'video/mp4', 'video/quicktime', 'video/webm',
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
  '.mp4', '.m4v', '.mov', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.md', '.markdown',
].join(',')

function IndexingBadge({ status }: { status: string | undefined }) {
  const t = useT()
  if (!status || status === 'indexed' || status === 'skipped') return null
  if (status === 'pending') {
    return (
      <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--card-2)', color: 'var(--text-3)', flexShrink: 0 }}>
        {t('Indexing')}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--red-soft)', color: 'var(--red-text)', flexShrink: 0 }}>
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
  // 原本は Solo 支援者向けの機能。取得できる本人には Web・アプリとも出す。
  // 取得できない人には、アプリ（WebView）では課金への誘導と受け取られないよう、ストアの決済ポリシーに合わせて出さない
  const { isWebView } = useAppShell()
  const uploadRights = useUploadRights()
  const canDownloadOriginal = uploadRights.data?.canDownloadOriginal === true
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string[] | null>(null)
  const [finalizeRetries, setFinalizeRetries] = React.useState<Array<{
    id: string
    channelId: string
    projectId: string
    file: File
    error: string
    retryFinalize: () => Promise<UploadedAttachment>
    isRetrying?: boolean
  }>>([])
  const uploadScopeRef = React.useRef({ channelId, projectId })
  if (uploadScopeRef.current.channelId !== channelId || uploadScopeRef.current.projectId !== projectId) {
    uploadScopeRef.current = { channelId, projectId }
  }
  React.useEffect(() => {
    setIsUploading(false)
    setUploadError(null)
    setFinalizeRetries([])
  }, [channelId, projectId])
  const fileAccept = useHeicAccept(ACCEPT_FILE_TYPES)
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
    const uploadChannelId = channelId
    const uploadProjectId = projectId
    const uploadScope = uploadScopeRef.current
    // 呼び出し元がすぐ input を空にすると FileList も空になるため、最初の await より前に控えておく
    const files = Array.from(selectedFiles)

    setIsUploading(true)
    setUploadError(null)

    try {
      const results = await Promise.allSettled(
        files.map(async (picked) => {
          // iPhone の写真（HEIC）は Safari 以外で表示できず、添付の許可形式にも無いため JPEG にして送る
          let file = picked
          if (isHeicLike(picked)) {
            try {
              file = await convertHeicToJpeg(picked)
            } catch (error) {
              console.error('[FilesTab] HEIC の変換に失敗:', error)
              throw new Error(t('Could not convert the HEIC image. Convert it to JPEG and upload again.'))
            }
          }
          try {
            await uploadAttachment(channelId, file)
          } catch (error) {
            if (!(error instanceof AttachmentUploadError)) throw error
            const retryFinalize = error.retryFinalize
            if (retryFinalize) {
              if (uploadScopeRef.current !== uploadScope) throw error
              setFinalizeRetries(current => [...current, {
                id: `finalize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                channelId: uploadChannelId,
                projectId: uploadProjectId,
                file,
                error: error.serverMessage ?? t('Could not upload'),
                retryFinalize,
              }])
              throw error
            }
            throw new Error(
              error.failure === 'unsupported_type'
                ? t('Unsupported file type (image, video, PDF, Word, Excel, PowerPoint, CSV, or text)')
                : error.failure === 'unknown_type'
                  ? t('Unknown file type. Add an extension and upload again.')
                  : (error.serverMessage ?? t('Could not upload')),
            )
          }
        }),
      )
      if (uploadScopeRef.current !== uploadScope) return

      const succeeded = results.filter((result) => result.status === 'fulfilled').length
      const failures = describeUploadFailures(files, results.map(result =>
        result.status === 'rejected' && result.reason instanceof AttachmentUploadError && result.reason.retryFinalize
          ? { status: 'fulfilled' as const, value: undefined }
          : result,
      ), t('Could not upload'))

      if (succeeded > 0) {
        await queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
        await queryClient.invalidateQueries({ queryKey: ['files'] })
      }
      if (uploadScopeRef.current !== uploadScope) return
      if (succeeded > 0) toast.success(t('Added {count} files', { count: succeeded }))
      // 複数選択で一部だけ失敗したとき、先頭の1件だけでなく失敗したものをすべて示す
      if (failures.length > 0) setUploadError(failures)
    } catch (error) {
      if (uploadScopeRef.current === uploadScope) {
        setUploadError([error instanceof Error ? error.message : t('Could not upload')])
      }
    } finally {
      if (uploadScopeRef.current === uploadScope) setIsUploading(false)
    }
  }

  const retryFinalize = async (id: string) => {
    const pending = finalizeRetries.find(item => item.id === id)
    const retryChannelId = channelId
    const retryProjectId = projectId
    const retryScope = uploadScopeRef.current
    if (!pending || !retryChannelId || pending.channelId !== retryChannelId || pending.projectId !== retryProjectId) return
    setFinalizeRetries(current => current.map(item => item.id === id ? { ...item, isRetrying: true } : item))
    try {
      await pending.retryFinalize()
      if (uploadScopeRef.current !== retryScope) return
      setFinalizeRetries(current => current.filter(item => item.id !== id))
      await queryClient.invalidateQueries({ queryKey: ['project-files', retryProjectId] })
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      if (uploadScopeRef.current !== retryScope) return
      toast.success(t('Added {count} files', { count: 1 }))
    } catch (error) {
      if (uploadScopeRef.current !== retryScope) return
      const nextRetry = error instanceof AttachmentUploadError ? error.retryFinalize : undefined
      setFinalizeRetries(current => current.map(item => item.id === id ? {
        ...item,
        error: error instanceof Error ? error.message : t('Could not upload'),
        ...(nextRetry ? { retryFinalize: nextRetry } : {}),
        isRetrying: false,
      } : item))
    }
  }

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 'var(--fs-md)' }}>
        {t('Loading…')}
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red-text)', fontSize: 'var(--fs-md)' }}>
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
          accept={fileAccept}
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
          className="btn btn-sm"
        >
          <Icon name="plus" size={13} />
          {isUploading ? t('Uploading...') : t('Add a file')}
        </button>
      </div>

      {/* 支援状態を取れないときは「権利なし」として原本の項目を黙って隠さず、失敗を見せて再試行させる */}
      {uploadRights.isError && files.some(f => f.mimeType === 'application/pdf' || isVideoAttachmentMime(f.mimeType)) && (
        <InlineError variant="box" style={{ marginBottom: 8 }}>
          <span>{t('Could not check whether you can download original files.')}</span>{' '}
          <button type="button" className="btn btn-xs" disabled={uploadRights.isFetching} onClick={() => void uploadRights.refetch()}>
            {t('Retry')}
          </button>
        </InlineError>
      )}

      {uploadError && (
        <InlineError variant="box" onDismiss={() => setUploadError(null)} style={{ marginBottom: 8 }}>
          {uploadError.map((message, i) => <div key={i}>{message}</div>)}
        </InlineError>
      )}

      {finalizeRetries.map(item => (
        <div key={item.id} role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, marginBottom: 8, borderRadius: 6, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 'var(--fs-sm)' }}>
          <span style={{ flex: 1 }}>{item.file.name}: {item.error}</span>
          <button type="button" className="btn btn-xs" disabled={item.isRetrying} onClick={() => void retryFinalize(item.id)}>
            {item.isRetrying ? t('Uploading...') : t('Retry')}
          </button>
          <button type="button" className="btn btn-xs" disabled={item.isRetrying} onClick={() => setFinalizeRetries(current => current.filter(retry => retry.id !== item.id))}>
            {t('Cancel')}
          </button>
        </div>
      ))}

      {files.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 'var(--fs-md)', padding: '24px 0' }}>
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
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.fileName}
                  {f.isLatest && <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>{t('Latest')}</span>}
                  {isLink && <IndexingBadge status={f.indexingStatus}/>}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>{isLink ? t('External link') : meta}</div>
              </div>
            </a>

            <RowActionMenu
              actions={[
                ...(f.mimeType === 'application/pdf' && (canDownloadOriginal || !isWebView) ? [{
                  icon: 'external-link' as const,
                  label: canDownloadOriginal ? t('Download original PDF') : t('Download original PDF (new PDFs are supporter only)'),
                  onSelect: () => openFileDownload(`/api/attachments/${f.id}?original=1`, f.fileName),
                }] : []),
                // 動画は全員が圧縮版を再生・保存し、原本は取得できる本人にだけ出す（支援者でない人に課金の案内は出さない）
                ...(isVideoAttachmentMime(f.mimeType) && canDownloadOriginal ? [{
                  icon: 'external-link' as const,
                  label: t('Download original video'),
                  onSelect: () => openFileDownload(`/api/attachments/${f.id}?original=1`, f.fileName),
                }] : []),
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
