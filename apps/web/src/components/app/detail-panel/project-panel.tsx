'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, AvatarStack, StatusChip, MountainPhoto } from '../primitives'
import type { WorkspaceCoverPhoto } from '@/app/api/workspaces/cover-photos/route'
import { MEMBERS, type StatusKey } from '../data'
import type { ProjectDto } from '@/app/api/projects/route'
import { ChatTab } from './tabs/chat-tab'
import { OverviewTab, formatDateRange } from './tabs/overview-tab'
import { FilesTab } from './tabs/files-tab'
import { TasksTab } from './tabs/tasks-tab'
import { MembersTab } from './tabs/members-tab'
import { GalleryTab } from './tabs/gallery-tab'
import { fetchWithAuth } from '@/lib/fetch-with-auth'



// ─── Cover photo picker (inline, used inside the panel) ───────────
interface CoverPickerPanelProps {
  projectId: string
  currentCoverUrl: string | null
  defaultIdx: number
  onClose: () => void
}

const CoverPickerPanel = ({ projectId, currentCoverUrl, defaultIdx, onClose }: CoverPickerPanelProps) => {
  const queryClient = useQueryClient()
  const [saving, setSaving] = React.useState(false)

  const { data: workspacePhotos = [] } = useQuery<WorkspaceCoverPhoto[]>({
    queryKey: ['workspace-cover-photos'],
    queryFn: () => fetchWithAuth('/api/workspaces/cover-photos').then(r => r.json()),
  })

  const apply = async (url: string | null) => {
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhotoUrl: url }),
      })
      if (!res.ok) return
      queryClient.setQueryData<ProjectDto[]>(['projects'], old =>
        (old ?? []).map(p => p.id === projectId ? { ...p, coverPhotoUrl: url } : p),
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const thumbStyle = (selected: boolean): React.CSSProperties => ({
    flexShrink: 0, width: 80, height: 54, padding: 0,
    borderRadius: 7, overflow: 'hidden', cursor: saving ? 'default' : 'pointer',
    border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
    outline: selected ? 'none' : '1px solid var(--border)', outlineOffset: -1,
    background: 'transparent', position: 'relative',
    opacity: saving ? 0.6 : 1,
  })

  return (
    <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid var(--divider)', background: 'var(--card-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>カバー写真を変更</span>
        <button onClick={onClose} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Icon name="close" size={12}/>
        </button>
      </div>

      {workspacePhotos.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>ライブラリ</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 6 }}>
            {workspacePhotos.map(photo => {
              const selected = currentCoverUrl === photo.url
              return (
                <button key={photo.id} type="button" style={thumbStyle(selected)} onClick={() => apply(photo.url)} disabled={saving}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                  {selected && (
                    <div style={{ position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={9} strokeWidth={3}/>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>デフォルト</div>
      <div>
        <button type="button" style={thumbStyle(currentCoverUrl === null)} onClick={() => apply(null)} disabled={saving}>
          <MountainPhoto idx={defaultIdx} height={50} flat radius={5}/>
          {currentCoverUrl === null && (
            <div style={{ position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={9} strokeWidth={3}/>
            </div>
          )}
        </button>
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
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [editingCover, setEditingCover] = React.useState(false)
  const moreRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!moreOpen) return
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  const pcTabs = [
    { id: 'overview',  label: '概要',       icon: 'book' },
    { id: 'chat',      label: 'チャット',   icon: 'chat' },
    { id: 'files',     label: 'ファイル',   icon: 'file' },
    { id: 'tasks',     label: 'タスク',     icon: 'check' },
    { id: 'members',   label: 'メンバー',   icon: 'users' },
    { id: 'gallery',   label: 'ギャラリー', icon: 'image' },
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
              <div ref={moreRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setMoreOpen(v => !v); setEditingCover(false) }}
                  style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="more" size={14}/>
                </button>
                {moreOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 50, minWidth: 168, padding: 4 }}>
                    <button
                      onClick={() => { setMoreOpen(false); setEditingCover(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <Icon name="image" size={13}/> カバー写真を変更
                    </button>
                  </div>
                )}
              </div>
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

      {/* Cover photo picker (shown when editing) */}
      {!isMobile && editingCover && (
        <CoverPickerPanel
          projectId={project.id}
          currentCoverUrl={project.coverPhotoUrl}
          defaultIdx={project.coverPhotoIdx}
          onClose={() => setEditingCover(false)}
        />
      )}

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
        {tab === 'overview' && <OverviewTab project={project} onDeleted={onClose}/>}
        {tab === 'files'    && <FilesTab projectId={project.id}/>}
        {tab === 'tasks'    && <TasksTab project={project}/>}
        {tab === 'members'  && <MembersTab projectId={project.id} onMemberClick={onMemberClick}/>}
        {tab === 'gallery'  && <GalleryTab projectId={project.id}/>}
      </div>
    </aside>
  )
}
