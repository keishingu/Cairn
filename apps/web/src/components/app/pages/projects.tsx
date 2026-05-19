'use client'

import React from 'react'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import { PROJECTS, MEMBERS } from '../data'

interface PageProjectsProps {
  openPanel: () => void
}

export const PageProjects = ({ openPanel }: PageProjectsProps) => {
  const [view, setView] = React.useState<'grid' | 'table'>('grid')
  const [filter, setFilter] = React.useState('all')
  const counts = {
    all: PROJECTS.length,
    mine: 5, owned: 3,
    active: PROJECTS.filter(p => p.status !== 'done').length,
    archived: 0,
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all',      l: 'すべて',   n: counts.all },
            { id: 'mine',     l: '参加中',   n: counts.mine },
            { id: 'owned',    l: '主催',     n: counts.owned },
            { id: 'active',   l: '進行中',   n: counts.active },
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
          <button className="btn btn-primary"><Icon name="plus" size={13}/> 新規プロジェクト</button>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {PROJECTS.map((p, i) => (
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
                  <StatusChip s={p.status}/>
                </div>
                {p.unread > 0 && (
                  <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                    {p.unread} 未読
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{p.dates} · {p.members}人</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={22}/>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="chat" size={12}/>{p.unread || 0}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12}/>{2 + i}</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${30 + (i * 9) % 60}%`, background: p.accent, borderRadius: 3 }}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 80px 32px', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <span/><span>プロジェクト</span><span>ステータス</span><span>日程</span><span>メンバー</span><span>進捗</span><span style={{ textAlign: 'right' }}>未読</span><span/>
          </div>
          {PROJECTS.map((p, i) => (
            <div key={p.id} onClick={() => openPanel()} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 120px 100px 80px 32px',
              gap: 16, padding: '12px 16px', borderBottom: i < PROJECTS.length - 1 ? '1px solid var(--divider)' : 'none',
              alignItems: 'center', cursor: 'pointer',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.accent }}/>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
              <StatusChip s={p.status}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{p.dates}</span>
              <AvatarStack names={MEMBERS.slice(0, Math.min(p.members, 4))} size={22}/>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${30 + (i * 9) % 60}%`, background: p.accent, borderRadius: 3 }}/>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: p.unread > 0 ? 'var(--accent-text)' : 'var(--text-3)', textAlign: 'right' }}>{p.unread || '—'}</span>
              <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><Icon name="more" size={14}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
