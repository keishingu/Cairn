'use client'

import { useQuery } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'

function fileKindLabel(mimeType: string | null, fileName: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) return 'XLS'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) return 'DOC'
  if (mimeType?.startsWith('image/')) return 'IMG'
  const ext = fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
  return ext.slice(0, 4)
}

function fileKindColor(kind: string): { bg: string; color: string } {
  if (kind === 'PDF') return { bg: 'var(--red-soft)', color: 'var(--red-text)' }
  if (kind === 'XLS') return { bg: 'var(--emerald-soft)', color: 'var(--emerald-text)' }
  if (kind === 'DOC') return { bg: 'var(--blue-soft)', color: 'var(--blue-text)' }
  if (kind === 'IMG') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)' }
  return { bg: 'var(--card-2)', color: 'var(--text-3)' }
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

export const FilesTab = ({ projectId }: { projectId: string }) => {
  const { data: files = [], isLoading, isError } = useQuery<ProjectFileDto[]>({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`)
      if (!res.ok) throw new Error('Failed to fetch files')
      return res.json() as Promise<ProjectFileDto[]>
    },
  })

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
      {files.map((f, i) => {
        const kind = fileKindLabel(f.mimeType, f.fileName)
        const { bg, color } = fileKindColor(kind)
        const sizeStr = formatFileSize(f.fileSize)
        const dateStr = formatDate(f.createdAt)
        const meta = [sizeStr, dateStr].filter(Boolean).join(' · ')
        return (
          <a
            key={f.id}
            href={`/api/attachments/${f.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--divider)', borderRadius: 6, cursor: 'pointer', textDecoration: 'none' }}
          >
            <div style={{
              width: 32, height: 36, borderRadius: 4, flexShrink: 0,
              background: bg, color,
              fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{kind}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.fileName}
                {i === 0 && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>最新</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{meta}</div>
            </div>
            <button
              onClick={e => e.preventDefault()}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}
            >
              <Icon name="more" size={14}/>
            </button>
          </a>
        )
      })}
    </div>
  )
}
