'use client'

import React from 'react'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from './primitives'
import { MEMBERS } from './data'
import type { ProjectDto } from '@/app/api/projects/route'
import { ChatTab } from './detail-panel/tabs/chat-tab'
import { OverviewTab, formatDateRange } from './detail-panel/tabs/overview-tab'
import { FilesTab } from './detail-panel/tabs/files-tab'
import { TasksTab } from './detail-panel/tabs/tasks-tab'
import { MembersTab } from './detail-panel/tabs/members-tab'

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
        { i: 'bell',     l: '通知設定',       s: 'メンション・更新・リマインド' },
        { i: 'users',    l: '公開範囲',       s: 'メンバー・閲覧権限' },
        { i: 'sparkles', l: 'AIアシスタント', s: '自動要約・提案の動作' },
        { i: 'file',     l: 'エクスポート',   s: 'PDF / Markdown' },
        { i: 'close',    l: 'アーカイブ',     s: 'プロジェクトを保管する' },
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
    { id: 'overview',  label: '概要',      icon: 'book' },
    { id: 'chat',      label: 'チャット',  icon: 'chat' },
    { id: 'files',     label: 'ファイル',  icon: 'file' },
    { id: 'tasks',     label: 'タスク',    icon: 'check' },
    { id: 'members',   label: 'メンバー',  icon: 'users' },
    { id: 'gallery',   label: 'ギャラリー', icon: 'image' },
    { id: 'ai',        label: 'AI',        icon: 'sparkles' },
    { id: 'settings',  label: '設定',      icon: 'settings' },
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

      {tab === 'chat'     && <ChatTab project={project}/>}
      {tab === 'overview' && <OverviewTab project={project}/>}
      {tab === 'files'    && <FilesTab/>}
      {tab === 'tasks'    && <TasksTab project={project}/>}
      {tab === 'members'  && <MembersTab/>}
      {tab === 'gallery'  && <PanelGalleryTab/>}
      {tab === 'ai'       && <PanelAITab/>}
      {tab === 'settings' && <PanelSettingsTab/>}
    </aside>
  )
}
