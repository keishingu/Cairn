'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import { MEMBERS, STATUS, type StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

interface PageProjectsProps {
  openPanel: () => void
}

function formatDates(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetch('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

async function createProject(body: {
  title: string
  description?: string | undefined
  statusId?: string | undefined
  startDate?: string | undefined
  endDate?: string | undefined
}): Promise<ProjectDto> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('プロジェクトの作成に失敗しました')
  return res.json() as Promise<ProjectDto>
}

interface CreateProjectModalProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
}

const CreateProjectModal = ({ onClose, onCreated }: CreateProjectModalProps) => {
  const { data: statuses = [] } = useQuery({ queryKey: ['project-statuses'], queryFn: fetchStatuses })
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [statusId, setStatusId] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (statuses.length > 0 && !statusId) setStatusId(statuses[0]!.id)
  }, [statuses, statusId])

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      onCreated(project)
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    mutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      statusId: statusId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border-2)', background: 'var(--card-2)',
    color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
    display: 'block', marginBottom: 5,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', borderRadius: 16, width: 480, maxWidth: '90vw',
        boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
      }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>新規プロジェクト</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <Icon name="x" size={16}/>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>タイトル <span style={{ color: 'var(--accent)' }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 夏山合宿計画" style={inputStyle} autoFocus/>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>説明</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="プロジェクトの概要を入力..."
              rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ステータス</label>
            <select value={statusId} onChange={e => setStatusId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>開始日</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>終了日</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle}/>
            </div>
          </div>
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 12.5 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn" disabled={mutation.isPending}>キャンセル</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? '作成中...' : 'プロジェクトを作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export const PageProjects = ({ openPanel }: PageProjectsProps) => {
  const queryClient = useQueryClient()
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const [view, setView] = React.useState<'grid' | 'table'>('grid')
  const [filter, setFilter] = React.useState('all')
  const [showCreate, setShowCreate] = React.useState(false)

  const handleCreated = (project: ProjectDto) => {
    queryClient.setQueryData<ProjectDto[]>(['projects'], prev => [...(prev ?? []), project])
  }

  const counts = {
    all:      projects.length,
    mine:     Math.min(5, projects.length),
    owned:    Math.min(3, projects.length),
    active:   projects.filter(p => p.statusName !== 'done').length,
    archived: 0,
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all',      l: 'すべて',     n: counts.all },
            { id: 'mine',     l: '参加中',     n: counts.mine },
            { id: 'owned',    l: '主催',       n: counts.owned },
            { id: 'active',   l: '進行中',     n: counts.active },
            { id: 'archived', l: 'アーカイブ', n: counts.archived },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              color: filter === f.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: filter === f.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.l}
              <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ display: 'flex', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {[
              { id: 'grid' as const,  i: 'kanban', l: 'カード' },
              { id: 'table' as const, i: 'list',   l: 'テーブル' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: view === v.id ? 'var(--card)' : 'transparent',
                color: view === v.id ? 'var(--text)' : 'var(--text-3)',
                fontSize: 12, fontWeight: view === v.id ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: view === v.id ? 'var(--shadow-sm)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}><Icon name={v.i} size={12}/> {v.l}</button>
            ))}
          </div>
          <button className="btn"><Icon name="filter" size={13}/> フィルター</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={13}/> 新規プロジェクト</button>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {projects.map((p, i) => {
            const accent = STATUS[p.statusName as StatusKey]?.dot ?? 'var(--text-3)'
            return (
              <div key={p.id} onClick={() => openPanel()} style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                transition: 'transform .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
              >
                <div style={{ position: 'relative' }}>
                  <MountainPhoto idx={i + 2} height={120} flat/>
                  <div style={{ position: 'absolute', top: 10, left: 10 }}>
                    <StatusChip s={p.statusName as StatusKey}/>
                  </div>
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{formatDates(p.startDate, p.endDate)} · {p.memberCount}人</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AvatarStack names={MEMBERS.slice(0, Math.min(p.memberCount, 4))} size={22}/>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={12}/>0</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12}/>{2 + i}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${30 + (i * 9) % 60}%`, background: accent, borderRadius: 3 }}/>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <span/><span>プロジェクト</span><span>ステータス</span><span>日程</span><span>メンバー</span><span>進捗</span><span/>
          </div>
          {projects.map((p, i) => {
            const accent = STATUS[p.statusName as StatusKey]?.dot ?? 'var(--text-3)'
            return (
              <div key={p.id} onClick={() => openPanel()} style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 32px',
                gap: 16, padding: '12px 16px', borderBottom: i < projects.length - 1 ? '1px solid var(--divider)' : 'none',
                alignItems: 'center', cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: accent }}/>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.title}</span>
                <StatusChip s={p.statusName as StatusKey}/>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{formatDates(p.startDate, p.endDate)}</span>
                <AvatarStack names={MEMBERS.slice(0, Math.min(p.memberCount, 4))} size={22}/>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${30 + (i * 9) % 60}%`, background: accent, borderRadius: 3 }}/>
                </div>
                <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={14}/></button>
              </div>
            )
          })}
        </div>
      )}
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated}/>}
    </div>
  )
}
