'use client'

import { Icon, StatusChip } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)} ~ ${fmt(end)}` : fmt(start)
}

export const OverviewTab = ({ project }: { project: ProjectDto }) => (
  <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>日程</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{formatDateRange(project.startDate, project.endDate)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{project.memberCount}人参加</div>
      </div>
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>ステータス</div>
        <StatusChip s={project.statusName}/>
      </div>
    </div>
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>サマリー</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
        北アルプス・上高地から槍ヶ岳〜穂高連峰の縦走。8名参加、リーダーは山田。装備リスト最終化と緊急連絡網の整備が次のアクション。
      </div>
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, padding: '0 2px' }}>マイルストーン</div>
      {[
        { d: '5/30', n: '計画書 v2 審議', done: true },
        { d: '6/2',  n: '装備チェック', done: true },
        { d: '6/5',  n: '緊急連絡先確認', done: false },
        { d: '6/12', n: '出発', done: false },
      ].map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${m.done ? 'var(--accent)' : 'var(--border-2)'}`, background: m.done ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
            {m.done && <Icon name="check" size={10} strokeWidth={3}/>}
          </div>
          <span style={{ fontSize: 12.5, color: m.done ? 'var(--text-3)' : 'var(--text)', textDecoration: m.done ? 'line-through' : 'none', flex: 1 }}>{m.n}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.d}</span>
        </div>
      ))}
    </div>
  </div>
)
