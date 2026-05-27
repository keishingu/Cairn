'use client'

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import { MEMBERS, type StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import { ChatTab } from './tabs/chat-tab'
import { OverviewTab, formatDateRange } from './tabs/overview-tab'
import { FilesTab } from './tabs/files-tab'
import { TasksTab } from './tabs/tasks-tab'
import { MembersTab } from './tabs/members-tab'
import { GalleryTab } from './tabs/gallery-tab'


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

const PanelSettingsTab = ({ projectId, onDeleted }: { projectId: string; onDeleted: () => void }) => {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setDeleteError(data.error ?? '削除に失敗しました')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      onDeleted()
    } catch {
      setDeleteError('削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--red)', background: 'var(--red-soft)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red-text)', marginBottom: 10 }}>危険な操作</div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            プロジェクトを削除する
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--red-text)', lineHeight: 1.6 }}>
              チャット・ファイル・タスクを含むすべてのデータが完全に削除されます。この操作は取り消せません。
            </div>
            {deleteError && (
              <div style={{ fontSize: 12, color: 'var(--red-text)', padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.08)' }}>
                ⚠️ {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                disabled={isDeleting}
                style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: isDeleting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isDeleting ? 0.7 : 1 }}
              >
                {isDeleting ? '削除中...' : '本当に削除する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Project Panel ─────────────────────────────────────────────────
interface ProjectPanelProps {
  project: ProjectDto
  onClose: () => void
  onMemberClick?: ((userId: string, displayName: string) => void) | undefined
  isMobile?: boolean
}

export const ProjectPanel = ({ project, onClose, onMemberClick, isMobile }: ProjectPanelProps) => {
  const [tab, setTab] = React.useState('chat')

  const pcTabs = [
    { id: 'overview',  label: '概要',       icon: 'book' },
    { id: 'chat',      label: 'チャット',   icon: 'chat' },
    { id: 'files',     label: 'ファイル',   icon: 'file' },
    { id: 'tasks',     label: 'タスク',     icon: 'check' },
    { id: 'members',   label: 'メンバー',   icon: 'users' },
    { id: 'gallery',   label: 'ギャラリー', icon: 'image' },
    { id: 'ai',        label: 'AI',         icon: 'sparkles' },
    { id: 'settings',  label: '設定',       icon: 'settings' },
  ]

  const mobileTabs = [
    { id: 'overview', label: '概要',       icon: 'book' },
    { id: 'chat',     label: 'チャット',   icon: 'chat' },
    { id: 'tasks',    label: 'タスク',     icon: 'check' },
    { id: 'files',    label: 'ファイル',   icon: 'file' },
    { id: 'gallery',  label: 'ギャラリー', icon: 'image' },
    { id: 'members',  label: 'メンバー',   icon: 'users' },
  ]

  const tabs = isMobile ? mobileTabs : pcTabs

  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight .22s cubic-bezier(.2,.7,.3,1)',
      }
    : {
        width: 420, flexShrink: 0,
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        minHeight: 0,
        boxShadow: 'var(--shadow-lg)',
        animation: 'projectPanelIn .2s cubic-bezier(.2,.7,.3,1)',
      }

  return (
    <aside style={containerStyle}>
      {/* Hero image header — PC と Mobile で共通、コントロールのみ切り替え */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {project.coverPhotoUrl
          ? <img src={project.coverPhotoUrl} alt="" style={{ width: '100%', height: isMobile ? 130 : 180, objectFit: 'cover', display: 'block' }}/>
          : <MountainPhoto idx={project.coverPhotoIdx} height={isMobile ? 130 : 180} flat/>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 45%, rgba(0,0,0,0.65) 100%)' }}/>

        {/* Top controls */}
        <div style={{
          position: 'absolute',
          top: isMobile ? 'max(14px, env(safe-area-inset-top))' : 14,
          left: 14, right: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {isMobile ? (
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevLeft" size={18}/>
            </button>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{project.title}</span>
              <button style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="more" size={14}/>
              </button>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={15}/>
              </button>
            </>
          )}
        </div>

        {/* Bottom info overlay */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, color: '#fff' }}>
          {isMobile ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 5, lineHeight: 1.2, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                {project.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.95 }}>
                <StatusChip s={project.statusName as StatusKey}/>
                <span>{formatDateRange(project.startDate, project.endDate)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="users" size={11}/> {project.memberCount}人参加
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, lineHeight: 1.2, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                {formatDateRange(project.startDate, project.endDate)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, opacity: 0.95 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="users" size={12}/> {project.memberCount}人参加
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PC only: status + avatars + "詳細を開く" */}
      {!isMobile && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusChip s={project.statusName}/>
          <AvatarStack names={MEMBERS.slice(0, Math.min(project.memberCount, 5))} size={22} max={5}/>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto', height: 28, fontSize: 11.5, padding: '0 8px' }}>
            <Icon name="arrowRight" size={11}/> 詳細を開く
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 2, overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: isMobile ? '10px 12px' : '7px 10px',
            borderRadius: 6, border: 'none',
            background: tab === t.id ? 'var(--card-hover)' : 'transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
            fontSize: isMobile ? 13 : 12,
            fontWeight: tab === t.id ? 600 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}><Icon name={t.icon} size={isMobile ? 14 : 13}/> {t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : 0 }}>
        {tab === 'chat'     && <ChatTab project={project}/>}
        {tab === 'overview' && <OverviewTab project={project}/>}
        {tab === 'files'    && <FilesTab projectId={project.id}/>}
        {tab === 'tasks'    && <TasksTab project={project}/>}
        {tab === 'members'  && <MembersTab projectId={project.id} onMemberClick={onMemberClick}/>}
        {tab === 'gallery'  && <GalleryTab projectId={project.id}/>}
        {tab === 'ai'       && !isMobile && <PanelAITab/>}
        {tab === 'settings' && !isMobile && <PanelSettingsTab projectId={project.id} onDeleted={onClose}/>}
      </div>
    </aside>
  )
}
