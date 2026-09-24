import type { QueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import type { ChannelListItem, DmListItem, WorkspaceChannelListItem } from './channel-open-params'
import { fetchApiJson } from './fetch-api-json'

export const projectChannelsQueryKey = ['project-channels'] as const
export const workspaceChannelsQueryKey = ['workspace-channels'] as const
export const workspaceDmsQueryKey = ['workspace-dms'] as const

export function fetchProjectChannels<T>(): Promise<T> {
  return fetchApiJson<T>('/api/projects/channels', 'チャンネル')
}

export function fetchWorkspaceChannels<T>(): Promise<T> {
  return fetchApiJson<T>('/api/workspaces/channels', 'チャンネル')
}

export function fetchWorkspaceDms<T>(): Promise<T> {
  return fetchApiJson<T>('/api/workspaces/dms', 'ダイレクトメッセージ')
}

export function invalidateChannelListQueries(
  client: Pick<QueryClient, 'invalidateQueries'>,
): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: projectChannelsQueryKey }),
    client.invalidateQueries({ queryKey: workspaceChannelsQueryKey }),
    client.invalidateQueries({ queryKey: workspaceDmsQueryKey }),
  ]).then(() => undefined)
}

export interface ChannelLists {
  projects?: ChannelListItem[]
  workspace?: WorkspaceChannelListItem[]
  dms?: DmListItem[]
}

/** 通知遷移に必要な三一覧。失敗した一覧だけ欠ける。DM 無効時は DM を取らない。 */
export async function loadChannelLists(
  client: Pick<QueryClient, 'fetchQuery'>,
): Promise<ChannelLists> {
  const [projects, workspace, dms] = await Promise.allSettled([
    client.fetchQuery({
      queryKey: projectChannelsQueryKey,
      queryFn: () => fetchProjectChannels<ChannelListItem[]>(),
      retry: false,
    }),
    client.fetchQuery({
      queryKey: workspaceChannelsQueryKey,
      queryFn: () => fetchWorkspaceChannels<WorkspaceChannelListItem[]>(),
      retry: false,
    }),
    FEATURE_FLAGS.dm
      ? client.fetchQuery({
          queryKey: workspaceDmsQueryKey,
          queryFn: () => fetchWorkspaceDms<DmListItem[]>(),
          retry: false,
        })
      : Promise.resolve(undefined),
  ])

  return {
    ...(projects.status === 'fulfilled' ? { projects: projects.value } : {}),
    ...(workspace.status === 'fulfilled' ? { workspace: workspace.value } : {}),
    ...(dms.status === 'fulfilled' && dms.value ? { dms: dms.value } : {}),
  }
}
