'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon, Avatar, StatusChip } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'

const WS_ROLE_LABEL: Record<WorkspaceMemberDto['role'], string> = {
  owner:  'オーナー',
  admin:  '管理者',
  member: 'メンバー',
  guest:  'ゲスト',
}

const WS_ROLE_STYLE: Record<WorkspaceMemberDto['role'], { c: string; bg: string }> = {
  owner:  { c: 'var(--accent-text)',  bg: 'var(--accent-soft)' },
  admin:  { c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
  member: { c: 'var(--text-3)',       bg: 'var(--card-2)' },
  guest:  { c: 'var(--text-4)',       bg: 'var(--card-2)' },
}

const PROJECT_ROLE_LABEL: Record<string, string> = {
  leader:    'リーダー',
  subleader: 'サブリーダー',
  member:    'メンバー',
  reviewer:  'レビュワー',
  observer:  'オブザーバー',
}

const PROJECT_ROLE_STYLE: { [key: string]: { c: string; bg: string } } = {
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
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

interface ProjectRowProps {
  project: MemberProjectDto
  onClick: () => void
}

const ProjectRow = ({ project, onClick }: ProjectRowProps) => {
  const rs = PROJECT_ROLE_STYLE[project.role] ?? { c: 'var(--text-3)', bg: 'var(--card-2)' }
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 6px', borderBottom: '1px solid var(--divider)',
        cursor: 'pointer', borderRadius: 6, margin: '0 -6px',
        transition: 'background .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: 'var(--card-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)',
      }}>
        <Icon name="folder" size={14}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {project.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusChip s={project.statusName}/>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {formatDateRange(project.startDate, project.endDate)}
          </span>
        </div>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 700, flexShrink: 0,
        color: rs.c, background: rs.bg,
        padding: '2px 7px', borderRadius: 4,
      }}>
        {PROJECT_ROLE_LABEL[project.role] ?? project.role}
      </span>
      <Icon name="chevRight" size={12} color="var(--text-4)"/>
    </div>
  )
}

interface MemberDetailPanelProps {
  member: WorkspaceMemberDto
  onProjectClick: (project: MemberProjectDto) => void
  onClose: () => void
}

export const MemberDetailPanel = ({ member, onProjectClick, onClose }: MemberDetailPanelProps) => {
  const rs = WS_ROLE_STYLE[member.role]

  const { data: projects = [], isLoading } = useQuery<MemberProjectDto[]>({
    queryKey: ['member-projects', member.userId],
    queryFn: () =>
      fetch(`/api/workspaces/members/${member.userId}/projects`).then(r => r.json()),
  })

  return (
    <aside style={{
      width: 380, flexShrink: 0,
      background: 'var(--card)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
      boxShadow: 'var(--shadow-lg)',
      animation: 'projectPanelIn .2s cubic-bezier(.2,.7,.3,1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 14px',
        borderBottom: '1px solid var(--divider)',
        display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
      }}>
        <Avatar name={member.displayName} size={52}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
            {member.displayName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700,
              color: rs.c, background: rs.bg,
              padding: '2px 8px', borderRadius: 4,
            }}>
              {WS_ROLE_LABEL[member.role]}
            </span>
            <span style={{
              fontSize: 11, color: 'var(--text-4)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Icon name="clock" size={10}/>
              {formatJoinedAt(member.joinedAt)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--text-3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon name="close" size={15}/>
        </button>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--divider)',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, padding: '12px 16px',
          borderRight: '1px solid var(--divider)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.length}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="folder" size={11}/> 参加プロジェクト
          </span>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.filter(p => p.role === 'leader' || p.role === 'subleader').length}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="users" size={11}/> リーダー経験
          </span>
        </div>
      </div>

      {/* Project history */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-4)',
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          プロジェクト履歴
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card-2)', flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, width: '70%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 6 }}/>
                  <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'var(--card-2)' }}/>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 8, padding: '32px 0', color: 'var(--text-4)',
          }}>
            <Icon name="folder" size={28}/>
            <span style={{ fontSize: 12.5 }}>参加プロジェクトはありません</span>
          </div>
        ) : (
          projects.map(p => (
            <ProjectRow key={p.projectId} project={p} onClick={() => onProjectClick(p)}/>
          ))
        )}
      </div>
    </aside>
  )
}
