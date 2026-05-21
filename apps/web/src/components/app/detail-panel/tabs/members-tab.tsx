'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar } from '../../primitives'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

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

interface MemberRowProps {
  member: ProjectMemberDto
  onRemove: () => void
  removing: boolean
}

const MemberRow = ({ member, onRemove, removing }: MemberRowProps) => {
  const style = ROLE_STYLE[member.role] ?? DEFAULT_ROLE_STYLE

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 4px', borderBottom: '1px solid var(--divider)',
      opacity: removing ? 0.4 : 1, transition: 'opacity 0.15s',
    }}>
      <Avatar name={member.displayName} size={28}/>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
        {member.displayName}
      </span>
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        color: style.c, background: style.bg,
        padding: '2px 7px', borderRadius: 4,
      }}>
        {ROLE_LABEL[member.role] ?? member.role}
      </span>
      <button
        onClick={onRemove}
        disabled={removing}
        title="削除"
        style={{
          width: 24, height: 24, borderRadius: 5,
          border: 'none', background: 'transparent',
          color: 'var(--text-4)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="close" size={11}/>
      </button>
    </div>
  )
}

interface InviteModalProps {
  inviteable: WorkspaceMemberDto[]
  selectedUserId: string
  selectedRole: string
  onSelectUser: (id: string) => void
  onSelectRole: (role: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
  error?: string | undefined
}

const InviteModal = ({
  inviteable, selectedUserId, selectedRole,
  onSelectUser, onSelectRole, onConfirm, onClose,
  isLoading, error,
}: InviteModalProps) => (
  <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)',
      }}
    />
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
      background: 'var(--card)',
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>メンバーを追加</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
          <Icon name="close" size={16}/>
        </button>
      </div>

      {inviteable.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
          追加できるメンバーがいません
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)' }}>メンバーを選択</label>
            <select
              value={selectedUserId}
              onChange={e => onSelectUser(e.target.value)}
              style={{
                width: '100%', padding: '9px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card-2)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">選択してください</option>
              {inviteable.map(m => (
                <option key={m.userId} value={m.userId}>{m.displayName}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)' }}>役割</label>
            <select
              value={selectedRole}
              onChange={e => onSelectRole(e.target.value)}
              style={{
                width: '100%', padding: '9px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card-2)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', cursor: 'pointer',
              }}
            >
              {Object.entries(ROLE_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>
          )}

          <button
            onClick={onConfirm}
            disabled={!selectedUserId || isLoading}
            style={{
              width: '100%', padding: '11px',
              borderRadius: 10, border: 'none',
              background: selectedUserId && !isLoading ? 'var(--accent)' : 'var(--card-2)',
              color: selectedUserId && !isLoading ? 'var(--on-accent)' : 'var(--text-4)',
              fontSize: 13.5, fontWeight: 700,
              cursor: selectedUserId && !isLoading ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}
          >
            {isLoading ? '追加中…' : '追加する'}
          </button>
        </>
      )}
    </div>
  </>
)

interface MembersTabProps {
  projectId: string
}

export const MembersTab = ({ projectId }: MembersTabProps) => {
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<'attending' | 'tentative'>('attending')
  const [showInvite, setShowInvite] = React.useState(false)
  const [selectedUserId, setSelectedUserId] = React.useState('')
  const [selectedRole, setSelectedRole] = React.useState('member')

  const { data: members = [], isLoading } = useQuery<ProjectMemberDto[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => fetch(`/api/projects/${projectId}/members`).then(r => r.json()),
  })

  const { data: wsMembers = [] } = useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: () => fetch('/api/workspaces/members').then(r => r.json()),
    enabled: showInvite,
  })

  const attending = members.filter(m => m.attendance === 'attending')
  const tentative  = members.filter(m => m.attendance === 'tentative')
  const list = tab === 'attending' ? attending : tentative

  const memberUserIds = new Set(members.map(m => m.userId))
  const inviteable = wsMembers.filter(m => !memberUserIds.has(m.userId))

  const addMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed')
      }
      return res.json() as Promise<ProjectMemberDto>
    },
    onSuccess: (newMember) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => [...(old ?? []), newMember],
      )
      setShowInvite(false)
      setSelectedUserId('')
      setSelectedRole('member')
      setTab('attending')
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ProjectMemberDto[]>(
        ['project-members', projectId],
        old => old?.filter(m => m.userId !== userId) ?? [],
      )
    },
  })

  const closeInvite = () => {
    setShowInvite(false)
    setSelectedUserId('')
    setSelectedRole('member')
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => setTab('attending')}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 7,
            border: `1px solid ${tab === 'attending' ? 'var(--accent)' : 'var(--border)'}`,
            background: tab === 'attending' ? 'var(--accent-soft)' : 'transparent',
            color: tab === 'attending' ? 'var(--accent-text)' : 'var(--text-3)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          参加中 ({attending.length})
        </button>
        <button
          onClick={() => setTab('tentative')}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 7,
            border: `1px solid ${tab === 'tentative' ? 'var(--amber)' : 'var(--border)'}`,
            background: tab === 'tentative' ? 'var(--amber-soft)' : 'transparent',
            color: tab === 'tentative' ? 'var(--amber-text)' : 'var(--text-3)',
            fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          未確定 ({tentative.length})
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
          読み込み中…
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
          {tab === 'attending' ? 'まだメンバーがいません' : '未確定メンバーはいません'}
        </div>
      ) : list.map(m => (
        <MemberRow
          key={m.userId}
          member={m}
          onRemove={() => removeMutation.mutate(m.userId)}
          removing={removeMutation.isPending && removeMutation.variables === m.userId}
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

      {showInvite && (
        <InviteModal
          inviteable={inviteable}
          selectedUserId={selectedUserId}
          selectedRole={selectedRole}
          onSelectUser={setSelectedUserId}
          onSelectRole={setSelectedRole}
          onConfirm={() => addMutation.mutate({ userId: selectedUserId, role: selectedRole })}
          onClose={closeInvite}
          isLoading={addMutation.isPending}
          error={addMutation.error?.message}
        />
      )}
    </div>
  )
}
