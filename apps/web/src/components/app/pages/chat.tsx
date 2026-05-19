'use client'

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, Avatar, AvatarStack, StatusChip } from '../primitives'
import { MEMBERS } from '../data'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

const GENERAL_CHANNELS = [
  { id: 'g1', name: '雑談',       unread: 3, online: 12, private: false },
  { id: 'g2', name: '連絡事項',   unread: 1, online: 8,  private: false },
  { id: 'g3', name: 'OB会',       unread: 0, online: 5,  private: false },
  { id: 'g4', name: 'コーチ専用', unread: 2, online: 3,  private: true },
  { id: 'g5', name: '部長会',     unread: 0, online: 4,  private: true },
]
const DMS = [
  { id: 'd1', name: '佐藤 花子', online: true,  unread: 0 },
  { id: 'd2', name: '鈴木 健',   online: true,  unread: 2 },
  { id: 'd3', name: '田中 陽子', online: false, unread: 0 },
  { id: 'd4', name: '伊藤 翔',   online: false, unread: 0 },
]

async function fetchProjectChannels(): Promise<ProjectChannelDto[]> {
  const res = await fetch('/api/projects/channels')
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました')
  return res.json()
}

async function fetchMessages(channelId: string): Promise<MessageDto[]> {
  const res = await fetch(`/api/channels/${channelId}/messages`)
  if (!res.ok) throw new Error('メッセージの取得に失敗しました')
  return res.json()
}

async function postMessage(channelId: string, content: string): Promise<MessageDto> {
  const res = await fetch(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('メッセージの送信に失敗しました')
  return res.json()
}

async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const res = await fetch(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  })
  if (!res.ok) throw new Error('リアクションの更新に失敗しました')
}

const ChatSidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '6px 10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{title}</span>
      <Icon name="plus" size={11} color="var(--text-4)"/>
    </div>
    <div>{children}</div>
  </div>
)

const ChatSidebarItem = ({ active, onClick, prefix, avatar, dot, label, badge }: {
  active?: boolean; onClick?: () => void; prefix?: string
  avatar?: string; dot?: string; label: string; badge?: number
}) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 10px', borderRadius: 6, border: 'none',
    background: active ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontSize: 13, fontWeight: badge && badge > 0 ? 600 : 500,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
  >
    {prefix === 'lock' ? (
      <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: 'var(--text-3)' }}>
        <Icon name="lock" size={12}/>
      </span>
    ) : prefix ? (
      <span style={{ fontSize: 13, color: 'var(--text-3)', width: 14, textAlign: 'center' }}>{prefix}</span>
    ) : null}
    {avatar && (
      <div style={{ position: 'relative' }}>
        <Avatar name={avatar} size={18}/>
        {dot && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: dot, border: '2px solid var(--card-2)' }}/>}
      </div>
    )}
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {badge != null && badge > 0 && (
      <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, minWidth: 18, textAlign: 'center' }}>{badge}</span>
    )}
  </button>
)

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const FullChatMessage = ({ m, onReact }: { m: MessageDto; onReact: (messageId: string, emoji: string) => void }) => (
  <div style={{ display: 'flex', gap: 12, padding: '6px 24px', alignItems: 'flex-start' }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
  >
    <Avatar name={m.senderName} size={36}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{m.senderName}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{formatTime(m.createdAt)}</span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{m.content}</div>
      {m.reactions.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
        </div>
      )}
    </div>
  </div>
)

export const PageChat = () => {
  const [channelId, setChannelId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: projectChannels = [] } = useQuery({
    queryKey: ['project-channels'],
    queryFn: fetchProjectChannels,
  })

  // Default to first project channel when data loads
  React.useEffect(() => {
    if (!channelId && projectChannels.length > 0) {
      setChannelId(projectChannels[0]!.channelId)
    }
  }, [channelId, projectChannels])

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => fetchMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 5000,
  })

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: (content: string) => postMessage(channelId!, content),
    onSuccess: (newMsg) => {
      queryClient.setQueryData<MessageDto[]>(['messages', channelId], prev => [...(prev ?? []), newMsg])
    },
  })

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => toggleReaction(messageId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })

  const send = () => {
    const text = draft.trim()
    if (!text || !channelId) return
    setDraft('')
    sendMutation.mutate(text)
  }

  const currentChannel = projectChannels.find(c => c.channelId === channelId)
  const currentGeneral = GENERAL_CHANNELS.find(c => c.id === channelId)
  const isProject = !!currentChannel
  const isPrivate = !!(currentGeneral?.private)
  const channelName = currentChannel?.projectTitle ?? currentGeneral?.name ?? ''

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
          <ChatSidebarSection title="プロジェクト">
            {projectChannels.map(c => (
              <ChatSidebarItem key={c.channelId} active={channelId === c.channelId} onClick={() => setChannelId(c.channelId)}
                prefix="#" label={c.projectTitle}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="チャンネル">
            {GENERAL_CHANNELS.map(c => (
              <ChatSidebarItem key={c.id} active={channelId === c.id} onClick={() => setChannelId(c.id)}
                prefix={c.private ? 'lock' : '#'} label={c.name} badge={c.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="ダイレクトメッセージ">
            {DMS.map(d => (
              <ChatSidebarItem key={d.id} active={channelId === d.id} onClick={() => setChannelId(d.id)}
                avatar={d.name} dot={d.online ? 'var(--accent)' : 'var(--text-4)'}
                label={d.name} badge={d.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="アプリ">
            <ChatSidebarItem prefix="✨" label="AIアシスタント"/>
          </ChatSidebarSection>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isPrivate ? <Icon name="lock" size={13} color="var(--text-3)"/> : <span style={{ color: 'var(--text-3)' }}>#</span>}
                {channelName}
              </h2>
              {isProject && <StatusChip s="plan"/>}
              {isPrivate && (
                <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber-text)' }}>
                  <Icon name="lock" size={9}/> プライベート
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {isProject ? '参加メンバー' : isPrivate ? '招待制' : '全体チャンネル'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AvatarStack names={MEMBERS} size={26} max={5}/>
            <button className="btn"><Icon name="search" size={13}/></button>
            <button className="btn"><Icon name="bell" size={13}/></button>
            <button className="btn"><Icon name="more" size={14}/></button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
          {messagesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>
              読み込み中...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>
              まだメッセージはありません。最初のメッセージを送ってみましょう！
            </div>
          ) : (
            messages.map((m) => (
              <FullChatMessage key={m.id} m={m} onReact={(messageId, emoji) => reactMutation.mutate({ messageId, emoji })}/>
            ))
          )}
        </div>

        <div style={{ padding: '8px 24px 18px', background: 'var(--bg)' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--divider)' }}>
              {[
                { i: 'paperclip', l: '添付' },
                { i: 'image',     l: '画像' },
                { i: 'sparkles',  l: '@AI', accent: true },
                { i: 'smile',     l: '絵文字' },
              ].map((b, j) => (
                <button key={j} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: 5, color: b.accent ? 'var(--accent)' : 'var(--text-3)', fontSize: 11.5, fontWeight: b.accent ? 600 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  <Icon name={b.i} size={13}/> {b.l}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px 12px' }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={channelName ? `${isPrivate ? '🔒' : '#'} ${channelName} にメッセージ送信` : 'メッセージを入力...'}
                rows={1}
                style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160 }}/>
              <button onClick={send} disabled={!draft.trim() || sendMutation.isPending} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: draft.trim() && !sendMutation.isPending ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() && !sendMutation.isPending ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() && !sendMutation.isPending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
                <Icon name="send" size={13}/>
              </button>
            </div>
          </div>
        </div>
      </main>

      <aside style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{isProject ? 'このプロジェクトについて' : 'このチャンネルについて'}</h3>
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
          {MEMBERS.slice(0, 6).map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={m} size={24}/>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < 3 ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
