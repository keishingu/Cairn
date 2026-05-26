'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Icon, Avatar } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { MemberDetailPanel } from '../detail-panel/member-panel'
import { ProjectPanel } from '../detail-panel/project-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import { MobileHeader } from '../mobile/header'

const ROLE_LABEL: Record<WorkspaceMemberDto['role'], string> = {
  owner:  'オーナー',
  admin:  '管理者',
  member: 'メンバー',
  guest:  'ゲスト',
}

const ROLE_STYLE: Record<WorkspaceMemberDto['role'], { c: string; bg: string }> = {
  owner:  { c: 'var(--accent-text)',  bg: 'var(--accent-soft)' },
  admin:  { c: 'var(--violet-text)',  bg: 'var(--violet-soft)' },
  member: { c: 'var(--text-3)',       bg: 'var(--card-2)' },
  guest:  { c: 'var(--text-4)',       bg: 'var(--card-2)' },
}

function formatJoinedAt(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}年${d.getMonth() + 1}月参加`
}

const MemberCardSkeleton = () => (
  <div className="card" style={{ padding: '16px 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--card-2)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, width: '60%', borderRadius: 4, background: 'var(--card-2)', marginBottom: 8 }} />
        <div style={{ height: 11, width: '40%', borderRadius: 4, background: 'var(--card-2)' }} />
      </div>
    </div>
  </div>
)

interface MemberCardProps {
  member: WorkspaceMemberDto
  projectCount: number
  selected: boolean
  onClick: () => void
}

const MemberCard = ({ member, projectCount, selected, onClick }: MemberCardProps) => {
  const role = ROLE_STYLE[member.role]
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: '16px 18px', cursor: 'pointer', transition: 'box-shadow .12s, transform .12s',
        border: selected ? '1.5px solid var(--accent)' : undefined,
        background: selected ? 'var(--accent-soft)' : undefined,
      }}
      onMouseEnter={e => {
        if (!selected) {
          ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <Avatar name={member.displayName} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{member.displayName}</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: role.c, background: role.bg, padding: '2px 8px', borderRadius: 4 }}>
            {ROLE_LABEL[member.role]}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--text-3)', borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="folder" size={11} /> {projectCount} プロジェクト
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="clock" size={11} /> {formatJoinedAt(member.joinedAt)}
        </span>
      </div>
    </div>
  )
}

interface PageMembersProps {
  initialUserId?: string
  isMobile?: boolean
}

export const PageMembers = ({ initialUserId, isMobile }: PageMembersProps) => {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<WorkspaceMemberDto['role'] | 'all'>('all')
  const [selectedMember, setSelectedMember] = React.useState<WorkspaceMemberDto | null>(null)
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)
  const [mobileDetailMember, setMobileDetailMember] = React.useState<WorkspaceMemberDto | null>(null)

  const handleProjectClick = (p: MemberProjectDto) => {
    setSelectedProject({
      id:                 p.projectId,
      title:              p.title,
      statusName:         p.statusName,
      startDate:          p.startDate,
      endDate:            p.endDate,
      memberCount:        p.memberCount,
      memberNames:        [],
      taskCount:          0,
      completedTaskCount: 0,
      isOwner:            p.role === 'leader',
      isMember:           true,
      archived:           false,
      coverPhotoIdx:      p.coverPhotoIdx,
    })
  }

  const { data: members = [], isLoading } = useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: () => fetch('/api/workspaces/members').then(r => r.json()),
  })

  // PC: initialUserId が指定されている場合、メンバーデータ読み込み後に自動選択
  React.useEffect(() => {
    if (!initialUserId || isMobile || members.length === 0) return
    const m = members.find(m => m.userId === initialUserId)
    if (m) setSelectedMember(m)
  }, [initialUserId, isMobile, members])

  // モバイル: initialUserId からパネルを自動オープン
  React.useEffect(() => {
    if (!initialUserId || !isMobile || members.length === 0) return
    const m = members.find(m => m.userId === initialUserId)
    if (m) setMobileDetailMember(m)
  }, [initialUserId, isMobile, members])

  // モバイル: パネル開閉に合わせて URL を同期
  const hadMobileMemberOpenRef = React.useRef(false)
  React.useEffect(() => {
    if (!isMobile) return
    if (mobileDetailMember) {
      hadMobileMemberOpenRef.current = true
      window.history.replaceState(null, '', `/members/${mobileDetailMember.userId}`)
    } else if (hadMobileMemberOpenRef.current) {
      window.history.replaceState(null, '', '/members')
    }
  }, [isMobile, mobileDetailMember])

  const filtered = React.useMemo(() => {
    return members.filter(m => {
      const matchSearch = search === '' || m.displayName.includes(search)
      const matchRole = roleFilter === 'all' || m.role === roleFilter
      return matchSearch && matchRole
    })
  }, [members, search, roleFilter])

  const counts = React.useMemo(() => {
    const c = new Map<string, number>([['all', members.length]])
    for (const m of members) {
      c.set(m.role, (c.get(m.role) ?? 0) + 1)
    }
    return c
  }, [members])

  const roleFilters: { id: WorkspaceMemberDto['role'] | 'all'; label: string }[] = [
    { id: 'all',    label: `すべて (${counts.get('all') ?? 0})` },
    { id: 'owner',  label: 'オーナー' },
    { id: 'admin',  label: '管理者' },
    { id: 'member', label: `メンバー (${counts.get('member') ?? 0})` },
    { id: 'guest',  label: 'ゲスト' },
  ]

  if (isMobile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        {mobileDetailMember && (
          <MemberDetailPanel
            member={mobileDetailMember}
            onProjectClick={handleProjectClick}
            onClose={() => setMobileDetailMember(null)}
            isMobile
          />
        )}
        <MobileHeader title="メンバー" />

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}>
              <Icon name="search" size={14} />
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="メンバーを検索…"
              style={{
                width: '100%', height: 36, padding: '0 12px 0 32px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--card)', color: 'var(--text)', fontSize: 14,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Role filter chips */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
          {roleFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setRoleFilter(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 999, border: 'none', whiteSpace: 'nowrap',
                background: roleFilter === f.id ? 'var(--accent)' : 'var(--card-2)',
                color: roleFilter === f.id ? 'var(--on-accent)' : 'var(--text-3)',
                fontSize: 12.5, fontWeight: roleFilter === f.id ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* 2-column card grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => <MemberCardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 16px', color: 'var(--text-4)' }}>
              <Icon name="users" size={32} />
              <span style={{ fontSize: 14 }}>メンバーが見つかりません</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {filtered.map((m, i) => (
                <MemberCard
                  key={m.userId}
                  member={m}
                  projectCount={Math.max(1, 5 - i % 4)}
                  selected={false}
                  onClick={() => setMobileDetailMember(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* Left: list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}>
              <Icon name="search" size={14} />
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="メンバーを検索…"
              style={{
                width: '100%', maxWidth: 280, height: 34, padding: '0 12px 0 32px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--card)', color: 'var(--text)', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {roleFilters.map(f => (
              <button
                key={f.id}
                onClick={() => setRoleFilter(f.id)}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none',
                  background: roleFilter === f.id ? 'var(--card-hover)' : 'transparent',
                  color: roleFilter === f.id ? 'var(--text)' : 'var(--text-3)',
                  fontSize: 12.5, fontWeight: roleFilter === f.id ? 600 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{f.label}</button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <Icon name="plus" size={13} strokeWidth={2.4} /> メンバーを招待
          </button>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {Array.from({ length: 8 }).map((_, i) => <MemberCardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: 'var(--text-3)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)' }}>
                <Icon name="users" size={22} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>メンバーが見つかりません</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {filtered.map((m, i) => (
                <MemberCard
                  key={m.userId}
                  member={m}
                  projectCount={Math.max(1, 5 - i % 4)}
                  selected={selectedMember?.userId === m.userId}
                  onClick={() => {
                    if (selectedMember?.userId === m.userId) {
                      setSelectedMember(null)
                      router.push('/members')
                    } else {
                      setSelectedMember(m)
                      router.push(`/members/${m.userId}`)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail panel — project takes priority over member */}
      {selectedProject ? (
        <ProjectPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      ) : selectedMember ? (
        <MemberDetailPanel
          member={selectedMember}
          onProjectClick={handleProjectClick}
          onClose={() => { setSelectedMember(null); router.push('/members') }}
        />
      ) : null}
    </div>
  )
}
