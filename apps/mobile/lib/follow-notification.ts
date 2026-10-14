import type { Router } from 'expo-router'
import { apiFetch } from './api-fetch'
import { loadChannelLists, type ChannelLists } from './channel-list-queries'
import { resolveChannelOpenParams } from './channel-open-params'
import { decideWorkspaceSwitch } from './notification-workspace'
import type { NotificationDestination } from './notification-routing'
import { queryClient } from './query-client'
import { supabase } from './supabase'
import { activateWorkspace } from './workspace-activation'
import { fetchWorkspaceMemberships, workspaceListQueryKey } from './workspace-queries'
import { getSelectedWorkspaceId } from './workspace-selection'

type Translate = (message: string, values?: Record<string, string | number>) => string

function channelRouteParams(channelId: string, lists: ChannelLists, t: Translate): Record<string, string> {
  const resolved = resolveChannelOpenParams(channelId, lists, t)
  const params: Record<string, string> = { channelId: resolved.channelId }
  if (resolved.channelName) params['channelName'] = resolved.channelName
  if (resolved.channelType) params['channelType'] = resolved.channelType
  if (resolved.projectId) params['projectId'] = resolved.projectId
  if (resolved.isPrivate) params['isPrivate'] = resolved.isPrivate
  return params
}

/** 切り替えが必要なら所属を確認してから選択を変える。未所属や確認不能なら遷移しない。 */
async function prepareWorkspace(workspaceId: string | undefined): Promise<boolean> {
  if (!workspaceId) return true

  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return false

  const current = await getSelectedWorkspaceId(userId)
  // 同じワークスペースなら所属一覧は要らない。未所属の判定は一覧取得後に行う。
  if (current === workspaceId) return true

  let memberships
  try {
    memberships = await queryClient.fetchQuery({
      queryKey: workspaceListQueryKey,
      queryFn: () => fetchWorkspaceMemberships(),
      retry: false,
    })
  } catch (error) {
    console.warn(
      '[notification] 通知先のワークスペースを確認できなかったため、遷移を中止しました',
      error,
    )
    return false
  }

  const decision = decideWorkspaceSwitch(
    workspaceId,
    current,
    memberships.map((membership) => membership.id),
  )
  if (decision !== 'switch') {
    console.warn('[notification] 通知のワークスペースに所属していないため、遷移を中止しました')
    return false
  }

  const match = memberships.find((membership) => membership.id === workspaceId)
  if (!match) return false
  await activateWorkspace(queryClient, userId, {
    id: match.id,
    name: match.name,
    logoUrl: match.logoUrl,
  })
  return true
}

// Push の送信後にメッセージがスレッドへ切り出されていても移動先を開く。
// 見つからない（削除済み・閲覧不可）ときは null を返し、呼び出し側でエラーを表示して遷移しない。
// 通信に失敗したときは、送信時点の宛先である Push のチャンネルを開く。
async function currentChannelOfMessage(
  destination: Extract<NotificationDestination, { kind: 'channel' }>,
): Promise<string | null> {
  if (!destination.messageId) return destination.channelId
  try {
    const res = await apiFetch(`/api/messages/${encodeURIComponent(destination.messageId)}/location`)
    if (res.status === 404) return null
    if (!res.ok) return destination.channelId
    const body = (await res.json()) as { channelId?: unknown }
    return typeof body.channelId === 'string' && body.channelId ? body.channelId : destination.channelId
  } catch (error) {
    console.warn('[notification] メッセージの移動先を確認できませんでした', error)
    return destination.channelId
  }
}

async function openNotification(
  router: Pick<Router, 'push'>,
  destination: NotificationDestination,
  workspaceId: string | undefined,
  t: Translate,
  onUnavailable: (message: string) => void,
): Promise<void> {
  try {
    const ready = await prepareWorkspace(workspaceId)
    if (!ready) return

    if (destination.kind === 'channel') {
      const channelId = await currentChannelOfMessage(destination)
      if (!channelId) {
        onUnavailable(t('The message could not be found. It may have been deleted, or you may not have access.'))
        return
      }
      const lists = await loadChannelLists(queryClient)
      router.push({
        pathname: '/chats/[channelId]',
        params: channelRouteParams(channelId, lists, t),
      })
      return
    }
    router.push(destination.path)
  } catch (error) {
    console.warn('[notification] 通知先を開けませんでした', error)
  }
}

let notificationNavigation: Promise<void> = Promise.resolve()

export function followNotification(
  router: Pick<Router, 'push'>,
  destination: NotificationDestination,
  options: { workspaceId?: string; t: Translate; onUnavailable: (message: string) => void },
): Promise<void> {
  const navigation = notificationNavigation.then(() =>
    openNotification(router, destination, options.workspaceId, options.t, options.onUnavailable),
  )
  notificationNavigation = navigation.then(
    () => undefined,
    () => undefined,
  )
  return navigation
}
