'use client'

import React from 'react'
import { Icon } from '../../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import { findProjectChannelById, useProjectChannels } from '@/lib/chat/client'
import { ChatThread } from '../../chat-thread'

export function filterProjectChatTabChannels(
  channels: ProjectChannelDto[] | undefined,
  projectId: string,
): ProjectChannelDto[] {
  return channels?.filter(channel =>
    channel.projectId === projectId &&
    (channel.milestoneId === null || channel.milestoneCompleted !== true)
  ) ?? []
}

export const ChatTab = ({ project, isMobile }: { project: ProjectDto; isMobile?: boolean }) => {
  const { data: projectChannels, isLoading, isError } = useProjectChannels()
  const [selectedChannelId, setSelectedChannelId] = React.useState<string | null>(null)

  const projectScopedChannels = React.useMemo(
    () => filterProjectChatTabChannels(projectChannels, project.id),
    [projectChannels, project.id],
  )

  const generalChannel = React.useMemo(
    () => projectChannels ? findProjectChannelById(projectChannels, project.id) : null,
    [projectChannels, project.id],
  )

  const activeChannel = React.useMemo(() => {
    if (!projectScopedChannels.length) return undefined
    if (selectedChannelId) {
      const selected = projectScopedChannels.find(channel => channel.channelId === selectedChannelId)
      if (selected) return selected
    }
    return generalChannel ?? undefined
  }, [generalChannel, projectScopedChannels, selectedChannelId])

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
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}># {activeChannel.milestoneId ? activeChannel.channelName : activeChannel.projectTitle}</span>
        {projectScopedChannels.length > 1 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}>
            {projectScopedChannels.map(channel => {
              const active = channel.channelId === activeChannel.channelId
              return (
                <button
                  key={channel.channelId}
                  type="button"
                  onClick={() => setSelectedChannelId(channel.channelId)}
                  style={{
                    height: 26,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 7,
                    background: active ? 'var(--accent-soft)' : 'var(--card)',
                    color: active ? 'var(--accent-text)' : 'var(--text-2)',
                    padding: '0 8px',
                    fontSize: 11.5,
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon name={channel.milestoneId ? 'flag' : 'hash'} size={11}/>
                  {channel.milestoneId ? channel.channelName : 'General'}
                </button>
              )
            })}
          </div>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
          <Icon name="users" size={13}/> {project.memberCount}
        </span>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="search" size={14}/></button>
        <button style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Icon name="more" size={14}/></button>
      </div>
      <ChatThread
        channelId={activeChannel.channelId}
        channelName={activeChannel.milestoneId ? activeChannel.channelName : activeChannel.projectTitle}
        compact={true}
        {...(isMobile ? { isMobile: true } : {})}
      />
    </>
  )
}
