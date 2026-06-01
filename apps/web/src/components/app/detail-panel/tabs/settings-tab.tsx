'use client'

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetchWithAuth('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', height: 34, padding: '0 10px',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--card)', color: 'var(--text)',
    fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  }
}

function textareaStyle(): React.CSSProperties {
  return {
    ...inputStyle(), height: 'auto', padding: '8px 10px',
    resize: 'vertical', lineHeight: 1.55, minHeight: 72,
  }
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
    {children}
  </div>
)

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>{children}</div>
)

interface SettingsTabProps {
  project: ProjectDto
  onDeleted: () => void
}

export const SettingsTab = ({ project, onDeleted }: SettingsTabProps) => {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projects'] })

  const [title, setTitle] = React.useState(project.title)
  const [description, setDescription] = React.useState(project.description ?? '')
  const [startDate, setStartDate] = React.useState(project.startDate ?? '')
  const [endDate, setEndDate] = React.useState(project.endDate ?? '')
  const [selectedStatus, setSelectedStatus] = React.useState(project.statusName)
  const [isDirty, setIsDirty] = React.useState(false)

  // Reset when project changes
  React.useEffect(() => {
    setTitle(project.title)
    setDescription(project.description ?? '')
    setStartDate(project.startDate ?? '')
    setEndDate(project.endDate ?? '')
    setSelectedStatus(project.statusName)
    setIsDirty(false)
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: statuses = [] } = useQuery({ queryKey: ['statuses'], queryFn: fetchStatuses })

  const markDirty = () => setIsDirty(true)

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: {
        title: string
        description: string | null
        startDate: string | null
        endDate: string | null
        statusName?: string
      } = {
        title,
        description: description.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
      }
      if (selectedStatus !== project.statusName && selectedStatus !== null) body.statusName = selectedStatus

      const res = await fetchWithAuth(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => { invalidate(); setIsDirty(false) },
  })

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

      {/* 基本情報 */}
      <section>
        <SectionLabel>基本情報</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div>
            <FieldLabel>タイトル</FieldLabel>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); markDirty() }}
              style={inputStyle()}
            />
          </div>

          <div>
            <FieldLabel>説明</FieldLabel>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); markDirty() }}
              placeholder="プロジェクトの概要や目標を記入…"
              rows={3}
              style={textareaStyle() as React.CSSProperties}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <FieldLabel>開始日</FieldLabel>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); markDirty() }} style={inputStyle()}/>
            </div>
            <div>
              <FieldLabel>終了日</FieldLabel>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); markDirty() }} style={inputStyle()}/>
            </div>
          </div>

          <div>
            <FieldLabel>ステータス</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {statuses.map(s => {
                const active = selectedStatus === s.name
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStatus(s.name as typeof selectedStatus); markDirty() }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                      background: active ? s.color + '22' : 'var(--card-2)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 500, color: active ? 'var(--text)' : 'var(--text-3)' }}>{s.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {updateMutation.isError && (
            <div style={{ fontSize: 12, color: 'var(--red-text)' }}>
              ⚠ {(updateMutation.error as Error).message}
            </div>
          )}

          {isDirty && (
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || !title.trim()}
              className="btn btn-primary"
              style={{ height: 34, fontSize: 12.5, opacity: (updateMutation.isPending || !title.trim()) ? 0.6 : 1 }}
            >
              {updateMutation.isPending ? '保存中…' : '変更を保存'}
            </button>
          )}
        </div>
      </section>

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
