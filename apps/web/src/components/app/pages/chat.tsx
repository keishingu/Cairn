'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { EmojiPicker } from '../emoji-picker'
import { MobileHeader } from '../detail-panel/mobile-header'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import {
  formatChatMessageTime,
  useChannelMessages,
  useProjectChannels,
  useWorkspaceChannels,
  useWorkspaceMembers,
  useWorkspaceDms,
  useCreateDm,
  useSendChannelMessage,
  useToggleMessageReaction,
} from '@/lib/chat/client'
import { isImeConfirmingEnter } from '@/lib/chat/ime'

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
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{label}</span>
    </div>
    {badge != null && badge > 0 && (
      <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: mobile ? 12 : 10, fontWeight: 700, padding: mobile ? '2px 8px' : '1px 6px', borderRadius: 999, minWidth: 20, textAlign: 'center' }}>{badge}</span>
    )}
    {mobile && <Icon name="chevRight" size={16} color="var(--text-4)"/>}
  </button>
)

// ─── Message ──────────────────────────────────────────────────────

const FullChatMessage = ({ m, onReact }: { m: MessageDto; onReact: (messageId: string, emoji: string) => void }) => {
  const [showPicker, setShowPicker] = React.useState(false)
  const addBtnRef = React.useRef<HTMLButtonElement>(null)

  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 16px', alignItems: 'flex-start' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <Avatar name={m.senderName} size={36}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{m.senderName}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{formatChatMessageTime(m.createdAt)}</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{m.content}</div>
        {m.reactions.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {m.reactions.map((r, i) => (
              <button key={i} onClick={() => onReact(m.id, r.emoji)} style={{
                height: 24, padding: '0 8px', borderRadius: 12,
                background: r.mine ? 'var(--accent-soft)' : 'var(--card-2)',
                border: `1px solid ${r.mine ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 11.5, fontWeight: 600,
                color: r.mine ? 'var(--accent-text)' : 'var(--text-2)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{r.emoji} {r.count}</button>
            ))}
            <button ref={addBtnRef} onClick={() => setShowPicker(p => !p)} style={{
              width: 24, height: 24, borderRadius: 12,
              background: 'var(--card-2)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>+</button>
            {showPicker && (
              <EmojiPicker anchorRef={addBtnRef} onSelect={(emoji) => onReact(m.id, emoji)} onClose={() => setShowPicker(false)}/>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────

const ChatInput = ({ channelName, isPrivate, draft, setDraft, sendError, setSendError, isComposing, setIsComposing, send, isPending, mobile }: {
  channelName: string; isPrivate: boolean; draft: string; setDraft: (v: string) => void
  sendError: string | null; setSendError: (v: string | null) => void
  isComposing: boolean; setIsComposing: (v: boolean) => void
  send: () => void; isPending: boolean; mobile?: boolean
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const emojiPickerBtnRef = React.useRef<HTMLButtonElement>(null)

  return (
    <div style={{
      padding: mobile ? '8px 12px' : '8px 24px 18px',
      paddingBottom: mobile ? 'calc(8px + env(safe-area-inset-bottom))' : undefined,
      background: 'var(--bg)',
    }}>
      {sendError && (
        <div style={{ marginBottom: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red-text)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {sendError}</span>
          <button onClick={() => setSendError(null)} style={{ border: 'none', background: 'transparent', color: 'var(--red-text)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={{ background: 'var(--card)', border: `1px solid ${sendError ? 'var(--red)' : 'var(--border-2)'}`, borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {!mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
            {[{ i: 'paperclip', l: '添付' }, { i: 'image', l: '画像' }, { i: 'sparkles', l: '@AI', accent: true }].map((b, j) => (
              <button key={j} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: (b as {accent?: boolean}).accent ? 'var(--accent)' : 'var(--text-3)', fontSize: 11.5, fontWeight: (b as {accent?: boolean}).accent ? 600 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Icon name={b.i} size={13}/> {b.l}
              </button>
            ))}
            <button ref={emojiPickerBtnRef} onClick={() => setShowEmojiPicker(p => !p)} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              <Icon name="smile" size={13}/> 絵文字
            </button>
            {showEmojiPicker && <EmojiPicker anchorRef={emojiPickerBtnRef} onSelect={e => { setDraft(draft + e); setShowEmojiPicker(false) }} onClose={() => setShowEmojiPicker(false)}/>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: mobile ? '10px 12px' : '10px 14px 12px' }}>
          {mobile && (
            <>
              <button onClick={() => setShowEmojiPicker(p => !p)} ref={emojiPickerBtnRef} style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="smile" size={20}/>
              </button>
              {showEmojiPicker && <EmojiPicker anchorRef={emojiPickerBtnRef} onSelect={e => { setDraft(draft + e); setShowEmojiPicker(false) }} onClose={() => setShowEmojiPicker(false)}/>}
            </>
          )}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (isImeConfirmingEnter(e, isComposing)) return
              e.preventDefault()
              send()
            }}
            placeholder={channelName ? `${isPrivate ? '🔒' : '#'} ${channelName} にメッセージ送信` : 'メッセージを入力...'}
            rows={1}
            style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: mobile ? 15 : 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160 }}
          />
          <button onClick={send} disabled={!draft.trim() || isPending} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: draft.trim() && !isPending ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() && !isPending ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() && !isPending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s', flexShrink: 0 }}>
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PageChat ─────────────────────────────────────────────────────

export const PageChat = ({ isMobile = false }: { isMobile?: boolean }) => {
  const [channelId, setChannelId] = React.useState<string | null>(null)
  const [activePane, setActivePane] = React.useState<'list' | 'thread'>('list')
  const [draft, setDraft] = React.useState('')
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [isComposing, setIsComposing] = React.useState(false)
  const pendingDraftRef = React.useRef('')
  const scrollRef = React.useRef<HTMLDivElement>(null)

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

  const { data: messages = [], isLoading: messagesLoading } = useChannelMessages(channelId)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const sendMutation = useSendChannelMessage(channelId)
  const reactMutation = useToggleMessageReaction(channelId)

  React.useEffect(() => {
    if (!sendMutation.isError) return
    setSendError(sendMutation.error.message)
    setDraft(pendingDraftRef.current)
  }, [sendMutation.error, sendMutation.isError])

  React.useEffect(() => {
    if (sendMutation.isSuccess) setSendError(null)
  }, [sendMutation.isSuccess])

  const send = () => {
    const text = draft.trim()
    if (!text || !channelId) return
    pendingDraftRef.current = text
    setSendError(null)
    setDraft('')
    sendMutation.mutate(text)
  }

  const selectChannel = (id: string) => {
    setChannelId(id)
    if (isMobile) setActivePane('thread')
  }

  const startDm = (targetUserId: string) => {
    setShowMemberPicker(false)
    createDmMutation.mutate(targetUserId, {
      onSuccess: (data) => { selectChannel(data.id) },
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

  const inputProps = { channelName, isPrivate, draft, setDraft, sendError, setSendError, isComposing, setIsComposing, send, isPending: sendMutation.isPending }

  // ─── Sidebar (チャンネル一覧) ───────────────────────────────────
  const sidebarContent = (
    <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 0' : '8px 6px' }}>
      <ChatSidebarSection title="プロジェクト">
        {projectChannels.map(c => (
          <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => selectChannel(c.channelId)}
            prefix="#" label={c.projectTitle} mobile={isMobile}/>
        ))}
      </ChatSidebarSection>
      <ChatSidebarSection title="チャンネル">
        {workspaceChannels.map(c => (
          <ChatSidebarItem key={c.id} active={channelId === c.id} onClick={() => selectChannel(c.id)}
            prefix={c.isPrivate ? 'lock' : '#'} label={c.name ?? ''} mobile={isMobile}/>
        ))}
      </ChatSidebarSection>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>ダイレクトメッセージ</span>
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
        </div>
        <div>
          {dms.map(d => (
            <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => selectChannel(d.id)}
              avatar={d.participantName} label={d.participantName} mobile={isMobile}/>
          ))}
        </div>
      </div>
      <ChatSidebarSection title="アプリ">
        <ChatSidebarItem prefix="✨" label="AIアシスタント" mobile={isMobile}/>
      </ChatSidebarSection>
    </div>
  )

  // ─── Thread ────────────────────────────────────────────────────
  const threadContent = (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
        {messagesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>読み込み中...</div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>まだメッセージはありません。最初のメッセージを送ってみましょう！</div>
        ) : (
          messages.map(m => <FullChatMessage key={m.id} m={m} onReact={(messageId, emoji) => reactMutation.mutate({ messageId, emoji })}/>)
        )}
      </div>
      <ChatInput {...inputProps} mobile={isMobile}/>
    </>
  )

  // ─── モバイルレイアウト ────────────────────────────────────────
  if (isMobile) {
    if (activePane === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
          <MobileHeader title="チャット"/>
          {sidebarContent}
        </div>
      )
    }

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
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
        {threadContent}
      </div>
    )
  }

  // ─── PC レイアウト（3カラム）──────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* サイドバー */}
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
        </div>
        {sidebarContent}
      </aside>

      {/* スレッド */}
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
        {threadContent}
      </main>

      {/* Detail Panel */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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
