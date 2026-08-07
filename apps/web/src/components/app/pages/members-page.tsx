'use client'

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Icon, Avatar, Fab, ArchivedBadge, ARCHIVED_OPACITY } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { MemberDetailPanel } from '../detail-panel/member-panel'
import { ProjectPanel } from '../detail-panel/project-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import { MobileHeader } from '../mobile/header'
import { ConfirmDialog } from '../confirm-dialog'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useCurrentUser, useWorkspacePermissions } from '@/hooks/use-current-user'
import {
  useWorkspaceInvites,
  useCreateWorkspaceInvite,
  useRevokeWorkspaceInvite,
  type WorkspaceInviteDto,
} from '@/hooks/use-project-members'
import { useCommand } from '@/lib/command-registry'
import { toast } from '@/lib/toast'

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
  canManage?: boolean
  onArchiveToggle?: () => void
}

const MemberCard = ({ member, projectCount, selected, onClick, canManage, onArchiveToggle }: MemberCardProps) => {
  const role = ROLE_STYLE[member.role]
  const isArchived = member.membershipStatus === 'inactive'
  const [menuOpen, setMenuOpen] = React.useState(false)

  // カード外クリックでメニューを閉じる
  React.useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        position: 'relative',
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
      {/* 操作メニュー（admin のみ）。減光の影響を受けないようカード直下に置く */}
      {canManage && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <button
            aria-label="メンバー操作"
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="more" size={16} />
          </button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: 30, right: 0, minWidth: 160, padding: 4,
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: 'var(--shadow-lg)', zIndex: 10,
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); onArchiveToggle?.() }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none',
                  background: 'transparent', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Icon name={isArchived ? 'refresh' : 'archive'} size={13} />
                {isArchived ? 'アーカイブを解除' : 'アーカイブする'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ opacity: isArchived ? ARCHIVED_OPACITY : 1 }}>
        <div title={member.email ?? undefined} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <Avatar name={member.displayName} url={member.avatarUrl} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{member.displayName}</div>
            {member.email && (
              <div
                style={{
                  fontSize: 11.5,
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: role.c, background: role.bg, padding: '2px 8px', borderRadius: 4 }}>
                {ROLE_LABEL[member.role]}
              </span>
              {isArchived && <ArchivedBadge />}
            </div>
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
    </div>
  )
}

interface PageMembersProps {
  initialUserId?: string
  isMobile?: boolean
  externalSearch?: string
}

export const PageMembers = ({ initialUserId, isMobile, externalSearch }: PageMembersProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAdmin, isOwner } = useWorkspacePermissions()
  const canInvite = isAdmin
  const { data: currentUser } = useCurrentUser()
  const [search, setSearch] = React.useState('')
  const effectiveSearch = isMobile ? search : (externalSearch ?? search)
  const [roleFilter, setRoleFilter] = React.useState<WorkspaceMemberDto['role'] | 'all'>('all')
  const [showArchived, setShowArchived] = React.useState(false)
  const [archiveTarget, setArchiveTarget] = React.useState<WorkspaceMemberDto | null>(null)
  // ナビゲーション時の remount でパネルが一瞬消えないよう、キャッシュから初期値を復元する
  const [selectedMember, setSelectedMember] = React.useState<WorkspaceMemberDto | null>(() => {
    if (!initialUserId || isMobile) return null
    const cached = queryClient.getQueryData<WorkspaceMemberDto[]>(['workspace-members', 'all'])
    return cached?.find(m => m.userId === initialUserId) ?? null
  })
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)
  const [mobileDetailMember, setMobileDetailMember] = React.useState<WorkspaceMemberDto | null>(null)
  const [showInviteModal, setShowInviteModal] = React.useState(false)

  const handleProjectClick = (p: MemberProjectDto) => {
    setSelectedProject({
      id:                 p.projectId,
      title:              p.title,
      description:        null,
      statusName:         p.statusName,
      statusColor:        p.statusColor,
      startDate:          p.startDate,
      endDate:            p.endDate,
      memberCount:        p.memberCount,
      memberNames:        [],
      memberAvatarUrls:   [],
      taskCount:          0,
      completedTaskCount: 0,
      isOwner:            p.role === 'leader',
      isMember:           true,
      archived:           p.archived,
      coverPhotoIdx:      p.coverPhotoIdx,
      coverPhotoUrl:      null,
      location:           null,
      placeId:            null,
    })
  }

  const { data: members = [], isLoading } = useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members', 'all'],
    queryFn: () => fetchWithAuth('/api/workspaces/members?status=all').then(r => r.json()),
  })

  // ⌥S（検索フォーカス）は TopBarSearch（route ラッパー）が担当

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


  // アーカイブ（非活性化）/ 解除。成功時にメンバー一覧を再取得する。
  const archiveMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) => {
      const res = await fetchWithAuth(`/api/workspaces/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? '操作に失敗しました')
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success(variables.status === 'inactive' ? 'メンバーをアーカイブしました' : 'アーカイブを解除しました')
    },
  })

  // admin 以上のみ操作可。自分自身・owner（owner 以外の操作者）は対象外。
  const canManageMember = (m: WorkspaceMemberDto): boolean =>
    isAdmin && m.userId !== currentUser?.id && (m.role !== 'owner' || isOwner)

  const filtered = React.useMemo(() => {
    return members.filter(m => {
      const matchStatus = showArchived ? m.membershipStatus === 'inactive' : m.membershipStatus === 'active'
      const normalizedSearch = effectiveSearch.toLowerCase()
      const matchSearch =
        effectiveSearch === ''
        || m.displayName.toLowerCase().includes(normalizedSearch)
        || m.email?.toLowerCase().includes(normalizedSearch)
      const matchRole = roleFilter === 'all' || m.role === roleFilter
      return matchStatus && matchSearch && matchRole
    })
  }, [members, effectiveSearch, roleFilter, showArchived])

  const activeMembers = React.useMemo(() => members.filter(m => m.membershipStatus === 'active'), [members])
  const archivedCount = members.length - activeMembers.length

  const counts = React.useMemo(() => {
    const c = new Map<string, number>([['all', activeMembers.length]])
    for (const m of activeMembers) {
      c.set(m.role, (c.get(m.role) ?? 0) + 1)
    }
    return c
  }, [activeMembers])

  const roleFilters: { id: WorkspaceMemberDto['role'] | 'all'; label: string }[] = [
    { id: 'all',    label: `すべて (${counts.get('all') ?? 0})` },
    { id: 'owner',  label: 'オーナー' },
    { id: 'admin',  label: '管理者' },
    { id: 'member', label: `メンバー (${counts.get('member') ?? 0})` },
    { id: 'guest',  label: 'ゲスト' },
  ]

  // ⌥[ / ⌥]: ロールフィルタタブ切替
  const cycleRoleFilter = (dir: 'prev' | 'next') => {
    const idx = roleFilters.findIndex(f => f.id === roleFilter)
    const next = dir === 'next' ? (idx + 1) % roleFilters.length : (idx - 1 + roleFilters.length) % roleFilters.length
    setRoleFilter(roleFilters[next]!.id)
  }
  useCommand('ctx.filterTabPrev', () => cycleRoleFilter('prev'))
  useCommand('ctx.filterTabNext', () => cycleRoleFilter('next'))

  const willUnarchive = archiveTarget?.membershipStatus === 'inactive'
  const archiveDialog = (
    <ConfirmDialog
      open={archiveTarget !== null}
      title={willUnarchive ? 'アーカイブを解除' : 'メンバーをアーカイブ'}
      message={
        willUnarchive
          ? <><b>{archiveTarget?.displayName}</b> をアーカイブ解除します。ワークスペースへのアクセスが復帰し、一覧・候補にも再表示されます。</>
          : <><b>{archiveTarget?.displayName}</b> をアーカイブします。このワークスペースへのアクセスは失効し、メンバー一覧やメンション・担当などの候補から外れます。発言・写真・履歴は本人名義のまま残り、いつでも解除できます。</>
      }
      confirmLabel={willUnarchive ? 'アーカイブを解除' : 'アーカイブする'}
      busyLabel="処理中…"
      onConfirm={async () => {
        if (!archiveTarget) return
        await archiveMutation.mutateAsync({
          userId: archiveTarget.userId,
          status: willUnarchive ? 'active' : 'inactive',
        })
      }}
      onClose={() => setArchiveTarget(null)}
    />
  )

  if (isMobile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        {mobileDetailMember && (
          <MemberDetailPanel
            member={mobileDetailMember}
            onProjectClick={handleProjectClick}
            onClose={() => {
              setMobileDetailMember(null)
              router.push('/members', { scroll: false })
            }}
            isMobile
          />
        )}
        <MobileHeader title="メンバー" />
        {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} isMobile />}
        {archiveDialog}
        {canInvite && <Fab onClick={() => setShowInviteModal(true)} label="メンバーを招待"/>}

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}>
              <Icon name="search" size={14} />
            </div>
            <input
              data-member-search
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
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(v => !v)}
              style={{
                padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap',
                border: showArchived ? 'none' : '1px solid var(--border-2)',
                background: showArchived ? 'var(--text-3)' : 'transparent',
                color: showArchived ? 'var(--on-accent)' : 'var(--text-4)',
                fontSize: 12.5, fontWeight: showArchived ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >アーカイブ済み ({archivedCount})</button>
          )}
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
                  projectCount={m.projectCount}
                  selected={false}
                  canManage={canManageMember(m)}
                  onArchiveToggle={() => setArchiveTarget(m)}
                  onClick={() => {
                    setMobileDetailMember(m)
                    router.push(`/members/${m.userId}`, { scroll: false })
                  }}
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
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                title="アーカイブされたメンバー（アクセス失効）"
                style={{
                  marginLeft: 4, padding: '6px 12px', borderRadius: 6, border: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: showArchived ? 'var(--card-hover)' : 'transparent',
                  color: showArchived ? 'var(--text)' : 'var(--text-4)',
                  fontSize: 12.5, fontWeight: showArchived ? 600 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              ><Icon name="archive" size={12} /> アーカイブ済み ({archivedCount})</button>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowInviteModal(true)}
            disabled={!canInvite}
            title={canInvite ? undefined : 'メンバーの招待には管理者以上の権限が必要です'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', ...(canInvite ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
          >
            <Icon name="plus" size={13} strokeWidth={2.4} /> メンバーを招待
          </button>
          {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} isMobile={false} />}
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
                  projectCount={m.projectCount}
                  selected={selectedMember?.userId === m.userId}
                  canManage={canManageMember(m)}
                  onArchiveToggle={() => setArchiveTarget(m)}
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
      {archiveDialog}
    </div>
  )
}

type ExpiresIn = '1h' | '30d' | 'never'
const EXPIRES_OPTIONS: { value: ExpiresIn; label: string }[] = [
  { value: '1h', label: '1時間' },
  { value: '30d', label: '30日間' },
  { value: 'never', label: '無期限' },
]

const INVITE_ROLE_OPTIONS = [
  { value: 'member', label: 'メンバー', description: '通常メンバーとして参加' },
  { value: 'guest', label: 'ゲスト', description: '閲覧中心の外部参加向け' },
] as const
function InviteModal({ onClose, isMobile }: { onClose: () => void; isMobile: boolean }) {
  const [expiresIn, setExpiresIn] = React.useState<ExpiresIn>('1h')
  const [inviteRole, setInviteRole] = React.useState<'member' | 'guest'>('member')
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)
  const [generateError, setGenerateError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const { data: existingInvites = [] } = useWorkspaceInvites()
  const createInviteMutation = useCreateWorkspaceInvite()
  const revokeInviteMutation = useRevokeWorkspaceInvite()
  const generating = createInviteMutation.isPending

  async function generateLink() {
    setCopied(false)
    setGenerateError(null)
    try {
      const data = await createInviteMutation.mutateAsync({ expiresIn, role: inviteRole })
      setInviteUrl(data.url)
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : '招待リンクの生成に失敗しました')
    }
  }

  async function revokeInvite(token: string) {
    try {
      await revokeInviteMutation.mutateAsync(token)
      if (inviteUrl?.includes(token)) setInviteUrl(null)
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : '招待リンクの無効化に失敗しました')
    }
  }

  async function copyLink() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px',
        width: '100%',
        maxWidth: 400,
        boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.2))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>メンバーを招待</div>
          <button
            onClick={onClose}
            style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18 }}
          >×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>招待時の役割</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {INVITE_ROLE_OPTIONS.map(opt => {
                const selected = inviteRole === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={generating}
                    onClick={() => { setInviteRole(opt.value); setInviteUrl(null) }}
                    style={{
                      flex: 1,
                      padding: '9px 10px',
                      borderRadius: 10,
                      border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                      background: selected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg)',
                      color: selected ? 'var(--accent)' : 'var(--text-3)',
                      textAlign: 'left',
                      cursor: generating ? 'default' : 'pointer',
                      opacity: generating ? 0.7 : 1,
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: selected ? 700 : 600, marginBottom: 2 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.4, color: selected ? 'var(--accent)' : 'var(--text-4)' }}>
                      {opt.description}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>リンクの有効期限</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {EXPIRES_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setExpiresIn(opt.value); setInviteUrl(null) }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 8,
                    border: `1.5px solid ${expiresIn === opt.value ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: expiresIn === opt.value ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg)',
                    color: expiresIn === opt.value ? 'var(--accent)' : 'var(--text-3)',
                    fontSize: 13,
                    fontWeight: expiresIn === opt.value ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {!inviteUrl ? (
            <>
              {generateError && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
                  background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)',
                }}>
                  {generateError}
                </div>
              )}
              <button
                type="button"
                onClick={generateLink}
                disabled={createInviteMutation.isPending}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: createInviteMutation.isPending ? 'var(--border-2)' : 'var(--accent)',
                  color: createInviteMutation.isPending ? 'var(--text-4)' : 'var(--on-accent)',
                  fontSize: 14, fontWeight: 600,
                  cursor: createInviteMutation.isPending ? 'default' : 'pointer',
                  fontFamily: 'inherit',
              }}
            >
              {createInviteMutation.isPending ? '生成中...' : '招待リンクを生成'}
            </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', gap: 8, padding: '8px 10px',
                background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 8, alignItems: 'center',
              }}>
                <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inviteUrl}
                </div>
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: copied ? '#e6f7ee' : 'var(--accent)',
                    color: copied ? '#1a7a3c' : 'var(--on-accent)',
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {copied ? 'コピー済み ✓' : 'コピー'}
                </button>
              </div>

              {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>QRコードでも共有できます</div>
                  <div style={{ padding: 10, background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <QRCodeSVG value={inviteUrl} size={140} />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={generateLink}
                style={{
                  padding: '6px 0', borderRadius: 8, border: '1px solid var(--border-2)',
                  background: 'transparent', color: 'var(--text-3)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                別のリンクを生成
              </button>
            </div>
          )}

          {existingInvites.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>有効なリンク</div>
              {existingInvites.map((inv: WorkspaceInviteDto) => {
                const expiresLabel = inv.expiresAt
                  ? `${new Date(inv.expiresAt).toLocaleDateString('ja-JP')} まで`
                  : '無期限'
                const roleLabel = inv.role === 'guest' ? 'ゲスト' : 'メンバー'
                return (
                  <div
                    key={inv.token}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8,
                      background: 'var(--bg)', border: '1px solid var(--border-2)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.url}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                        {roleLabel} · {expiresLabel}{inv.maxUses != null ? ` · ${inv.useCount}/${inv.maxUses}回使用` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeInvite(inv.token)}
                      disabled={revokeInviteMutation.isPending && revokeInviteMutation.variables === inv.token}
                      style={{
                        flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--red)', background: 'transparent',
                        color: revokeInviteMutation.isPending && revokeInviteMutation.variables === inv.token ? 'var(--text-4)' : 'var(--red-text)',
                        fontSize: 11.5, fontWeight: 600, cursor: revokeInviteMutation.isPending && revokeInviteMutation.variables === inv.token ? 'default' : 'pointer',
                        fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}
                    >
                      {revokeInviteMutation.isPending && revokeInviteMutation.variables === inv.token ? '処理中...' : '無効化'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
