'use client'

import React from 'react'
import { Icon, Avatar } from '../primitives'
import { ChannelMemberSheet } from '../mobile/channel-member-sheet'

export interface ChatDetailSidebarProps {
  isProject: boolean
  isDm: boolean
  isPrivate: boolean
  channelName: string
  currentDmAvatarUrl: string | null | undefined
  channelMembers: { name: string; url: string | null }[]
  channelId: string | null
  showMemberInvite: boolean
  onInviteMember: () => void
  onCloseMemberInvite: () => void
}

export const ChatDetailSidebar = ({
  isProject, isDm, isPrivate, channelName,
  currentDmAvatarUrl, channelMembers,
  channelId, showMemberInvite, onInviteMember, onCloseMemberInvite,
}: ChatDetailSidebarProps) => (
  <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{isProject ? 'このプロジェクトについて' : isDm ? 'ダイレクトメッセージ' : 'このチャンネルについて'}</h3>
    </div>
    {isProject ? (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{channelName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>プロジェクトチャンネル</div>
      </div>
    ) : (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPrivate ? <Icon name="lock" size={14} color="var(--amber-text)"/> : <Icon name="hash" size={14} color="var(--text-3)"/>}
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{channelName}</span>
        </div>
        {isPrivate && (
          <>
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={12} color="var(--amber-text)"/>
              <span style={{ fontSize: 11.5, color: 'var(--amber-text)', fontWeight: 600 }}>招待されたメンバーのみが閲覧できます</span>
            </div>
            <button
              onClick={onInviteMember}
              style={{
                marginTop: 10, width: '100%', height: 34, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card-2)',
                color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="userPlus" size={13}/>
              メンバーを招待
            </button>
            {showMemberInvite && channelId && (
              <ChannelMemberSheet channelId={channelId} onClose={onCloseMemberInvite}/>
            )}
          </>
        )}
      </div>
    )}
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>ピン留め</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ピン留めはまだありません</div>
    </div>
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>メンバー</div>
      {channelMembers.slice(0, 6).map((m, i) => (
        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={m.name} url={m.url} size={24}/>
            <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < 3 ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m.name}</span>
        </div>
      ))}
    </div>
  </aside>
)
