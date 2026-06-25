'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar, StatusChip, ArchivedBadge, ARCHIVED_OPACITY } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import type { CurrentUserDto } from '@/app/api/me/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

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
  isMobile?: boolean
}

const ProjectRow = ({ project, onClick, isMobile }: ProjectRowProps) => {
  const rs = PROJECT_ROLE_STYLE[project.role] ?? { c: 'var(--text-3)', bg: 'var(--card-2)' }

  if (isMobile) {
    return (
      <button
        onClick={onClick}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--divider)',
          background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          opacity: project.archived ? ARCHIVED_OPACITY : 1,
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
            {project.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusChip name={project.statusName ?? ''} color={project.statusColor ?? '#9CA3AF'}/>
            {project.archived && <ArchivedBadge/>}
            <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
              {formatDateRange(project.startDate, project.endDate)}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: rs.c, background: rs.bg, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
          {PROJECT_ROLE_LABEL[project.role] ?? project.role}
        </span>
        <Icon name="chevRight" size={14} color="var(--text-4)"/>
      </button>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 6px', borderBottom: '1px solid var(--divider)',
        cursor: 'pointer', borderRadius: 6, margin: '0 -6px',
        transition: 'background .1s',
        opacity: project.archived ? ARCHIVED_OPACITY : 1,
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
          <StatusChip name={project.statusName ?? ''} color={project.statusColor ?? '#9CA3AF'}/>
          {project.archived && <ArchivedBadge/>}
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
  isMobile?: boolean
}

export const MemberDetailPanel = ({ member, onProjectClick, onClose, isMobile }: MemberDetailPanelProps) => {
  const queryClient = useQueryClient()

  // ---- ロール変更 ----
  const [currentRole, setCurrentRole] = React.useState(member.role)
  React.useEffect(() => { setCurrentRole(member.role) }, [member.role])

  const [showRoleMenu, setShowRoleMenu] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!showRoleMenu) return
    const handle = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setShowRoleMenu(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showRoleMenu])

  const { data: me } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetchWithAuth('/api/me').then(r => r.json()),
  })
  const { data: allMembers = [] } = useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: () => fetchWithAuth('/api/workspaces/members').then(r => r.json()),
  })
  const viewerRole = allMembers.find(m => m.userId === me?.id)?.role ?? null
  const canChangeRole = !isMobile && (viewerRole === 'owner' || (viewerRole === 'admin' && currentRole !== 'owner'))
  const allowedRoles: WorkspaceMemberDto['role'][] =
    viewerRole === 'owner' ? ['owner', 'admin', 'member', 'guest'] : ['admin', 'member', 'guest']

  const roleMutation = useMutation({
    mutationFn: (newRole: WorkspaceMemberDto['role']) =>
      fetchWithAuth(`/api/workspaces/members/${member.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json() as { error?: string }; throw e }
        return r.json() as Promise<{ userId: string; role: WorkspaceMemberDto['role'] }>
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
    },
  })

  const handleRoleChange = (newRole: WorkspaceMemberDto['role']) => {
    if (newRole === currentRole) { setShowRoleMenu(false); return }
    const prev = currentRole
    setCurrentRole(newRole)
    setShowRoleMenu(false)
    roleMutation.mutate(newRole, { onError: () => setCurrentRole(prev) })
  }
  // ---- /ロール変更 ----

  const rs = WS_ROLE_STYLE[currentRole]

  const { data: projects = [], isLoading } = useQuery<MemberProjectDto[]>({
    queryKey: ['member-projects', member.userId],
    queryFn: () =>
      fetchWithAuth(`/api/workspaces/members/${member.userId}/projects`).then(r => r.json()),
  })

  // アーカイブ済みは履歴の下部にまとめる（進行中の順序は維持したいので安定ソート）
  const sortedProjects = React.useMemo(
    () => [...projects].sort((a, b) => Number(a.archived) - Number(b.archived)),
    [projects],
  )

  const handleProjectClick = (p: MemberProjectDto) => {
    onProjectClick(p)
  }

  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight .22s cubic-bezier(.2,.7,.3,1)',
      }
    : {
        width: 420, flexShrink: 0,
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        minHeight: 0,
        boxShadow: 'var(--shadow-lg)',
        animation: 'projectPanelIn .2s cubic-bezier(.2,.7,.3,1)',
      }

  return (
    <aside style={containerStyle}>
      {/* Mobile header */}
      {isMobile && (
        <div style={{
          background: 'var(--card)', borderBottom: '1px solid var(--border)',
          padding: 'max(16px, env(safe-area-inset-top)) 16px 14px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button
              onClick={onClose}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={member.displayName} url={member.avatarUrl} size={52}/>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                {member.displayName}
              </div>
              {member.email && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-4)',
                    marginBottom: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.email}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: rs.c, background: rs.bg, padding: '2px 8px', borderRadius: 4 }}>
                  {WS_ROLE_LABEL[currentRole]}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-4)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="clock" size={11}/> {formatJoinedAt(member.joinedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PC header */}
      {!isMobile && (
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
            {member.email && (
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-4)',
                  marginBottom: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {member.email}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {canChangeRole ? (
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowRoleMenu(v => !v)}
                    disabled={roleMutation.isPending}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10.5, fontWeight: 700,
                      color: rs.c, background: rs.bg,
                      padding: '2px 6px 2px 8px', borderRadius: 4,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      opacity: roleMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {WS_ROLE_LABEL[currentRole]}
                    <Icon name="chevDown" size={9}/>
                  </button>
                  {showRoleMenu && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: 'var(--shadow-lg)',
                      zIndex: 100, overflow: 'hidden', minWidth: 110,
                    }}>
                      {allowedRoles.map(role => (
                        <button
                          key={role}
                          onClick={() => handleRoleChange(role)}
                          style={{
                            display: 'block', width: '100%',
                            padding: '7px 12px', border: 'none',
                            background: currentRole === role ? 'var(--card-2)' : 'transparent',
                            color: currentRole === role ? 'var(--text)' : 'var(--text-2)',
                            fontSize: 12.5, fontWeight: currentRole === role ? 600 : 500,
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { if (currentRole !== role) (e.currentTarget.style.background = 'var(--card-hover)') }}
                          onMouseLeave={e => { if (currentRole !== role) (e.currentTarget.style.background = 'transparent') }}
                        >
                          {WS_ROLE_LABEL[role]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: rs.c, background: rs.bg, padding: '2px 8px', borderRadius: 4 }}>
                  {WS_ROLE_LABEL[currentRole]}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-4)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
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
      )}

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--divider)',
        background: isMobile ? 'var(--card)' : undefined,
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, padding: isMobile ? '12px 20px' : '12px 16px',
          borderRight: '1px solid var(--divider)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontSize: isMobile ? 22 : 20, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.length}
          </span>
          <span style={{ fontSize: isMobile ? 12 : 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: isMobile ? 2 : 0 }}>
            <Icon name="folder" size={isMobile ? 12 : 11}/> 参加プロジェクト
          </span>
        </div>
        <div style={{ flex: 1, padding: isMobile ? '12px 20px' : '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: isMobile ? 22 : 20, fontWeight: 700, color: 'var(--text)' }}>
            {isLoading ? '—' : projects.filter(p => p.role === 'leader' || p.role === 'subleader').length}
          </span>
          <span style={{ fontSize: isMobile ? 12 : 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: isMobile ? 2 : 0 }}>
            <Icon name="users" size={isMobile ? 12 : 11}/> リーダー経験
          </span>
        </div>
      </div>

      {/* Project history */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isMobile ? '0' : '12px 16px',
        paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-4)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: isMobile ? '14px 16px 6px' : '0 0 4px',
        }}>
          プロジェクト履歴
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 0 : 10, marginTop: isMobile ? 0 : 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 10, padding: isMobile ? '14px 16px' : '10px 0', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ width: isMobile ? 38 : 32, height: isMobile ? 38 : 32, borderRadius: isMobile ? 10 : 8, background: 'var(--card-2)', flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ height: isMobile ? 13 : 12, width: isMobile ? '65%' : '70%', borderRadius: 4, background: 'var(--card-2)', marginBottom: isMobile ? 7 : 6 }}/>
                  <div style={{ height: isMobile ? 11 : 10, width: '40%', borderRadius: 4, background: 'var(--card-2)' }}/>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: isMobile ? 10 : 8, padding: isMobile ? '40px 16px' : '32px 0', color: 'var(--text-4)',
          }}>
            <Icon name="folder" size={isMobile ? 32 : 28}/>
            <span style={{ fontSize: isMobile ? 14 : 12.5 }}>参加プロジェクトはありません</span>
          </div>
        ) : (
          sortedProjects.map(p => (
            <ProjectRow
              key={p.projectId}
              project={p}
              onClick={() => handleProjectClick(p)}
              {...(isMobile ? { isMobile: true } : {})}
            />
          ))
        )}
      </div>
    </aside>
  )
}
