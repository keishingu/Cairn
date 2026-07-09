'use client'

import React from 'react'
import { Icon } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import { findProjectChannelById, useProjectChannels } from '@/lib/chat/client'
import { ChatThread } from '../../chat-thread'

export const ChatTab = ({ project, isMobile, isActive = true }: { project: ProjectDto; isMobile?: boolean; isActive?: boolean }) => {
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
        realtimeActive={isActive}
        {...(isMobile ? { isMobile: true } : {})}
      />
    </>
  )
}
