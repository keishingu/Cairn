'use client'

import React from 'react'
import { Icon, Avatar } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import { RowActionMenu } from '../../row-action-menu'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { ProjectRoleDto } from '@/app/api/projects/roles/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import {
  useProjectMembers,
  useWorkspaceMembersForInvite,
  useCreateProjectGuestInvite,
  useRevokeWorkspaceInvite,
  useAddProjectMember,
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
} from '@/hooks/use-project-members'
import { useProjectRoles } from '@/hooks/use-project-roles'
import { useT } from '@/components/locale-provider'

// ─── Member row ───────────────────────────────────────────────────

interface MemberRowProps {
  member: ProjectMemberDto
  onRemove: () => void
  removing: boolean
  canRemove: boolean
  roles: ProjectRoleDto[]
  onChangeRole: (roleId: string) => Promise<unknown>
  changingRole: boolean
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
}

const MemberRow = ({
  member,
  onRemove,
  removing,
  canRemove,
  roles,
  onChangeRole,
  changingRole,
  onMemberClick,
}: MemberRowProps) => {
  const t = useT()
  const [editingRole, setEditingRole] = React.useState(false)
  const [selectedRoleId, setSelectedRoleId] = React.useState(member.roleId ?? '')
  const [roleError, setRoleError] = React.useState<string | null>(null)
  const saveRole = async () => {
    setRoleError(null)
    try {
      await onChangeRole(selectedRoleId)
      setEditingRole(false)
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : t('Could not change the role'))
    }
  }
  return (
    <div
      style={{
        borderBottom: '1px solid var(--divider)',
        opacity: removing ? 0.4 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
        <div
          title={member.email ?? undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
        >
          <Avatar name={member.displayName} url={member.avatarUrl} size={28} />
          <button
            onClick={() => onMemberClick?.(member.userId, member.displayName)}
            disabled={!onMemberClick}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text)',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              cursor: onMemberClick ? 'pointer' : 'default',
              fontFamily: 'inherit',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              if (onMemberClick) e.currentTarget.style.textDecoration = 'underline'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none'
            }}
          >
            {member.displayName}
          </button>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: member.roleColor }}>
          {member.roleName}
        </span>
        {canRemove && (
          <RowActionMenu
            actions={[
              { icon: 'edit', label: t('Change role'), onSelect: () => setEditingRole(true) },
              { icon: 'trash', label: t('Delete'), danger: true, onSelect: onRemove },
            ]}
          />
        )}
      </div>
      {editingRole && (
        <div style={{ padding: '0 4px 10px 42px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              aria-label={t('Role for {name}', { name: member.displayName })}
              name={`projectRole-${member.userId}`}
            value={selectedRoleId}
            onChange={(event) => setSelectedRoleId(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              height: 30,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--card)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost"
            style={{ height: 30, fontSize: 11.5 }}
            onClick={() => setEditingRole(false)}
          >
            {t('Cancel')}
          </button>
          <button
            className="btn btn-primary"
            style={{ height: 30, fontSize: 11.5 }}
            disabled={!selectedRoleId || changingRole}
            onClick={() => {
              void saveRole()
            }}
          >
            {changingRole ? t('Saving...') : t('Save')}
          </button>
          </div>
          {roleError && (
            <div role="alert" style={{ marginTop: 6, fontSize: 11.5, color: 'var(--red-text)' }}>
              {roleError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Invite panel (absolutely positioned within the tab) ──────────

const INVITE_CREATE_FAILED = 'invite-create-failed'

const WS_ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
}

interface InvitePanelProps {
  inviteable: WorkspaceMemberDto[]
  isLoadingMembers: boolean
  selectedUserIds: string[]
  roles: ProjectRoleDto[]
  selectedRoleId: string
  onToggleUser: (id: string) => void
  onSelectRole: (roleId: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
  error?: string | undefined
}

const InvitePanel = ({
  inviteable,
  isLoadingMembers,
  selectedUserIds,
  roles,
  selectedRoleId,
  onToggleUser,
  onSelectRole,
  onConfirm,
  onClose,
  isLoading,
  error,
}: InvitePanelProps) => {
  const t = useT()
  return (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 10,
      background: 'var(--card)',
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideUpSheet .18s cubic-bezier(.2,.7,.3,1)',
    }}
  >
    {/* Header */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 12px 10px',
        borderBottom: '1px solid var(--divider)',
        flexShrink: 0,
      }}
    >
      <button
        aria-label={t('Close add members')}
        onClick={onClose}
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          border: 'none',
          background: 'var(--card-2)',
          color: 'var(--text-3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="chevLeft" size={14} />
      </button>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{t('Add members')}</span>
    </div>

    {/* Scrollable content */}
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
      {isLoadingMembers ? (
        <div
          style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}
        >
          {t('Loading...')}
        </div>
      ) : inviteable.length === 0 ? (
        <div
          style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}
        >
          {t('No members available to add')}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-4)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {t('Workspace members')}
          </div>

          {/* Avatar list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 18 }}>
            {inviteable.map((m) => {
              const selected = selectedUserIds.includes(m.userId)
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => onToggleUser(m.userId)}
                  title={m.email ?? undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 9,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                    background: selected ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    transition: 'background .1s, border-color .1s',
                  }}
                >
                  {/* Selection indicator */}
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                      background: selected ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .1s',
                    }}
                  >
                    {selected && <Icon name="check" size={9} color="var(--on-accent)" />}
                  </div>

                  <Avatar name={m.displayName} url={m.avatarUrl} size={32} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: selected ? 'var(--accent-text)' : 'var(--text)',
                      }}
                    >
                      {m.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>
                      {t(WS_ROLE_LABEL[m.role] ?? m.role)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Role picker */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-4)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {t('Roles')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {roles.map((role) => {
              const sel = selectedRoleId === role.id
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => onSelectRole(role.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: `1.5px solid ${sel ? role.color : 'var(--border)'}`,
                    background: 'transparent',
                    color: sel ? role.color : 'var(--text-3)',
                    fontSize: 12,
                    fontWeight: sel ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'border-color .1s, color .1s',
                  }}
                >
                  {role.name}
                </button>
              )
            })}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 10, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>

    {/* Footer */}
    <div
      style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--divider)',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onConfirm}
        disabled={selectedUserIds.length === 0 || !selectedRoleId || isLoading}
        className="btn btn-primary btn-lg btn-block"
      >
        {isLoading ? t('Adding...') : t('Add {count} people', { count: selectedUserIds.length })}
      </button>
    </div>
  </div>
  )
}

// ─── Guest invite panel ───────────────────────────────────────────

interface GuestInvitePanelProps {
  projectId: string
  onClose: () => void
}

const GuestInvitePanel = ({ projectId, onClose }: GuestInvitePanelProps) => {
  const t = useT()
  const [url, setUrl] = React.useState<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [revoked, setRevoked] = React.useState(false)
  const createGuestInviteMutation = useCreateProjectGuestInvite(projectId)
  const revokeInviteMutation = useRevokeWorkspaceInvite()

  React.useEffect(() => {
    void createGuestInviteMutation.mutateAsync()
      .then((data) => {
        setUrl(data.url ?? null)
        setToken(data.token ?? null)
      })
      .catch((mutationError) => {
        setError(mutationError instanceof Error ? mutationError.message : INVITE_CREATE_FAILED)
      })
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
    try {
      await revokeInviteMutation.mutateAsync(token)
      setUrl(null)
      setToken(null)
      setRevoked(true)
    } catch {
      setError(t('Could not revoke the link'))
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
          aria-label={t('Close external guest invite')}
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
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{t('Invite an external guest')}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 12px' }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 16 }}>
          {t('Sharing this link lets the recipient join the workspace as a guest and adds them to this project.')}
        </p>

        {createGuestInviteMutation.isPending && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            {t('Creating link...')}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 0 }}>{error === INVITE_CREATE_FAILED ? t('Could not create the invite link') : error}</p>
        )}

        {revoked && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            {t('Invite link revoked')}
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
                {copied ? t('Copied') : t('Copy')}
              </button>
            </div>

            <p style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 12, lineHeight: 1.5 }}>
              {t('Expires in 30 days')}
            </p>

            <button
              onClick={() => { void handleRevoke() }}
              disabled={revokeInviteMutation.isPending}
              style={{
                marginTop: 20, width: '100%', padding: '9px',
                borderRadius: 8, border: '1px solid var(--red)',
                background: 'transparent',
                color: revokeInviteMutation.isPending ? 'var(--text-4)' : 'var(--red)',
                fontSize: 12.5, fontWeight: 600,
                cursor: revokeInviteMutation.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {revokeInviteMutation.isPending ? t('Revoking...') : t('Revoke this link')}
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
  const t = useT()
  const [showInvite, setShowInvite] = React.useState(false)
  const [showGuestInvite, setShowGuestInvite] = React.useState(false)
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([])
  const [selectedRoleId, setSelectedRoleId] = React.useState('')
  const [removeTarget, setRemoveTarget] = React.useState<ProjectMemberDto | null>(null)

  const { isMember: canManageMembers, isAdmin: canInviteGuest } = useWorkspacePermissions()

  const { data: members = [], isLoading } = useProjectMembers(projectId)
  const { data: roles = [], error: rolesError } = useProjectRoles()
  const { data: wsMembers = [], isLoading: isLoadingWs } = useWorkspaceMembersForInvite(showInvite)
  const addMutation = useAddProjectMember(projectId)
  const removeMutation = useRemoveProjectMember(projectId)
  const updateRoleMutation = useUpdateProjectMemberRole(projectId)

  React.useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles.find((role) => role.isDefault)?.id ?? roles[0]?.id ?? '')
    }
  }, [roles, selectedRoleId])

  const memberUserIds = new Set(members.map((m) => m.userId))
  const inviteable = wsMembers.filter((m) => !memberUserIds.has(m.userId))

  const closeInvite = () => {
    setShowInvite(false)
    setSelectedUserIds([])
    setSelectedRoleId(roles.find((role) => role.isDefault)?.id ?? roles[0]?.id ?? '')
  }

  const handleConfirmInvite = () => {
    addMutation.mutate(
      { userIds: selectedUserIds, roleId: selectedRoleId },
      { onSuccess: closeInvite },
    )
  }

  const groupedMembers = React.useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; color: string; sortOrder: number; members: ProjectMemberDto[] }
    >()
    for (const member of members) {
      const key = member.roleId ?? `legacy:${member.role}`
      const group = groups.get(key) ?? {
        id: key,
        name: member.roleName,
        color: member.roleColor,
        sortOrder: member.roleSortOrder,
        members: [],
      }
      group.members.push(member)
      groups.set(key, group)
    }
    return [...groups.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja'),
    )
  }, [members])

  return (
    // position: relative + overflow: hidden so InvitePanel can overlay within this area
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Scrollable main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
        {isLoading ? (
          <div
            style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}
          >
            {t('Loading...')}
          </div>
        ) : members.length === 0 ? (
          <div
            style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}
          >
            {t('No members yet')}
          </div>
        ) : (
          groupedMembers.map((group) => (
            <section key={group.id} style={{ marginBottom: 14 }}>
              <h3
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  margin: '0 0 4px',
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, borderRadius: '50%', background: group.color }}
                />
                {group.name}
                <span style={{ color: 'var(--text-4)', fontWeight: 500 }}>
                  {group.members.length}
                </span>
              </h3>
              {group.members.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  roles={roles}
                  onChangeRole={(roleId) =>
                    updateRoleMutation.mutateAsync({ userId: member.userId, roleId })
                  }
                  changingRole={
                    updateRoleMutation.isPending &&
                    updateRoleMutation.variables?.userId === member.userId
                  }
                  onRemove={() => setRemoveTarget(member)}
                  removing={removeMutation.isPending && removeMutation.variables === member.userId}
                  canRemove={canManageMembers}
                  onMemberClick={onMemberClick}
                />
              ))}
            </section>
          ))
        )}

        {rolesError && (
          <div role="alert" style={{ marginTop: 10, fontSize: 12, color: 'var(--red-text)' }}>
            {t('Could not load roles. Please reload.')}
          </div>
        )}

        <button
          onClick={() => setShowInvite(true)}
          disabled={!canManageMembers || roles.length === 0}
          title={!canManageMembers ? t('Adding members requires member access or higher') : roles.length === 0 ? t('Could not load roles') : undefined}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            border: '1px dashed var(--border-2)',
            background: 'transparent',
            color: 'var(--text-3)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: canManageMembers && roles.length > 0 ? 'pointer' : 'not-allowed',
            opacity: canManageMembers && roles.length > 0 ? 1 : 0.5,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Icon name="plus" size={13} /> {t('Invite members')}
        </button>

        {canInviteGuest && (
          <button
            onClick={() => setShowGuestInvite(true)}
            style={{
              marginTop: 6,
              width: '100%',
              padding: '10px',
              borderRadius: 8,
              border: '1px dashed var(--border-2)',
              background: 'transparent',
              color: 'var(--text-4)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icon name="link" size={13} /> {t('Invite an external guest')}
          </button>
        )}
      </div>

      {/* Invite panel — overlays within this tab only */}
      {showInvite && (
        <InvitePanel
          inviteable={inviteable}
          isLoadingMembers={isLoadingWs}
          selectedUserIds={selectedUserIds}
          roles={roles}
          selectedRoleId={selectedRoleId}
          onToggleUser={(userId) => {
            setSelectedUserIds((current) =>
              current.includes(userId)
                ? current.filter((id) => id !== userId)
                : [...current, userId],
            )
          }}
          onSelectRole={setSelectedRoleId}
          onConfirm={handleConfirmInvite}
          onClose={closeInvite}
          isLoading={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}

      {/* Guest invite panel — link sharing for external collaborators */}
      {showGuestInvite && (
        <GuestInvitePanel projectId={projectId} onClose={() => setShowGuestInvite(false)} />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={t('Remove member')}
        message={t('Remove "{name}" from this project?', { name: removeTarget?.displayName ?? '' })}
        onConfirm={async () => {
          if (removeTarget) await removeMutation.mutateAsync(removeTarget.userId)
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  )
}
