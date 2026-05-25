'use client'

import React from 'react'
import { Icon, Avatar } from '../primitives'
import { useWorkspaceMembers, useAddChannelMember } from '@/lib/chat/client'

interface ChannelMemberSheetProps {
  channelId: string
  onClose: () => void
}

export function ChannelMemberSheet({ channelId, onClose }: ChannelMemberSheetProps) {
  const { data: members = [] } = useWorkspaceMembers()
  const mutation = useAddChannelMember(channelId)
  // セッション中に追加済みのユーザーIDを追跡
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const handleAdd = (userId: string) => {
    if (addedIds.has(userId) || pendingId) return
    setPendingId(userId)
    mutation.mutate(userId, {
      onSuccess: () => {
        setAddedIds(prev => new Set([...prev, userId]))
        setPendingId(null)
      },
      onError: () => setPendingId(null),
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
        background: 'var(--card)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight: '80dvh',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="userPlus" size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>メンバーを招待</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>ワークスペースのメンバーを追加できます</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Icon name="close" size={15}/>
          </button>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {members.map(m => {
            const added = addedIds.has(m.userId)
            const loading = pendingId === m.userId
            return (
              <div key={m.userId} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 20px',
                borderBottom: '1px solid var(--divider)',
              }}>
                <Avatar name={m.displayName} size={38}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.displayName}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>
                    {m.role === 'owner' ? 'オーナー' : m.role === 'admin' ? '管理者' : m.role === 'guest' ? 'ゲスト' : 'メンバー'}
                  </div>
                </div>
                <button
                  onClick={() => handleAdd(m.userId)}
                  disabled={added || loading || !!pendingId}
                  style={{
                    height: 32, padding: '0 14px', borderRadius: 8,
                    border: added ? 'none' : '1px solid var(--border)',
                    background: added ? 'var(--accent-soft)' : 'var(--card-2)',
                    color: added ? 'var(--accent-text)' : 'var(--text-2)',
                    fontSize: 12.5, fontWeight: 600,
                    cursor: added || loading || !!pendingId ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                    flexShrink: 0, transition: 'background 0.15s',
                  }}
                >
                  {loading ? (
                    <span style={{ fontSize: 12 }}>…</span>
                  ) : added ? (
                    <><Icon name="check" size={12} color="var(--accent-text)"/> 追加済み</>
                  ) : (
                    <><Icon name="plus" size={12}/> 追加</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
