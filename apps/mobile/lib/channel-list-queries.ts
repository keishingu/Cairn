import type { QueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS, translate } from '@cairn/shared'
import type { ChannelListItem, DmListItem, WorkspaceChannelListItem } from './channel-open-params'
import { fetchApiJson } from './fetch-api-json'

type Translate = (message: string, values?: Record<string, string | number>) => string

const translateJa: Translate = (message, values) => translate('ja', message, values)

export const projectChannelsQueryKey = ['project-channels'] as const
export const workspaceChannelsQueryKey = ['workspace-channels'] as const
export const workspaceDmsQueryKey = ['workspace-dms'] as const

export function fetchProjectChannels<T>(t: Translate = translateJa): Promise<T> {
  return fetchApiJson<T>('/api/projects/channels', t('Could not load channels ({status})'))
}

export function fetchWorkspaceChannels<T>(t: Translate = translateJa): Promise<T> {
  return fetchApiJson<T>('/api/workspaces/channels', t('Could not load channels ({status})'))
}

export function fetchWorkspaceDms<T>(t: Translate = translateJa): Promise<T> {
  return fetchApiJson<T>('/api/workspaces/dms', t('Could not load direct messages ({status})'))
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
