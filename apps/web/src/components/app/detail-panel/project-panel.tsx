'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Icon, AvatarStack, StatusChip, MountainPhoto, ArchivedBadge } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import { ChatTab } from './tabs/chat-tab'
import { OverviewTab, formatDateRange } from './tabs/overview-tab'
import { FilesTab } from './tabs/files-tab'
import { TasksTab } from './tabs/tasks-tab'
import { MembersTab } from './tabs/members-tab'
import { GalleryTab } from './tabs/gallery-tab'
import { usePinnedProjects, usePinProject, useUnpinProject } from '@/lib/use-pinned-projects'
import { useProjectChannels } from '@/lib/chat/client'
import { useApplyPlacePhoto, useClearProjectCoverPhoto, usePlacePhotos } from '@/hooks/use-project-cover-photo'



// ─── Cover photo picker (inline, used inside the panel) ───────────
interface CoverPickerPanelProps {
  projectId: string
  currentCoverUrl: string | null
  defaultIdx: number
  placeId: string | null
  onClose: () => void
}

const CoverPickerPanel = ({ projectId, currentCoverUrl, defaultIdx, placeId, onClose }: CoverPickerPanelProps) => {
  const { data: placePhotos = [], isLoading: photosLoading } = usePlacePhotos(placeId)
  const clearCoverPhoto = useClearProjectCoverPhoto(projectId)
  const applyPlacePhoto = useApplyPlacePhoto(projectId)
  const saving = clearCoverPhoto.isPending || applyPlacePhoto.isPending

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

      {placeId && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>場所の写真</div>
          {photosLoading ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="loader" size={12}/> 取得中…
            </div>
          ) : placePhotos.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 6, scrollbarWidth: 'thin' }}>
              {placePhotos.map(photo => (
                <button
                  key={photo.photoName}
                  type="button"
                  style={thumbStyle(false)}
                  onClick={() => applyPlacePhoto.mutate(photo.photoName, { onSuccess: onClose })}
                  disabled={saving}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbnailUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', padding: '4px 0 8px' }}>写真が見つかりませんでした</div>
          )}
        </>
      )}

      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>デフォルト</div>
      <div>
        <button
          type="button"
          style={thumbStyle(currentCoverUrl === null)}
          onClick={() => clearCoverPhoto.mutate(undefined, { onSuccess: onClose })}
          disabled={saving}
        >
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
  /** アクティブタブ（未指定の場合は内部 state で管理） */
  tab?: string
  onTabChange?: (tab: string) => void
}

export const ProjectPanel = ({ project, onClose, onMemberClick, isMobile, tab: tabProp, onTabChange }: ProjectPanelProps) => {
  const [internalTab, setInternalTab] = React.useState('chat')
  const tab = tabProp ?? internalTab
  const setTab = onTabChange ?? setInternalTab

  // 訪問済みのタブは display:none で残し、再訪問時の再マウント（Chat の markdown 再パース・
  // スクロール初期化・各タブの再フェッチ）を避ける。初回は現在のタブだけマウントして
  // オープン直後を軽く保つ
  const [visitedTabs, setVisitedTabs] = React.useState<Set<string>>(() => new Set([tab]))
  React.useEffect(() => {
    setVisitedTabs(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }, [tab])
  // プロジェクトが変わったら訪問済みをリセットし、別プロジェクトのタブ内容を残さない
  React.useEffect(() => {
    setVisitedTabs(new Set([tab]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const renderTabContent = (id: string): React.ReactNode => {
    switch (id) {
      case 'chat':     return <ChatTab project={project} {...(isMobile ? { isMobile: true } : {})}/>
      case 'overview': return <OverviewTab project={project} onDeleted={onClose}/>
      case 'files':    return <FilesTab projectId={project.id} channelId={projectChannelId ?? null}/>
      case 'tasks':    return <TasksTab project={project}/>
      case 'members':  return <MembersTab projectId={project.id} onMemberClick={onMemberClick}/>
      case 'gallery':  return <GalleryTab projectId={project.id}/>
      default:         return null
    }
  }
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [editingCover, setEditingCover] = React.useState(false)
  const moreRef = React.useRef<HTMLDivElement>(null)

  const router = useRouter()
  const { data: pinnedProjects = [] } = usePinnedProjects()
  const pinProject = usePinProject()
  const unpinProject = useUnpinProject()
  const isPinned = pinnedProjects.some(p => p.projectId === project.id)

  // このプロジェクトのチャットチャンネルへ遷移するための channelId
  const { data: projectChannels = [] } = useProjectChannels()
  const projectChannelId = projectChannels.find(c => c.projectId === project.id)?.channelId

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
        height: '100%',
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
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {project.title}
                {project.archived && <ArchivedBadge onDark/>}
              </span>
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
                      onClick={() => {
                        setMoreOpen(false)
                        isPinned ? unpinProject.mutate(project.id) : pinProject.mutate(project.id)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <Icon name="pin" size={13}/>
                      {isPinned ? 'ピン留めを解除' : 'ピン留め'}
                    </button>
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
                <StatusChip name={project.statusName ?? ''} color={project.statusColor ?? '#9CA3AF'}/>
                {project.archived && <ArchivedBadge onDark/>}
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
          placeId={project.placeId}
          onClose={() => setEditingCover(false)}
        />
      )}

      {/* PC only: status + avatars + "チャットを開く" */}
      {!isMobile && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusChip name={project.statusName ?? ''} color={project.statusColor ?? '#9CA3AF'}/>
          {project.archived && <ArchivedBadge/>}
          <AvatarStack names={project.memberNames} size={22} max={5}/>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: 'auto', height: 28, fontSize: 11.5, padding: '0 8px' }}
            disabled={!projectChannelId}
            onClick={() => projectChannelId && router.push(`/chats/${projectChannelId}`)}
          >
            <Icon name="chat" size={11}/> チャットを開く
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

      {/* Tab content — 訪問済みタブはマウントしたまま表示だけ切り替える（keep-alive） */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : 0 }}>
        {tabs.map(t => visitedTabs.has(t.id) ? (
          <div
            key={t.id}
            style={{ flex: 1, minHeight: 0, display: tab === t.id ? 'flex' : 'none', flexDirection: 'column' }}
          >
            {renderTabContent(t.id)}
          </div>
        ) : null)}
      </div>
    </aside>
  )
}
