'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon, Avatar, StatusChip } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { MobileProjectScreen } from './project-screen'
import type { ProjectDto } from '@/app/api/projects/route'

const WS_ROLE_LABEL: Record<WorkspaceMemberDto['role'], string> = {
  owner:  'オーナー', admin: '管理者', member: 'メンバー', guest: 'ゲスト',
}
const WS_ROLE_STYLE: Record<WorkspaceMemberDto['role'], { c: string; bg: string }> = {
  owner:  { c: 'var(--accent-text)',  bg: 'var(--accent-soft)' },
  admin:  { c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
  member: { c: 'var(--text-3)',       bg: 'var(--card-2)' },
  guest:  { c: 'var(--text-4)',       bg: 'var(--card-2)' },
}
const PROJECT_ROLE_LABEL: Record<string, string> = {
  leader: 'リーダー', subleader: 'サブリーダー',
  member: 'メンバー', reviewer: 'レビュワー', observer: 'オブザーバー',
}
const PROJECT_ROLE_STYLE: { [k: string]: { c: string; bg: string } } = {
  leader:    { c: 'var(--accent-text)',  bg: 'var(--accent-soft)' },
  subleader: { c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
  member:    { c: 'var(--text-3)',       bg: 'var(--card-2)' },
  reviewer:  { c: 'var(--text-2)',       bg: 'var(--card-2)' },
  observer:  { c: 'var(--text-4)',       bg: 'var(--card-2)' },
}

function formatJoinedAt(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}年${d.getMonth() + 1}月参加`
}
function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

interface MobileMemberScreenProps {
  member: WorkspaceMemberDto
  onBack: () => void
}

export function MobileMemberScreen({ member, onBack }: MobileMemberScreenProps) {
  const rs = WS_ROLE_STYLE[member.role]
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)

  const { data: projects = [], isLoading } = useQuery<MemberProjectDto[]>({
    queryKey: ['member-projects', member.userId],
    queryFn: () =>
      fetch(`/api/workspaces/members/${member.userId}/projects`).then(r => r.json()),
  })

  const handleProjectClick = (p: MemberProjectDto) => {
    setSelectedProject({
      id: p.projectId, title: p.title, statusName: p.statusName,
      startDate: p.startDate, endDate: p.endDate, memberCount: p.memberCount,
      memberNames: [], taskCount: 0, completedTaskCount: 0,
      isOwner: p.role === 'leader', isMember: true, archived: false,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight .22s cubic-bezier(.2,.7,.3,1)',
    }}>
      {selectedProject && (
        <MobileProjectScreen project={selectedProject} onBack={() => setSelectedProject(null)}/>
      )}

      {/* Header */}
      <div style={{
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        padding: 'max(16px, env(safe-area-inset-top)) 16px 14px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button
            onClick={onBack}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: 'var(--card-2)', color: 'var(--text-2)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon name="chevLeft" size={18}/>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', flex: 1 }}>メンバー詳細</span>
        </div>

        {/* Member info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={member.displayName} size={52}/>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
              {member.displayName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: rs.c, background: rs.bg,
                padding: '2px 8px', borderRadius: 4,
              }}>
                {WS_ROLE_LABEL[member.role]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-4)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="clock" size={11}/> {formatJoinedAt(member.joinedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', background: 'var(--card)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ flex: 1, padding: '12px 20px', borderRight: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="folder" size={12}/> 参加プロジェクト
          </div>
        </div>
        <div style={{ flex: 1, padding: '12px 20px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.filter(p => p.role === 'leader' || p.role === 'subleader').length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="users" size={12}/> リーダー経験
          </div>
        </div>
      </div>

      {/* Project history */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: '14px 16px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          プロジェクト履歴
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--card-2)', flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: '65%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 7 }}/>
                  <div style={{ height: 11, width: '40%', borderRadius: 4, background: 'var(--card-2)' }}/>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 16px', color: 'var(--text-4)' }}>
            <Icon name="folder" size={32}/>
            <span style={{ fontSize: 14 }}>参加プロジェクトはありません</span>
          </div>
        ) : projects.map(p => {
          const prs = PROJECT_ROLE_STYLE[p.role] ?? { c: 'var(--text-3)', bg: 'var(--card-2)' }
          return (
            <button
              key={p.projectId}
              onClick={() => handleProjectClick(p)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--divider)',
                background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'var(--card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)',
              }}>
                <Icon name="folder" size={16}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                  {p.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusChip s={p.statusName}/>
                  <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
                    {formatDateRange(p.startDate, p.endDate)}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: prs.c, background: prs.bg, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                {PROJECT_ROLE_LABEL[p.role] ?? p.role}
              </span>
              <Icon name="chevRight" size={14} color="var(--text-4)"/>
            </button>
          )
        })}
      </div>
    </div>
  )
}
