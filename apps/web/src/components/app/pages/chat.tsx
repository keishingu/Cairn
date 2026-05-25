'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { MobileHeader } from '../mobile/header'
import { ChatThread } from '../chat-thread'
import {
  useProjectChannels,
  useWorkspaceChannels,
  useWorkspaceMembers,
  useWorkspaceDms,
  useCreateDm,
} from '@/lib/chat/client'

// ─── Sidebar ─────────────────────────────────────────────────────

const ChatSidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <Icon name="plus" size={11} color="var(--text-4)"/>
    </div>
    <div>{children}</div>
  </div>
)

const ChatSidebarItem = ({ active, onClick, prefix, avatar, dot, label, badge, mobile }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; dot?: string; label: string; badge?: number; mobile?: boolean
}) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: mobile ? '11px 16px' : '6px 10px',
    borderRadius: mobile ? 0 : 6,
    borderBottom: mobile ? '1px solid var(--divider)' : 'none',
    border: mobile ? undefined : 'none',
    background: active && !mobile ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontSize: mobile ? 15 : 13,
    fontWeight: badge && badge > 0 ? 600 : 500,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  }}
    onMouseEnter={e => { if (!active && !mobile) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
    onMouseLeave={e => { if (!active && !mobile) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
  >
    {prefix === 'lock' ? (
      <span style={{ width: mobile ? 36 : 14, height: mobile ? 36 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: mobile ? 8 : undefined, background: mobile ? 'var(--card-2)' : undefined, color: 'var(--text-3)' }}>
        <Icon name="lock" size={mobile ? 18 : 12}/>
      </span>
    ) : prefix ? (
      mobile ? (
        <span style={{ width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 18 }}>{prefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-3)', width: 14, textAlign: 'center' }}>{prefix}</span>
      )
    ) : null}
    {avatar && (
      <div style={{ position: 'relative' }}>
        <Avatar name={avatar} size={mobile ? 36 : 18}/>
        {dot && <span style={{ position: 'absolute', bottom: -1, right: -1, width: mobile ? 10 : 6, height: mobile ? 10 : 6, borderRadius: '50%', background: dot, border: `2px solid var(--${mobile ? 'bg' : 'card-2'})` }}/>}
      </div>
    )}
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {badge != null && badge > 0 && (
      <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: mobile ? 12 : 10, fontWeight: 700, padding: mobile ? '2px 8px' : '1px 6px', borderRadius: 999, minWidth: 20, textAlign: 'center' }}>{badge}</span>
    )}
    {mobile && <Icon name="chevRight" size={16} color="var(--text-4)"/>}
  </button>
)

// ─── PageChat ─────────────────────────────────────────────────────

export const PageChat = ({ isMobile = false }: { isMobile?: boolean }) => {
  const [channelId, setChannelId] = React.useState<string | null>(null)
  const [activePane, setActivePane] = React.useState<'list' | 'thread'>('list')
  const [showMemberPicker, setShowMemberPicker] = React.useState(false)
  const memberPickerRef = React.useRef<HTMLDivElement>(null)

  const { data: projectChannels = [] } = useProjectChannels()
  const { data: workspaceChannels = [] } = useWorkspaceChannels()
  const { data: members = [] } = useWorkspaceMembers()
  const { data: dms = [] } = useWorkspaceDms()
  const createDmMutation = useCreateDm()

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberPickerRef.current && !memberPickerRef.current.contains(e.target as Node)) {
        setShowMemberPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  React.useEffect(() => {
    if (!channelId && projectChannels.length > 0 && !isMobile) {
      setChannelId(projectChannels[0]!.channelId)
    }
  }, [channelId, projectChannels, isMobile])

  const selectChannel = (id: string) => {
    setChannelId(id)
    if (isMobile) setActivePane('thread')
  }

  const startDm = (targetUserId: string) => {
    setShowMemberPicker(false)
    createDmMutation.mutate(targetUserId, {
      onSuccess: (data) => selectChannel(data.id),
    })
  }

  const currentChannel = projectChannels.find(c => c.channelId === channelId)
  const currentGeneral = workspaceChannels.find(c => c.id === channelId)
  const currentDm = dms.find(d => d.id === channelId)
  const isProject = !!currentChannel
  const isPrivate = !!(currentGeneral?.isPrivate)
  const isDm = !!currentDm
  const channelName = currentChannel?.projectTitle ?? currentGeneral?.name ?? currentDm?.participantName ?? ''
  const memberNames = members.map(m => m.displayName)

  // ─── DM メンバーピッカー ────────────────────────────────────────
  const dmPicker = (
    <div style={{ position: 'relative' }} ref={memberPickerRef}>
      <button onClick={() => setShowMemberPicker(p => !p)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 2, lineHeight: 1 }}>
        <Icon name="plus" size={11} color="var(--text-4)"/>
      </button>
      {showMemberPicker && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
          {members.map(m => (
            <button key={m.userId} onClick={() => startDm(m.userId)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Avatar name={m.displayName} size={20}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{m.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ─── チャンネル一覧 ────────────────────────────────────────────
  const channelList = (
    <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
      <ChatSidebarSection title="プロジェクト">
        {projectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => selectChannel(c.channelId)} prefix="#" label={c.projectTitle} mobile={isMobile}/>
        ))}
      </ChatSidebarSection>
      <ChatSidebarSection title="チャンネル">
        {workspaceChannels.map(c => (
          <ChatSidebarItem key={c.id} active={channelId === c.id} onClick={() => selectChannel(c.id)} prefix={c.isPrivate ? 'lock' : '#'} label={c.name ?? ''} mobile={isMobile}/>
        ))}
      </ChatSidebarSection>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>ダイレクトメッセージ</span>
          {dmPicker}
        </div>
        <div>
          {dms.map(d => (
            <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => selectChannel(d.id)} avatar={d.participantName} label={d.participantName} mobile={isMobile}/>
          ))}
        </div>
      </div>
      <ChatSidebarSection title="アプリ">
        <ChatSidebarItem prefix="✨" label="AIアシスタント" mobile={isMobile}/>
      </ChatSidebarSection>
    </div>
  )

  // ─── モバイル ─────────────────────────────────────────────────
  if (isMobile) {
    if (activePane === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
          <MobileHeader title="チャット"/>
          {channelList}
        </div>
      )
    }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <MobileHeader
          title={channelName}
          onBack={() => setActivePane('list')}
          right={
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn"><Icon name="search" size={16}/></button>
              <button className="btn"><Icon name="more" size={17}/></button>
            </div>
          }
        />
        <ChatThread channelId={channelId} channelName={channelName} isPrivate={isPrivate}/>
      </div>
    )
  }

  // ─── PC（3カラム）─────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
        </div>
        {channelList}
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isDm ? <Avatar name={channelName} size={20}/> : isPrivate ? <Icon name="lock" size={13} color="var(--text-3)"/> : <span style={{ color: 'var(--text-3)' }}>#</span>}
                {channelName}
              </h2>
              {isProject && <StatusChip s="plan"/>}
              {isPrivate && <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber-text)' }}><Icon name="lock" size={9}/> プライベート</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {isProject ? '参加メンバー' : isDm ? 'ダイレクトメッセージ' : isPrivate ? '招待制' : '全体チャンネル'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AvatarStack names={memberNames} size={26} max={5}/>
            <button className="btn"><Icon name="search" size={13}/></button>
            <button className="btn"><Icon name="bell" size={13}/></button>
            <button className="btn"><Icon name="more" size={14}/></button>
          </div>
        </div>
        <ChatThread channelId={channelId} channelName={channelName} isPrivate={isPrivate}/>
      </main>

      <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
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
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="lock" size={12} color="var(--amber-text)"/>
                <span style={{ fontSize: 11.5, color: 'var(--amber-text)', fontWeight: 600 }}>招待されたメンバーのみが閲覧できます</span>
              </div>
            )}
          </div>
        )}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>ピン留め</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ピン留めはまだありません</div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>メンバー</div>
          {members.slice(0, 6).map((m, i) => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={m.displayName} size={24}/>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < 3 ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m.displayName}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
