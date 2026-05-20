'use client'

import React from 'react'
import { Icon, Avatar, AvatarStack, StatusChip, MountainPhoto } from './primitives'
import { MEMBERS } from './data'
import type { ProjectDto } from '@/app/api/projects/route'
import {
  findProjectChannelById,
  useProjectChannels,
} from '@/lib/chat/client'
import { ChatThread } from './chat-thread'

export const ChatTabContent = ({ project }: { project: ProjectDto }) => {
  const { data: projectChannels, isLoading, isError } = useProjectChannels()

  const activeChannel = React.useMemo(
    () => projectChannels ? findProjectChannelById(projectChannels, project.id) : undefined,
    [projectChannels, project.id],
  )

  if (isLoading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>読み込み中...</div>
  }
  if (isError) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red-text)', fontSize: 13 }}>チャンネルの取得に失敗しました</div>
  }
  if (!activeChannel) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>チャンネルが見つかりません</div>
  }

  return (
    <>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}># {activeChannel.projectTitle}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
          <Icon name="users" size={13}/> {project.memberCount}
        </span>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="search" size={14}/></button>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="more" size={14}/></button>
      </div>
      <ChatThread
        channelId={activeChannel.channelId}
        channelName={activeChannel.projectTitle}
        compact={true}
      />
    </>
  )
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  const fmt = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  return end && end !== start ? `${fmt(start)} ~ ${fmt(end)}` : fmt(start)
}

export const OverviewTab = ({ project }: { project: ProjectDto }) => (
  <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>日程</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{formatDateRange(project.startDate, project.endDate)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{project.memberCount}人参加</div>
      </div>
      <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>ステータス</div>
        <StatusChip s={project.statusName}/>
      </div>
    </div>
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>サマリー</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
        北アルプス・上高地から槍ヶ岳〜穂高連峰の縦走。8名参加、リーダーは山田。装備リスト最終化と緊急連絡網の整備が次のアクション。
      </div>
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, padding: '0 2px' }}>マイルストーン</div>
      {[
        { d: '5/30', n: '計画書 v2 審議', done: true },
        { d: '6/2',  n: '装備チェック', done: true },
        { d: '6/5',  n: '緊急連絡先確認', done: false },
        { d: '6/12', n: '出発', done: false },
      ].map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${m.done ? 'var(--accent)' : 'var(--border-2)'}`, background: m.done ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
            {m.done && <Icon name="check" size={10} strokeWidth={3}/>}
          </div>
          <span style={{ fontSize: 12.5, color: m.done ? 'var(--text-3)' : 'var(--text)', textDecoration: m.done ? 'line-through' : 'none', flex: 1 }}>{m.n}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.d}</span>
        </div>
      ))}
    </div>
  </div>
)

export const FilesTab = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
    {[
      { name: '北アルプス縦走計画書_v2.pdf', size: '2.7MB · 5/21 08:30', kind: 'PDF', latest: true },
      { name: '北アルプス縦走計画書_v1.pdf', size: '2.4MB · 5/20 18:30', kind: 'PDF' },
      { name: '装備リスト.xlsx',             size: '18KB · 5/20 18:30',  kind: 'XLS' },
      { name: 'ルートマップ.gpx',            size: '45KB · 5/20 18:30',  kind: 'GPX' },
      { name: '緊急連絡先リスト.pdf',         size: '120KB · 5/19 22:10', kind: 'PDF' },
    ].map((f, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--divider)', borderRadius: 6, cursor: 'pointer' }}>
        <div style={{
          width: 32, height: 36, borderRadius: 4, flexShrink: 0,
          background: f.kind === 'PDF' ? 'var(--red-soft)' : f.kind === 'XLS' ? 'var(--emerald-soft)' : 'var(--blue-soft)',
          color: f.kind === 'PDF' ? 'var(--red-text)' : f.kind === 'XLS' ? 'var(--emerald-text)' : 'var(--blue-text)',
          fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{f.kind}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {f.name}
            {f.latest && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)' }}>最新</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.size}</div>
        </div>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="more" size={14}/></button>
      </div>
    ))}
  </div>
)

export const TasksTab = () => {
  const tasks = [
    { d: '6/5',  t: '計画書を最新版に更新する', p: '高', done: false, a: '山田' },
    { d: '6/6',  t: '装備リストを確定する',     p: '中', done: false, a: '佐藤' },
    { d: '6/8',  t: 'テント場を予約する',       p: '中', done: false, a: '鈴木' },
    { d: '6/10', t: '予備日程を検討する',       p: '低', done: false, a: '田中' },
    { d: '5/18', t: 'ルート案を作成する',       p: '',   done: true,  a: '山田' },
    { d: '5/18', t: 'メンバーの参加可否確認',   p: '',   done: true,  a: '佐藤' },
  ]
  const pmap: Record<string, string> = { '高': 'var(--red)', '中': 'var(--amber)', '低': 'var(--text-3)' }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '4px 0 6px', letterSpacing: '0.04em' }}>未完了</div>
      {tasks.filter(t => !t.done).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)' }}/>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{t.t}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: pmap[t.p], padding: '2px 6px', borderRadius: 4, background: 'var(--card-2)' }}>{t.p}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.d}</span>
          <Avatar name={t.a} size={20}/>
        </div>
      ))}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '14px 0 6px', letterSpacing: '0.04em' }}>完了</div>
      {tasks.filter(t => t.done).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
            <Icon name="check" size={10} strokeWidth={3}/>
          </div>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'line-through' }}>{t.t}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.d}</span>
          <Avatar name={t.a} size={20}/>
        </div>
      ))}
    </div>
  )
}

export const MembersTab = () => {
  const list = [
    { n: '山田 太郎', r: 'リーダー',   c: 'var(--accent-text)', bg: 'var(--accent-soft)' },
    { n: '佐藤 花子', r: 'サブリーダー', c: 'var(--violet-text)', bg: 'var(--violet-soft)' },
    { n: '鈴木 健',   r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '田中 陽子', r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '伊藤 翔',   r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '高橋 美咲', r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '中村 拓也', r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
    { n: '小林 大地', r: 'メンバー',   c: 'var(--text-3)', bg: 'var(--card-2)' },
  ]
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>参加中 (8)</button>
        <button style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>未確定 (2)</button>
      </div>
      {list.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--divider)' }}>
          <Avatar name={m.n} size={28}/>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.n}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: m.c, background: m.bg, padding: '2px 7px', borderRadius: 4 }}>{m.r}</span>
        </div>
      ))}
      <button style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="plus" size={13}/> メンバーを招待
      </button>
    </div>
  )
}

const PanelGalleryTab = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '1/1', borderRadius: 4, overflow: 'hidden', cursor: 'pointer' }}>
          <MountainPhoto idx={i + 3} height={130} flat radius={4}/>
        </div>
      ))}
    </div>
  </div>
)

const PanelAITab = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <Icon name="sparkles" size={14}/>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: 'var(--card-2)', borderRadius: 10, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          このプロジェクトの装備リストを要約しました。テント・ガス缶・行動食の3カテゴリーで32点。<br/>不足の可能性: 予備ガス缶（推奨+2個）。
        </div>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>提案</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['天候による予備日程を提案', 'ルート上の山小屋を一覧化', '緊急時の下山ルートを抽出'].map((s, i) => (
          <button key={i} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontSize: 11.5, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
        ))}
      </div>
    </div>
    <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
        <input placeholder="AIに質問…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}/>
        <button style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrowUp" size={12}/>
        </button>
      </div>
    </div>
  </div>
)

const PanelSettingsTab = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ padding: '20px 16px', borderRadius: 12, background: 'var(--card-2)', border: '1px dashed var(--border-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
        <Icon name="settings" size={18}/>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-2)' }}>設定は準備中です</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 280 }}>プロジェクト固有の通知・公開範囲・アーカイブなどの設定をここで行えるようになります。</div>
    </div>
    <div className="card" style={{ borderRadius: 10, overflow: 'hidden' }}>
      {[
        { i: 'bell', l: '通知設定', s: 'メンション・更新・リマインド' },
        { i: 'users', l: '公開範囲', s: 'メンバー・閲覧権限' },
        { i: 'sparkles', l: 'AIアシスタント', s: '自動要約・提案の動作' },
        { i: 'file', l: 'エクスポート', s: 'PDF / Markdown' },
        { i: 'close', l: 'アーカイブ', s: 'プロジェクトを保管する' },
      ].map((r, i, arr) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none', opacity: 0.7 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0 }}>
            <Icon name={r.i} size={13}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{r.l}</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{r.s}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', padding: '2px 6px', borderRadius: 4, background: 'var(--card-2)', border: '1px solid var(--border)' }}>準備中</span>
        </div>
      ))}
    </div>
  </div>
)

// ─── Project Panel ─────────────────────────────────────────────────
interface ProjectPanelProps {
  project: ProjectDto
  onClose: () => void
}

export const ProjectPanel = ({ project, onClose }: ProjectPanelProps) => {
  const [tab, setTab] = React.useState('chat')
  const tabs = [
    { id: 'overview', label: '概要',     icon: 'book' },
    { id: 'chat',     label: 'チャット', icon: 'chat' },
    { id: 'files',    label: 'ファイル', icon: 'file' },
    { id: 'tasks',    label: 'タスク',   icon: 'check' },
    { id: 'members',  label: 'メンバー', icon: 'users' },
    { id: 'gallery',  label: 'ギャラリー', icon: 'image' },
    { id: 'ai',       label: 'AI',       icon: 'sparkles' },
    { id: 'settings', label: '設定',     icon: 'settings' },
  ]
  return (
    <aside style={{
      width: 420, flexShrink: 0,
      background: 'var(--card)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
      boxShadow: 'var(--shadow-lg)',
      animation: 'projectPanelIn .2s cubic-bezier(.2,.7,.3,1)',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <MountainPhoto idx={0} height={180} flat/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.45), transparent 40%, rgba(0,0,0,0.55))' }}/>
        <div style={{ position: 'absolute', top: 14, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{project.title}</span>
          <button style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="more" size={14}/>
          </button>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={15}/>
          </button>
        </div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14, color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{formatDateRange(project.startDate, project.endDate)}</div>
          <div style={{ fontSize: 12.5, opacity: 0.95, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="users" size={12}/> {project.memberCount}人参加</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusChip s={project.statusName}/>
        <AvatarStack names={MEMBERS.slice(0, Math.min(project.memberCount, 5))} size={22} max={5}/>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', height: 28, fontSize: 11.5, padding: '0 8px' }}>
          <Icon name="arrowRight" size={11}/> 詳細を開く
        </button>
      </div>

      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 2, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 10px', borderRadius: 6, border: 'none',
            background: tab === t.id ? 'var(--card-hover)' : 'transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
            fontSize: 12, fontWeight: tab === t.id ? 600 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}><Icon name={t.icon} size={13}/> {t.label}</button>
        ))}
      </div>

      {tab === 'chat' && <ChatTabContent project={project}/>}
      {tab === 'overview' && <OverviewTab project={project}/>}
      {tab === 'files' && <FilesTab/>}
      {tab === 'tasks' && <TasksTab/>}
      {tab === 'members' && <MembersTab/>}
      {tab === 'gallery' && <PanelGalleryTab/>}
      {tab === 'ai' && <PanelAITab/>}
      {tab === 'settings' && <PanelSettingsTab/>}
    </aside>
  )
}
