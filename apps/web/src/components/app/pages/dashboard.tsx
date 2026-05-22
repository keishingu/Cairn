'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Icon, AvatarStack, StatusChip } from '../primitives'
import { MEMBERS, STATUS, STATUS_COL, type StatusKey } from '../data'
import { MobileHeader } from '../mobile/header'
import type { ProjectDto } from '@/app/api/projects/route'
import type { TaskDto } from '@/app/api/tasks/route'
import type { CurrentUserDto } from '@/app/api/me/route'

const DAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']

function formatJapaneseDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${DAY_NAMES[d.getDay()]}`
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'おはよう'
  if (hour < 17) return 'こんにちは'
  return 'こんばんは'
}

function getProgressPct(project: ProjectDto, index: number): number {
  const statusProgress: Record<string, number> = {
    plan: 10, review: 30, wait: 50, doing: 70, retro: 90, done: 100,
  }
  return statusProgress[project.statusName] ?? (20 + index * 15)
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '日程未設定'
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (!end || end === start) return fmt(start)
  return `${fmt(start)}–${fmt(end)}`
}

interface PageDashboardProps {
  openPanel?: (project?: ProjectDto) => void
  isMobile?: boolean
}

export const PageDashboard = ({ openPanel, isMobile }: PageDashboardProps) => {
  const router = useRouter()
  const now = new Date()

  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const { data: tasks = [] } = useQuery<TaskDto[]>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()),
  })

  const { data: me } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/me').then(r => r.json()),
  })

  const activeProjects = projects.filter(p => p.statusName !== 'done')
  const todayStr = now.toISOString().slice(0, 10)
  const todayEvents = projects.filter(p =>
    p.startDate && p.startDate <= todayStr && (!p.endDate || p.endDate >= todayStr),
  )
  const incompleteTasks = tasks.filter(t => t.status !== 'done').length
  const doneTasks = tasks.filter(t => t.status === 'done').length

  if (isMobile) {
    const statItems = [
      { label: 'プロジェクト',   value: String(projects.length),    icon: 'folder', color: 'var(--accent)' },
      { label: '進行中',         value: String(activeProjects.length), icon: 'flag', color: 'var(--emerald)' },
      { label: '未完了タスク',   value: String(incompleteTasks),    icon: 'check',  color: 'var(--amber)' },
      { label: '完了タスク',     value: String(doneTasks),          icon: 'bell',   color: 'var(--rose)' },
    ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
        <MobileHeader title="ダッシュボード" right={
          <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <Icon name="bell" size={20}/>
          </button>
        }/>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          {/* Greeting */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{getGreeting(now.getHours())} 👋</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {me?.displayName ?? '…'}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {statItems.map(s => (
              <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={16} color={s.color}/>
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Active projects */}
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>進行中のプロジェクト</div>
            <button onClick={() => router.push('/projects')} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>すべて見る</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeProjects.slice(0, 4).map(p => {
              const cfg = STATUS[p.statusName as StatusKey]
              return (
                <div key={p.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg?.bg ?? 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="mountain" size={18} color={cfg?.dot ?? 'var(--text-3)'}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusChip s={p.statusName as StatusKey}/>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{formatDateRange(p.startDate, p.endDate)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {activeProjects.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                進行中のプロジェクトはありません
              </div>
            )}
          </div>

          {/* Today's schedule */}
          <div style={{ marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>今日の予定</div>
          {todayEvents.length === 0 ? (
            <div style={{ padding: '12px 0', color: 'var(--text-3)', fontSize: 13 }}>今日の予定はありません</div>
          ) : (
            todayEvents.slice(0, 5).map((p, i) => {
              const cfg = STATUS_COL[p.statusName as StatusKey]
              return (
                <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i > 0 ? '1px solid var(--divider)' : 'none' }}>
                  <div style={{ width: 4, borderRadius: 2, background: cfg?.bar ?? 'var(--accent)', flexShrink: 0 }}/>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="folder" size={10}/> {formatDateRange(p.startDate, p.endDate)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  const stats = [
    { label: '進行中プロジェクト', value: activeProjects.length,  delta: `全 ${projects.length} 件`,          c: 'var(--blue)' },
    { label: '今日のプロジェクト', value: todayEvents.length,      delta: '実施中',                            c: 'var(--accent)' },
    { label: '未完了タスク',       value: incompleteTasks,          delta: `完了 ${doneTasks} 件`,             c: 'var(--amber)' },
    { label: '完了タスク (今月)',  value: doneTasks,                delta: `+${doneTasks}`,                    c: 'var(--violet)' },
  ]

  return (
    <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 2 }}>{formatJapaneseDate(now)}</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>
            {getGreeting(now.getHours())}、{me?.displayName?.split(' ')[0] ?? '…'}さん
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => router.push('/projects')}>
            <Icon name="plus" size={14} /> 新規プロジェクト
          </button>
          <button className="btn btn-primary" onClick={() => router.push('/ai')}>
            <Icon name="sparkles" size={14} /> AIに相談
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: s.c }}>{s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Today's schedule */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>今日のプロジェクト</h3>
            <button
              onClick={() => router.push('/calendar')}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              カレンダーを見る <Icon name="arrowRight" size={11} />
            </button>
          </div>
          <div style={{ padding: '4px 18px 14px' }}>
            {todayEvents.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                今日の予定はありません
              </div>
            ) : (
              todayEvents.slice(0, 5).map((p, i) => {
                const cfg = STATUS_COL[p.statusName as StatusKey]
                return (
                  <div
                    key={p.id}
                    onClick={() => openPanel?.(p)}
                    style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < todayEvents.length - 1 ? '1px solid var(--divider)' : 'none', cursor: openPanel ? 'pointer' : 'default', alignItems: 'center' }}
                  >
                    <div style={{ width: 3, height: 36, borderRadius: 2, background: cfg?.bar ?? 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{formatDateRange(p.startDate, p.endDate)}</div>
                    </div>
                    <AvatarStack names={MEMBERS.slice(0, Math.min(p.memberCount, 4))} size={22} max={4} />
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* AI summary */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 100% 0%, var(--accent-soft) 0%, transparent 50%)', pointerEvents: 'none' }} />
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Icon name="sparkles" size={12} />
            </div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>AIからのサマリー</h3>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600 }}>AUTO-GENERATED</span>
          </div>
          <div style={{ padding: '12px 18px 14px', position: 'relative' }}>
            <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
              現在 <b>{activeProjects.length}件</b> のプロジェクトが進行中です。
              {incompleteTasks > 0 && <> 未完了タスクが <b>{incompleteTasks}件</b> あります。</>}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeProjects.slice(0, 3).map((p, i) => {
                const icons = ['flag', 'check', 'sparkles']
                return (
                  <button
                    key={p.id}
                    onClick={() => openPanel?.(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)' }}>
                      <Icon name={icons[i % 3] ?? 'flag'} size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{formatDateRange(p.startDate, p.endDate)}</div>
                    </div>
                    <Icon name="chevRight" size={13} color="var(--text-3)" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Projects table */}
        <div className="card" style={{ padding: 0, gridColumn: 'span 2' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>進行中のプロジェクト</h3>
            <button
              className="btn btn-ghost"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => router.push('/projects')}
            >
              すべて見る <Icon name="arrowRight" size={11} />
            </button>
          </div>
          <div style={{ padding: '0 8px' }}>
            {activeProjects.slice(0, 5).map((p, i) => (
              <div
                key={p.id}
                onClick={() => openPanel?.(p)}
                style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr 120px 100px 100px 80px',
                  gap: 12, alignItems: 'center',
                  padding: '12px 14px', borderBottom: i < Math.min(activeProjects.length - 1, 4) ? '1px solid var(--divider)' : 'none',
                  cursor: openPanel ? 'pointer' : 'default', borderRadius: 8,
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COL[p.statusName as StatusKey]?.bar ?? 'var(--text-3)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDateRange(p.startDate, p.endDate)}</div>
                <StatusChip s={p.statusName as StatusKey} />
                <AvatarStack names={MEMBERS.slice(0, Math.min(p.memberCount, 4))} size={22} />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="users" size={12} /> {p.memberCount}人
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--divider)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, right: `${100 - getProgressPct(p, i)}%`, background: STATUS_COL[p.statusName as StatusKey]?.bar ?? 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
            {activeProjects.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                進行中のプロジェクトはありません
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
