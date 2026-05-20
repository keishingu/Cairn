// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MobileHeader } from '../mobile-header'
import { Icon, StatusChip } from '../../primitives'
import { STATUS, type StatusKey } from '../../data'
import type { ProjectDto } from '@/app/api/projects/route'
import { MobileProjectScreen } from '../../mobile/project-screen'

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

function formatDates(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

const FILTERS = [
  { id: 'all',    label: 'すべて' },
  { id: 'active', label: '進行中' },
  { id: 'mine',   label: '参加中' },
] as const

export function MobileProjects() {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const [filter, setFilter] = React.useState<'all' | 'active' | 'mine'>('all')
  const [search, setSearch] = React.useState('')
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)

  const filtered = projects.filter(p => {
    if (filter === 'active' && p.statusName === 'done') return false
    if (search && !p.title.includes(search)) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'var(--bg)' }}>
      {selectedProject && (
        <MobileProjectScreen project={selectedProject} onBack={() => setSelectedProject(null)}/>
      )}
      <MobileHeader title="プロジェクト" right={
        <button style={{ border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="plus" size={13}/> 新規
        </button>
      }/>

      <div style={{ padding: '12px 16px 0' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', height: 40, marginBottom: 12 }}>
          <Icon name="search" size={15} color="var(--text-3)"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="プロジェクトを検索" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}/>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: filter === f.id ? 'var(--accent)' : 'var(--card)', color: filter === f.id ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 13, fontWeight: filter === f.id ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトが見つかりません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((p, i) => {
              const cfg = STATUS[p.statusName as StatusKey]
              const accent = cfg?.dot ?? 'var(--text-3)'
              return (
                <div key={p.id} onClick={() => setSelectedProject(p)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'transform .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4, lineHeight: 1.3 }}>{p.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDates(p.startDate, p.endDate)} · {p.memberCount}人</div>
                    </div>
                    <StatusChip s={p.statusName as StatusKey}/>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${30 + (i * 9) % 60}%`, background: accent, borderRadius: 2 }}/>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 12, fontSize: 12, color: 'var(--text-3)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="users" size={12}/> {p.memberCount}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={12}/> 0</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
