import type { Router } from 'expo-router'
import { resolveChannelOpenParams } from './channel-open-params'
import type { ChannelListItem, DmListItem, WorkspaceChannelListItem } from './channel-open-params'
import type { NotificationDestination } from './notification-routing'
import { queryClient } from './query-client'

function readLists() {
  const projects = queryClient.getQueryData<ChannelListItem[]>(['project-channels'])
  const workspace = queryClient.getQueryData<WorkspaceChannelListItem[]>(['workspace-channels'])
  const dms = queryClient.getQueryData<DmListItem[]>(['workspace-dms'])
  return {
    ...(projects ? { projects } : {}),
    ...(workspace ? { workspace } : {}),
    ...(dms ? { dms } : {}),
  }
}

function channelRouteParams(channelId: string): Record<string, string> {
  const resolved = resolveChannelOpenParams(channelId, readLists())
  const params: Record<string, string> = { channelId: resolved.channelId }
  if (resolved.channelName) params['channelName'] = resolved.channelName
  if (resolved.channelType) params['channelType'] = resolved.channelType
  if (resolved.projectId) params['projectId'] = resolved.projectId
  if (resolved.isPrivate) params['isPrivate'] = resolved.isPrivate
  return params
}

export function followNotification(
  router: Pick<Router, 'push'>,
  destination: NotificationDestination,
) {
  if (destination.kind === 'channel') {
    router.push({
      pathname: '/chats/[channelId]',
      params: channelRouteParams(destination.channelId),
    })
    return
  }
  router.push(destination.path)
}
