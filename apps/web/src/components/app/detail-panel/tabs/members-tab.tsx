'use client'

import React from 'react'
import { Icon, Avatar } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import {
  useProjectMembers,
  useWorkspaceMembersForInvite,
  useAddProjectMember,
  useRemoveProjectMember,
} from '@/hooks/use-project-members'

const ROLE_LABEL: Record<ProjectMemberDto['role'], string> = {
  leader:    'リーダー',
  subleader: 'サブリーダー',
  member:    'メンバー',
  reviewer:  'レビュワー',
  observer:  'オブザーバー',
}

const ROLE_STYLE: Record<ProjectMemberDto['role'], { c: string; bg: string }> = {
  leader:    { c: 'var(--accent-text)',  bg: 'var(--accent-soft)' },
  subleader: { c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
  member:    { c: 'var(--text-3)',       bg: 'var(--card-2)' },
  reviewer:  { c: 'var(--text-2)',       bg: 'var(--card-2)' },
  observer:  { c: 'var(--text-4)',       bg: 'var(--card-2)' },
}

const DEFAULT_ROLE_STYLE = { c: 'var(--text-3)', bg: 'var(--card-2)' }

// ─── Member row ───────────────────────────────────────────────────

interface MemberRowProps {
  member: ProjectMemberDto
  onRemove: () => void
  removing: boolean
  canRemove: boolean
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
}

const MemberRow = ({ member, onRemove, removing, canRemove, onMemberClick }: MemberRowProps) => {
  const style = ROLE_STYLE[member.role] ?? DEFAULT_ROLE_STYLE
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 4px', borderBottom: '1px solid var(--divider)',
      opacity: removing ? 0.4 : 1, transition: 'opacity 0.15s',
    }}>
      <div title={member.email ?? undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <Avatar name={member.displayName} url={member.avatarUrl} size={28}/>
        <button
          onClick={() => onMemberClick?.(member.userId, member.displayName)}
          disabled={!onMemberClick}
          style={{
            flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)',
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            cursor: onMemberClick ? 'pointer' : 'default', fontFamily: 'inherit',
            textDecoration: 'none',
          }}
          onMouseEnter={e => { if (onMemberClick) e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
        >
          {member.displayName}
        </button>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        color: style.c, background: style.bg,
        padding: '2px 7px', borderRadius: 4,
      }}>
        {ROLE_LABEL[member.role] ?? member.role}
      </span>
      {canRemove && (
        <RowActionMenu
          actions={[
            { icon: 'trash', label: '削除', danger: true, onSelect: onRemove },
          ]}
        />
      )}
    </div>
  )
}

// ─── Invite panel (absolutely positioned within the tab) ──────────

const WS_ROLE_LABEL: Record<string, string> = {
  owner: 'オーナー', admin: '管理者', member: 'メンバー', guest: 'ゲスト',
}

interface InvitePanelProps {
  inviteable: WorkspaceMemberDto[]
  isLoadingMembers: boolean
  selectedUserIds: string[]
  selectedRole: string
  onToggleUser: (id: string) => void
  onSelectRole: (role: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
  error?: string | undefined
}

const InvitePanel = ({
  inviteable, isLoadingMembers,
  selectedUserIds, selectedRole,
  onToggleUser, onSelectRole,
  onConfirm, onClose,
  isLoading, error,
}: InvitePanelProps) => (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 10,
    background: 'var(--card)',
    display: 'flex', flexDirection: 'column',
    animation: 'slideUpSheet .18s cubic-bezier(.2,.7,.3,1)',
  }}>
    {/* Header */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 12px 10px',
      borderBottom: '1px solid var(--divider)',
      flexShrink: 0,
    }}>
      <button
        onClick={onClose}
        style={{
          width: 28, height: 28, borderRadius: 7,
          border: 'none', background: 'var(--card-2)',
          color: 'var(--text-3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="chevLeft" size={14}/>
      </button>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>メンバーを追加</span>
    </div>

    {/* Scrollable content */}
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
      {isLoadingMembers ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
          読み込み中…
        </div>
      ) : inviteable.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
          追加できるメンバーがいません
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            ワークスペースメンバー
          </div>

          {/* Avatar list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 18 }}>
            {inviteable.map(m => {
              const selected = selectedUserIds.includes(m.userId)
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => onToggleUser(m.userId)}
                  title={m.email ?? undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 9,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                    background: selected ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background .1s, border-color .1s',
                  }}
                >
                  {/* Selection indicator */}
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: selected ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .1s',
                  }}>
                    {selected && <Icon name="check" size={9} color="var(--on-accent)"/>}
                  </div>

                  <Avatar name={m.displayName} url={m.avatarUrl} size={32}/>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent-text)' : 'var(--text)' }}>
                      {m.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>
                      {WS_ROLE_LABEL[m.role] ?? m.role}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Role picker */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            役割
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.entries(ROLE_LABEL) as [ProjectMemberDto['role'], string][]).map(([val, label]) => {
              const rs = ROLE_STYLE[val] ?? DEFAULT_ROLE_STYLE
              const sel = selectedRole === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onSelectRole(val)}
                  style={{
                    padding: '5px 12px', borderRadius: 999,
                    border: `1.5px solid ${sel ? rs.c : 'var(--border)'}`,
                    background: sel ? rs.bg : 'transparent',
                    color: sel ? rs.c : 'var(--text-3)',
                    fontSize: 12, fontWeight: sel ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all .1s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 10, marginBottom: 0 }}>{error}</p>
          )}
        </>
      )}
    </div>

    {/* Footer */}
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid var(--divider)',
      flexShrink: 0,
    }}>
      <button
        onClick={onConfirm}
        disabled={selectedUserIds.length === 0 || isLoading}
        style={{
          width: '100%', padding: '10px',
          borderRadius: 9, border: 'none',
          background: selectedUserIds.length > 0 && !isLoading ? 'var(--accent)' : 'var(--card-2)',
          color: selectedUserIds.length > 0 && !isLoading ? 'var(--on-accent)' : 'var(--text-4)',
          fontSize: 13.5, fontWeight: 700,
          cursor: selectedUserIds.length > 0 && !isLoading ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit', transition: 'background 0.15s',
        }}
      >
        {isLoading ? '追加中…' : `${selectedUserIds.length}人を追加する`}
      </button>
    </div>
  </div>
)

// ─── Guest invite panel ───────────────────────────────────────────

interface GuestInvitePanelProps {
  projectId: string
  onClose: () => void
}

const GuestInvitePanel = ({ projectId, onClose }: GuestInvitePanelProps) => {
  const [url, setUrl] = React.useState<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [revoking, setRevoking] = React.useState(false)
  const [revoked, setRevoked] = React.useState(false)

  React.useEffect(() => {
    setIsLoading(true)
    fetchWithAuth(`/api/projects/${projectId}/guest-invite`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json() as { url?: string; token?: string; error?: string }
        if (!res.ok) {
          setError(data.error ?? '招待リンクの生成に失敗しました')
        } else {
          setUrl(data.url ?? null)
          setToken(data.token ?? null)
        }
      })
      .catch(() => setError('招待リンクの生成に失敗しました'))
      .finally(() => setIsLoading(false))
  }, [projectId])

  const handleCopy = () => {
    if (!url) return
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRevoke = async () => {
    if (!token) return
    setRevoking(true)
    try {
      const res = await fetchWithAuth(`/api/workspaces/invites/${token}`, { method: 'DELETE' })
      if (res.ok) {
        setUrl(null)
        setToken(null)
        setRevoked(true)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? '無効化に失敗しました')
      }
    } catch {
      setError('無効化に失敗しました')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'var(--card)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideUpSheet .18s cubic-bezier(.2,.7,.3,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 12px 10px',
        borderBottom: '1px solid var(--divider)',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 7,
            border: 'none', background: 'var(--card-2)',
            color: 'var(--text-3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="chevLeft" size={14}/>
        </button>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>外部ゲストを招待</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 12px' }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 16 }}>
          このリンクを共有すると、相手はゲストとしてワークスペースに参加し、このプロジェクトに自動で追加されます。
        </p>

        {isLoading && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            リンクを生成中…
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 0 }}>{error}</p>
        )}

        {revoked && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            招待リンクを無効化しました
          </div>
        )}

        {url && (
          <>
            <div style={{
              background: 'var(--card-2)', borderRadius: 8,
              border: '1px solid var(--border)', padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                flex: 1, fontSize: 12, color: 'var(--text-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}>
                {url}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 6,
                  border: 'none',
                  background: copied ? 'var(--green-soft)' : 'var(--accent)',
                  color: copied ? 'var(--green-text)' : 'var(--on-accent)',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                {copied ? 'コピー済み' : 'コピー'}
              </button>
            </div>

            <p style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 12, lineHeight: 1.5 }}>
              有効期限: 30日間
            </p>

            <button
              onClick={() => { void handleRevoke() }}
              disabled={revoking}
              style={{
                marginTop: 20, width: '100%', padding: '9px',
                borderRadius: 8, border: '1px solid var(--red)',
                background: 'transparent',
                color: revoking ? 'var(--text-4)' : 'var(--red)',
                fontSize: 12.5, fontWeight: 600,
                cursor: revoking ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {revoking ? '無効化中…' : 'このリンクを無効化'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────

interface MembersTabProps {
  projectId: string
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
}

export const MembersTab = ({ projectId, onMemberClick }: MembersTabProps) => {
  const [showInvite, setShowInvite] = React.useState(false)
  const [showGuestInvite, setShowGuestInvite] = React.useState(false)
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([])
  const [selectedRole, setSelectedRole] = React.useState('member')
  const [removeTarget, setRemoveTarget] = React.useState<ProjectMemberDto | null>(null)

  const { isMember: canManageMembers, isAdmin: canInviteGuest } = useWorkspacePermissions()

  const { data: members = [], isLoading } = useProjectMembers(projectId)
  const { data: wsMembers = [], isLoading: isLoadingWs } = useWorkspaceMembersForInvite(showInvite)
  const addMutation = useAddProjectMember(projectId)
  const removeMutation = useRemoveProjectMember(projectId)

  const memberUserIds = new Set(members.map(m => m.userId))
  const inviteable = wsMembers.filter(m => !memberUserIds.has(m.userId))

  const closeInvite = () => {
    setShowInvite(false)
    setSelectedUserIds([])
    setSelectedRole('member')
  }

  const handleConfirmInvite = () => {
    addMutation.mutate(
      { userIds: selectedUserIds, role: selectedRole },
      { onSuccess: closeInvite },
    )
  }

  return (
    // position: relative + overflow: hidden so InvitePanel can overlay within this area
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Scrollable main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
        {isLoading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            読み込み中…
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            まだメンバーがいません
          </div>
        ) : members.map(m => (
          <MemberRow
            key={m.userId}
            member={m}
            onRemove={() => setRemoveTarget(m)}
            removing={removeMutation.isPending && removeMutation.variables === m.userId}
            canRemove={canManageMembers}
            onMemberClick={onMemberClick}
          />
        ))}

        <button
          onClick={() => setShowInvite(true)}
          disabled={!canManageMembers}
          title={canManageMembers ? undefined : 'メンバーの追加にはメンバー以上の権限が必要です'}
          style={{
            marginTop: 12, width: '100%', padding: '10px',
            borderRadius: 8, border: '1px dashed var(--border-2)',
            background: 'transparent', color: 'var(--text-3)',
            fontSize: 12.5, fontWeight: 600,
            cursor: canManageMembers ? 'pointer' : 'not-allowed',
            opacity: canManageMembers ? 1 : 0.5,
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="plus" size={13}/> メンバーを招待
        </button>

        {canInviteGuest && (
          <button
            onClick={() => setShowGuestInvite(true)}
            style={{
              marginTop: 6, width: '100%', padding: '10px',
              borderRadius: 8, border: '1px dashed var(--border-2)',
              background: 'transparent', color: 'var(--text-4)',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="link" size={13}/> 外部ゲストを招待
          </button>
        )}
      </div>

      {/* Invite panel — overlays within this tab only */}
      {showInvite && (
        <InvitePanel
          inviteable={inviteable}
          isLoadingMembers={isLoadingWs}
          selectedUserIds={selectedUserIds}
          selectedRole={selectedRole}
          onToggleUser={(userId) => {
            setSelectedUserIds(current => current.includes(userId)
              ? current.filter(id => id !== userId)
              : [...current, userId])
          }}
          onSelectRole={setSelectedRole}
          onConfirm={handleConfirmInvite}
          onClose={closeInvite}
          isLoading={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}

      {/* Guest invite panel — link sharing for external collaborators */}
      {showGuestInvite && (
        <GuestInvitePanel
          projectId={projectId}
          onClose={() => setShowGuestInvite(false)}
        />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title="メンバーを削除"
        message={`「${removeTarget?.displayName}」をこのプロジェクトから削除しますか？`}
        onConfirm={async () => { if (removeTarget) await removeMutation.mutateAsync(removeTarget.userId) }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  )
}
