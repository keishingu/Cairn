'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import { FileTypeIcon } from '../../file-type-icon'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'

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
  const queryClient = useQueryClient()
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null)

  const { data: files = [], isLoading, isError } = useQuery<ProjectFileDto[]>({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`)
      if (!res.ok) throw new Error('Failed to fetch files')
      return res.json() as Promise<ProjectFileDto[]>
    },
  })

  const deleteFile = useMutation({
    mutationFn: (fileId: string) =>
      fetch(`/api/attachments/${fileId}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error('削除に失敗しました')
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      setMenuOpenId(null)
    },
  })

  // メニュー外クリックで閉じる
  React.useEffect(() => {
    if (!menuOpenId) return
    const close = () => setMenuOpenId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpenId])

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
        const sizeStr = formatFileSize(f.fileSize)
        const dateStr = formatDate(f.createdAt)
        const meta = [sizeStr, dateStr].filter(Boolean).join(' · ')
        const isMenuOpen = menuOpenId === f.id

        return (
          <div key={f.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--divider)', borderRadius: 6 }}>
            <a
              href={`/api/attachments/${f.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', cursor: 'pointer' }}
            >
              <FileTypeIcon mimeType={f.mimeType} fileName={f.fileName} fileId={f.id}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.fileName}
                  {i === 0 && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>最新</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{meta}</div>
              </div>
            </a>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : f.id) }}
                style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4, borderRadius: 4 }}
              >
                <Icon name="more" size={14}/>
              </button>
              {isMenuOpen && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 50,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: 'var(--shadow-md)', minWidth: 120, padding: 4,
                  }}
                >
                  <button
                    onClick={() => {
                      if (!confirm(`「${f.fileName}」を削除しますか？この操作は取り消せません。`)) return
                      deleteFile.mutate(f.id)
                    }}
                    disabled={deleteFile.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 10px', border: 'none', background: 'transparent',
                      color: 'var(--red)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                      borderRadius: 5, opacity: deleteFile.isPending ? 0.5 : 1,
                    }}
                  >
                    <Icon name="trash" size={13}/>
                    削除
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
