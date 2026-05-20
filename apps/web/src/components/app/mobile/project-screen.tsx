'use client'

import React from 'react'
import { Icon, MountainPhoto, StatusChip } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { StatusKey } from '../data'
import { ChatTab } from '../detail-panel/tabs/chat-tab'
import { OverviewTab, formatDateRange } from '../detail-panel/tabs/overview-tab'
import { FilesTab } from '../detail-panel/tabs/files-tab'
import { TasksTab } from '../detail-panel/tabs/tasks-tab'
import { MembersTab } from '../detail-panel/tabs/members-tab'

const TABS = [
  { id: 'overview', label: '概要',     icon: 'book' },
  { id: 'chat',     label: 'チャット', icon: 'chat' },
  { id: 'tasks',    label: 'タスク',   icon: 'check' },
  { id: 'files',    label: 'ファイル', icon: 'file' },
  { id: 'members',  label: 'メンバー', icon: 'users' },
] as const

type TabId = typeof TABS[number]['id']

interface MobileProjectScreenProps {
  project: ProjectDto
  onBack: () => void
}

export function MobileProjectScreen({ project, onBack }: MobileProjectScreenProps) {
  const [tab, setTab] = React.useState<TabId>('overview')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight .22s cubic-bezier(.2,.7,.3,1)',
    }}>
      {/* Hero */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <MountainPhoto idx={Math.abs(project.id.charCodeAt(0)) % 12} height={200} flat/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 40%, rgba(0,0,0,0.6) 100%)' }}/>

        {/* Back button */}
        <button onClick={onBack} style={{
          position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 14,
          width: 34, height: 34, borderRadius: 10,
          border: 'none', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="chevLeft" size={18}/>
        </button>

        {/* Title area */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)', marginBottom: 6, lineHeight: 1.2 }}>
            {project.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusChip s={project.statusName as StatusKey}/>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)' }}>
              {formatDateRange(project.startDate, project.endDate)}
            </span>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="users" size={12}/> {project.memberCount}人
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        padding: '0 8px',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 14px', border: 'none', background: 'transparent',
            color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Icon name={t.icon} size={14}/>{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {tab === 'overview' && <OverviewTab project={project}/>}
        {tab === 'chat'     && <ChatTab project={project}/>}
        {tab === 'tasks'    && <TasksTab/>}
        {tab === 'files'    && <FilesTab/>}
        {tab === 'members'  && <MembersTab/>}
      </div>
    </div>
  )
}
