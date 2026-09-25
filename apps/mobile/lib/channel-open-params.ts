type Translate = (message: string, values?: Record<string, string | number>) => string

export interface ChannelListItem {
  channelId: string
  channelName: string
  projectTitle: string
  projectId: string
  milestoneId: string | null
}

export interface WorkspaceChannelListItem {
  id: string
  name: string | null
  isPrivate: boolean
}

export interface DmListItem {
  id: string
  participantName: string
}

export interface ChannelOpenParams {
  channelId: string
  channelName?: string
  channelType?: 'project' | 'workspace' | 'dm'
  projectId?: string
  isPrivate?: '0' | '1'
}

export function resolveChannelOpenParams(
  channelId: string,
  lists: {
    projects?: readonly ChannelListItem[]
    workspace?: readonly WorkspaceChannelListItem[]
    dms?: readonly DmListItem[]
  },
  t: Translate,
): ChannelOpenParams {
  const project = lists.projects?.find((channel) => channel.channelId === channelId)
  if (project) {
    return {
      channelId,
      channelName: project.milestoneId ? project.channelName : project.projectTitle,
      channelType: 'project',
      projectId: project.projectId,
    }
  }

  const workspace = lists.workspace?.find((channel) => channel.id === channelId)
  if (workspace) {
    return {
      channelId,
      channelName: workspace.name ?? t('Channels'),
      channelType: 'workspace',
      isPrivate: workspace.isPrivate ? '1' : '0',
    }
  }

  const dm = lists.dms?.find((channel) => channel.id === channelId)
  if (dm) {
    return {
      channelId,
      channelName: dm.participantName,
      channelType: 'dm',
    }
  }

  return { channelId }
}
