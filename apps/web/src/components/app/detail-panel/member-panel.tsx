'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar, StatusChip, ArchivedBadge, ARCHIVED_OPACITY } from '../primitives'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import type { CurrentUserDto } from '@/app/api/me/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import { ProfileAttributeBadges } from '../profile-attribute-badges'
import {
  useProfileAttributes,
  useUpdateMemberProfileAttributes,
} from '@/hooks/use-profile-attributes'

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
  const canEditAttributes =
    member.membershipStatus === 'active' && (viewerRole === 'owner' || viewerRole === 'admin')
  // ゲスト↔通常ロールは API が拒否するため UI からも除外する（PC / モバイル共通）
  const canChangeRole =
    currentRole !== 'guest' &&
    (viewerRole === 'owner' || (viewerRole === 'admin' && currentRole !== 'owner'))
  const allowedRoles: WorkspaceMemberDto['role'][] =
    viewerRole === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member']
  // 唯一の active owner を降格すると API が 422 になるため、選択肢から外す
  const activeOwnerCount = allMembers.filter(
    m => m.role === 'owner' && m.membershipStatus === 'active',
  ).length
  const selectableRoles =
    currentRole === 'owner' && activeOwnerCount <= 1
      ? allowedRoles.filter(role => role === 'owner')
      : allowedRoles

  const roleMutation = useMutation({
    mutationFn: (newRole: WorkspaceMemberDto['role']) =>
      fetchWithAuth(`/api/workspaces/members/${member.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      }).then(async r => {
        if (!r.ok) {
          const e = await r.json() as { error?: string }
          throw new Error(e.error ?? 'ロールの変更に失敗しました')
        }
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
    roleMutation.mutate(newRole, {
      onError: (err) => {
        setCurrentRole(prev)
        toast.error(err instanceof Error ? err.message : 'ロールの変更に失敗しました')
      },
    })
  }
  // ---- /ロール変更 ----

  const [profileAttributes, setProfileAttributes] = React.useState(member.profileAttributes)
  const [draftAttributeIds, setDraftAttributeIds] = React.useState(
    member.profileAttributes.map(attribute => attribute.id),
  )
  const [attributeError, setAttributeError] = React.useState<string | null>(null)
  const [editingAttributes, setEditingAttributes] = React.useState(false)
  React.useEffect(() => {
    setProfileAttributes(member.profileAttributes)
    setDraftAttributeIds(member.profileAttributes.map(attribute => attribute.id))
    setEditingAttributes(false)
  }, [member.userId, member.profileAttributes])

  const {
    data: attributeOptions = [],
    isLoading: attributeOptionsLoading,
    error: attributeOptionsError,
  } = useProfileAttributes(editingAttributes)

  const attributeMutation = useUpdateMemberProfileAttributes(member.userId)

  const toggleAttribute = (attributeId: string) => {
    setDraftAttributeIds(current =>
      current.includes(attributeId)
        ? current.filter(id => id !== attributeId)
        : [...current, attributeId],
    )
    setAttributeError(null)
  }

  const handleSaveAttributes = () => {
    attributeMutation.mutate(draftAttributeIds, {
      onSuccess: attributes => {
        setProfileAttributes(attributes)
        setDraftAttributeIds(attributes.map(attribute => attribute.id))
        setEditingAttributes(false)
        setAttributeError(null)
        toast.success('属性を保存しました')
      },
      onError: error => setAttributeError(
        error instanceof Error ? error.message : '属性の保存に失敗しました',
      ),
    })
  }

  const rs = WS_ROLE_STYLE[currentRole]

  const roleBadge = canChangeRole ? (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setShowRoleMenu(v => !v)}
        disabled={roleMutation.isPending}
        aria-haspopup="listbox"
        aria-expanded={showRoleMenu}
        aria-label="ワークスペース権限を変更"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: isMobile ? 11 : 10.5, fontWeight: 700,
          color: rs.c, background: rs.bg,
          padding: isMobile ? '2px 6px 2px 8px' : '2px 6px 2px 8px', borderRadius: 4,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          opacity: roleMutation.isPending ? 0.6 : 1,
        }}
      >
        {WS_ROLE_LABEL[currentRole]}
        <Icon name="chevDown" size={isMobile ? 10 : 9}/>
      </button>
      {showRoleMenu && (
        <div
          role="listbox"
          aria-label="ワークスペース権限"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-lg)',
            zIndex: 100, overflow: 'hidden', minWidth: isMobile ? 128 : 110,
          }}
        >
          {selectableRoles.map(role => (
            <button
              key={role}
              type="button"
              role="option"
              aria-selected={currentRole === role}
              onClick={() => handleRoleChange(role)}
              style={{
                display: 'block', width: '100%',
                padding: isMobile ? '10px 14px' : '7px 12px', border: 'none',
                background: currentRole === role ? 'var(--card-2)' : 'transparent',
                color: currentRole === role ? 'var(--text)' : 'var(--text-2)',
                fontSize: isMobile ? 14 : 12.5, fontWeight: currentRole === role ? 600 : 500,
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
    <span style={{ fontSize: isMobile ? 11 : 10.5, fontWeight: 700, color: rs.c, background: rs.bg, padding: '2px 8px', borderRadius: 4 }}>
      {WS_ROLE_LABEL[currentRole]}
    </span>
  )

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
          <div title={member.email ?? undefined} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                {roleBadge}
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
        <div
          title={member.email ?? undefined}
          style={{
          padding: '16px 16px 14px',
          borderBottom: '1px solid var(--divider)',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
          }}
        >
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
              {roleBadge}
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

      <div style={{ padding: isMobile ? '12px 16px' : '10px 16px', borderBottom: '1px solid var(--divider)', background: isMobile ? 'var(--card)' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: profileAttributes.length > 0 || editingAttributes ? 8 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.06em' }}>属性</span>
          {canEditAttributes && !editingAttributes && (
            <button
              type="button"
              onClick={() => { setDraftAttributeIds(profileAttributes.map(attribute => attribute.id)); setEditingAttributes(true); setAttributeError(null) }}
              style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
            >
              編集
            </button>
          )}
        </div>
        {editingAttributes ? (
          <div>
            {attributeOptionsLoading ? (
              <div style={{ color: 'var(--text-4)', fontSize: 12 }}>読み込み中…</div>
            ) : attributeOptionsError ? (
              <div role="alert" style={{ color: 'var(--red-text)', fontSize: 11.5 }}>属性一覧を取得できませんでした</div>
            ) : attributeOptions.length === 0 ? (
              <div style={{ color: 'var(--text-4)', fontSize: 12 }}>設定画面で属性を作成してください。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {attributeOptions.map(attribute => {
                  const checked = draftAttributeIds.includes(attribute.id)
                  const disabled = !checked && draftAttributeIds.length >= 5
                  return (
                    <label
                      key={attribute.id}
                      style={{
                        minHeight: 36,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px',
                        borderRadius: 6,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleAttribute(attribute.id)}
                      />
                      <ProfileAttributeBadges attributes={[attribute]} />
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ marginTop: 6, color: 'var(--text-4)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{draftAttributeIds.length}/5件</div>
            {attributeError && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 11.5, marginTop: 6 }}>{attributeError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => { setDraftAttributeIds(profileAttributes.map(attribute => attribute.id)); setEditingAttributes(false); setAttributeError(null) }}
                className="btn btn-ghost"
                style={{ height: 30, padding: '0 10px', fontSize: 12 }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveAttributes}
                disabled={attributeMutation.isPending || attributeOptionsLoading || !!attributeOptionsError}
                className="btn btn-primary"
                style={{ height: 30, padding: '0 12px', fontSize: 12 }}
              >
                {attributeMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : profileAttributes.length > 0 ? (
          <ProfileAttributeBadges attributes={profileAttributes} />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>未設定</span>
        )}
      </div>

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
