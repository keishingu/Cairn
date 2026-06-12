'use client'

import React from 'react'
import { Icon, Avatar } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import {
  useProjectMembers,
  useWorkspaceMembersForInvite,
  useAddProjectMember,
  useRemoveProjectMember,
} from '@/hooks/use-project-members'

const ROLE_LABEL: Record<string, string> = {
  leader:    'リーダー',
  subleader: 'サブリーダー',
  member:    'メンバー',
  reviewer:  'レビュワー',
  observer:  'オブザーバー',
}

const ROLE_STYLE: { [key: string]: { c: string; bg: string } } = {
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
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
}

const MemberRow = ({ member, onRemove, removing, onMemberClick }: MemberRowProps) => {
  const style = ROLE_STYLE[member.role] ?? DEFAULT_ROLE_STYLE
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 4px', borderBottom: '1px solid var(--divider)',
      opacity: removing ? 0.4 : 1, transition: 'opacity 0.15s',
    }}>
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
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        color: style.c, background: style.bg,
        padding: '2px 7px', borderRadius: 4,
      }}>
        {ROLE_LABEL[member.role] ?? member.role}
      </span>
      <RowActionMenu
        actions={[
          { icon: 'trash', label: '削除', danger: true, onSelect: onRemove },
        ]}
      />
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
  selectedUserId: string
  selectedRole: string
  onSelectUser: (id: string) => void
  onSelectRole: (role: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
  error?: string | undefined
}

const InvitePanel = ({
  inviteable, isLoadingMembers,
  selectedUserId, selectedRole,
  onSelectUser, onSelectRole,
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
              const selected = selectedUserId === m.userId
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => onSelectUser(selected ? '' : m.userId)}
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
            {Object.entries(ROLE_LABEL).map(([val, label]) => {
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
        disabled={!selectedUserId || isLoading}
        style={{
          width: '100%', padding: '10px',
          borderRadius: 9, border: 'none',
          background: selectedUserId && !isLoading ? 'var(--accent)' : 'var(--card-2)',
          color: selectedUserId && !isLoading ? 'var(--on-accent)' : 'var(--text-4)',
          fontSize: 13.5, fontWeight: 700,
          cursor: selectedUserId && !isLoading ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit', transition: 'background 0.15s',
        }}
      >
        {isLoading ? '追加中…' : '追加する'}
      </button>
    </div>
  </div>
)

// ─── Main tab ─────────────────────────────────────────────────────

interface MembersTabProps {
  projectId: string
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
}

export const MembersTab = ({ projectId, onMemberClick }: MembersTabProps) => {
  const [showInvite, setShowInvite] = React.useState(false)
  const [selectedUserId, setSelectedUserId] = React.useState('')
  const [selectedRole, setSelectedRole] = React.useState('member')
  const [removeTarget, setRemoveTarget] = React.useState<ProjectMemberDto | null>(null)

  const { data: members = [], isLoading } = useProjectMembers(projectId)
  const { data: wsMembers = [], isLoading: isLoadingWs } = useWorkspaceMembersForInvite(showInvite)
  const addMutation = useAddProjectMember(projectId)
  const removeMutation = useRemoveProjectMember(projectId)

  const memberUserIds = new Set(members.map(m => m.userId))
  const inviteable = wsMembers.filter(m => !memberUserIds.has(m.userId))

  const closeInvite = () => {
    setShowInvite(false)
    setSelectedUserId('')
    setSelectedRole('member')
  }

  const handleConfirmInvite = () => {
    addMutation.mutate(
      { userId: selectedUserId, role: selectedRole },
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
            onMemberClick={onMemberClick}
          />
        ))}

        <button
          onClick={() => setShowInvite(true)}
          style={{
            marginTop: 12, width: '100%', padding: '10px',
            borderRadius: 8, border: '1px dashed var(--border-2)',
            background: 'transparent', color: 'var(--text-3)',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="plus" size={13}/> メンバーを招待
        </button>
      </div>

      {/* Invite panel — overlays within this tab only */}
      {showInvite && (
        <InvitePanel
          inviteable={inviteable}
          isLoadingMembers={isLoadingWs}
          selectedUserId={selectedUserId}
          selectedRole={selectedRole}
          onSelectUser={setSelectedUserId}
          onSelectRole={setSelectedRole}
          onConfirm={handleConfirmInvite}
          onClose={closeInvite}
          isLoading={addMutation.isPending}
          error={addMutation.error?.message}
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
