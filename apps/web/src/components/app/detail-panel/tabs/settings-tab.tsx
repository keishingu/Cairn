'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
    {children}
  </div>
)

interface SettingsTabProps {
  project: ProjectDto
  onDeleted: () => void
}

export const SettingsTab = ({ project, onDeleted }: SettingsTabProps) => {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projects'] })

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      const res = await fetchWithAuth(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      if (!res.ok) throw new Error('操作に失敗しました')
    },
    onSuccess: invalidate,
  })

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setDeleteError(data.error ?? '削除に失敗しました')
        return
      }
      invalidate()
      onDeleted()
    } catch {
      setDeleteError('削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* アーカイブ */}
      <section>
        <SectionLabel>アーカイブ</SectionLabel>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 10 }}>
            {project.archived
              ? 'このプロジェクトはアーカイブされています。アーカイブを解除するとプロジェクト一覧に再表示されます。'
              : 'アーカイブするとプロジェクト一覧の「アーカイブ」タブに移動します。データは保持されます。'}
          </div>
          {archiveMutation.isError && (
            <div style={{ fontSize: 12, color: 'var(--red-text)', marginBottom: 8 }}>
              ⚠ 操作に失敗しました
            </div>
          )}
          <button
            onClick={() => archiveMutation.mutate(!project.archived)}
            disabled={archiveMutation.isPending}
            className="btn btn-ghost"
            style={{ height: 32, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name={project.archived ? 'refresh' : 'close'} size={12}/>
            {archiveMutation.isPending ? '処理中…' : project.archived ? 'アーカイブを解除する' : 'アーカイブする'}
          </button>
        </div>
      </section>

      {/* 危険な操作 */}
      <section>
        <SectionLabel>危険な操作</SectionLabel>
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--red)', background: 'var(--red-soft)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red-text)', marginBottom: 10 }}>プロジェクトの削除</div>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              プロジェクトを削除する
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--red-text)', lineHeight: 1.6 }}>
                チャット・ファイル・タスクを含むすべてのデータが完全に削除されます。この操作は取り消せません。
              </div>
              {deleteError && (
                <div style={{ fontSize: 12, color: 'var(--red-text)', padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.08)' }}>
                  ⚠ {deleteError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                  disabled={isDeleting}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: isDeleting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isDeleting ? 0.7 : 1 }}
                >
                  {isDeleting ? '削除中…' : '本当に削除する'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
