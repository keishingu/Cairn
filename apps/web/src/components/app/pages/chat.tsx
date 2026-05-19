'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import { MEMBERS } from '../data'

const CHANNELS = [
  { id: 'c1', name: '北アルプス縦走計画', unread: 5, project: true, online: 6 },
  { id: 'c2', name: '夏山合宿計画',       unread: 7, project: true, online: 4 },
  { id: 'c3', name: 'クライミング講習会', unread: 2, project: true, online: 2 },
  { id: 'c4', name: '雪山訓練',           unread: 0, project: true, online: 3 },
  { id: 'c5', name: '春山合宿',           unread: 0, project: true, online: 1 },
]
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

interface ChatMsg {
  n?: string; t?: string; x?: string
  f?: { name: string; size: string }
  r?: Array<{ e: string; c: number; me?: boolean }>
  divider?: string
  ai?: boolean
}

const CHAT_MSGS: ChatMsg[] = [
  { n: '山田 太郎', t: '5/20 18:30', x: '北アルプス縦走の計画書をアップしました。\n日程やルート、装備リストを確認して、意見をお願いします！', f: { name: '北アルプス縦走計画書_v1.pdf', size: '2.4MB' }, r: [{ e: '👍', c: 3, me: true }] },
  { n: '佐藤 花子', t: '5/20 19:15', x: '日程はこのままで大丈夫そうです！\n1日目のテント場はもう少し標高を下げた方が安全かも？', r: [{ e: '👍', c: 2 }] },
  { n: '鈴木 健',   t: '5/20 19:45', x: '装備リスト確認しました。ガス缶は予備も含めてもう1個ずつ追加した方が良いかと思います。', r: [{ e: '👍', c: 1 }] },
  { n: '山田 太郎', t: '5/20 20:10', x: 'ありがとうございます！\n計画書を更新して、明日のミーティングで審議に回します。' },
  { divider: '5月21日 (火)' },
  { n: '田中 陽子', t: '5/21 08:30', x: '最新版の計画書をアップしました！', f: { name: '北アルプス縦走計画書_v2.pdf', size: '2.7MB' }, r: [{ e: '👍', c: 2 }, { e: '🎉', c: 1 }] },
  { n: 'AIアシスタント', t: '5/21 08:32', ai: true, x: '計画書 v2 を確認しました。v1 から変更点: テント場の位置を 200m 下げ、ガス缶を +2 個追加。安全性が向上しています。' },
  { n: '佐藤 花子', t: '5/21 09:02', x: 'AIの分析ありがとうございます！この方針で進めましょう。', r: [{ e: '🙌', c: 3 }] },
]

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

const FullChatMessage = ({ m }: { m: ChatMsg }) => (
  <div style={{ display: 'flex', gap: 12, padding: '6px 24px', alignItems: 'flex-start' }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
  >
    {m.ai ? (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
        <Icon name="sparkles" size={18}/>
      </div>
    ) : (
      <Avatar name={m.n!} size={36}/>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{m.n}</span>
        {m.ai && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>APP</span>}
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{m.t}</span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{m.x}</div>
      {m.f && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360 }}>
          <div style={{ width: 34, height: 38, borderRadius: 4, background: 'var(--red-soft)', color: 'var(--red-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.f.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>PDF · {m.f.size}</div>
          </div>
          <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 6 }}><Icon name="download" size={14}/></button>
        </div>
      )}
      {m.r && m.r.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          {m.r.map((r, i) => (
            <button key={i} style={{
              height: 24, padding: '0 8px', borderRadius: 12,
              background: r.me ? 'var(--accent-soft)' : 'var(--card-2)',
              border: `1px solid ${r.me ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 11.5, fontWeight: 600,
              color: r.me ? 'var(--accent-text)' : 'var(--text-2)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{r.e} {r.c}</button>
          ))}
        </div>
      )}
    </div>
  </div>
)

export const PageChat = () => {
  const [channel, setChannel] = React.useState('c1')
  const [msgs, setMsgs] = React.useState(CHAT_MSGS)
  const [draft, setDraft] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs.length])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const d = new Date()
    setMsgs(prev => [...prev, { n: '山田 太郎', t: `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x: text }])
    setDraft('')
  }

  const cur = CHANNELS.find(c => c.id === channel) || GENERAL_CHANNELS.find(c => c.id === channel) || CHANNELS[0]!
  const isProject = !!(cur as typeof CHANNELS[0]).project
  const isPrivate = !!(cur as typeof GENERAL_CHANNELS[0]).private

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 240, background: 'var(--card-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>チャット</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
          <ChatSidebarSection title="プロジェクト">
            {CHANNELS.map(c => (
              <ChatSidebarItem key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}
                prefix="#" label={c.name} badge={c.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="チャンネル">
            {GENERAL_CHANNELS.map(c => (
              <ChatSidebarItem key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}
                prefix={c.private ? 'lock' : '#'} label={c.name} badge={c.unread}/>
            ))}
          </ChatSidebarSection>
          <ChatSidebarSection title="ダイレクトメッセージ">
            {DMS.map(d => (
              <ChatSidebarItem key={d.id} active={channel === d.id} onClick={() => setChannel(d.id)}
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
                {cur.name}
              </h2>
              {isProject && <StatusChip s="plan"/>}
              {isPrivate && (
                <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber-text)' }}>
                  <Icon name="lock" size={9}/> プライベート
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {isProject ? `8人参加 · ${cur.online}人オンライン` : isPrivate ? `${cur.online}人参加（招待制）` : `${cur.online}人参加 · ${cur.online}人オンライン`}
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
          {msgs.map((m, i) => m.divider ? (
            <div key={i} style={{ padding: '14px 24px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }}/>
              <span style={{ fontSize: 11.5, color: 'var(--text-4)', fontWeight: 600, padding: '2px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 999 }}>{m.divider}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--divider)' }}/>
            </div>
          ) : (
            <FullChatMessage key={i} m={m}/>
          ))}
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
                placeholder={`${isPrivate ? '🔒' : '#'} ${cur.name} にメッセージ送信`}
                rows={1}
                style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', minHeight: 22, maxHeight: 160 }}/>
              <button onClick={send} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: draft.trim() ? 'var(--accent)' : 'var(--border-2)', color: draft.trim() ? 'var(--on-accent)' : 'var(--text-4)', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}>
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
            <MountainPhoto idx={0} height={120} flat radius={8}/>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{cur.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>6/12 (水) ~ 6/16 (日) · 4泊5日</div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {isPrivate ? <Icon name="lock" size={14} color="var(--amber-text)"/> : <Icon name="hash" size={14} color="var(--text-3)"/>}
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{cur.name}</span>
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
          {isProject ? [
            { n: '北アルプス縦走計画書_v2.pdf', s: 'PDF · 2.7MB' },
            { n: 'ルートマップ.gpx', s: 'GPX · 45KB' },
          ].map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <Icon name="pin" size={12} color="var(--accent)"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.n}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{p.s}</div>
              </div>
            </div>
          )) : <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0' }}>ピン留めはまだありません</div>}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>メンバー ({cur.online}/{isProject ? 8 : cur.online} オンライン)</div>
          {MEMBERS.slice(0, Math.min(6, cur.online + 2)).map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={m} size={24}/>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: i < cur.online ? 'var(--accent)' : 'var(--text-4)', border: '2px solid var(--card)' }}/>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1 }}>{m}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
