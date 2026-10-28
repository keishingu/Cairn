import type { DmChannelDto, WorkspaceChannelDto } from '../hooks/use-chat-channels'
import type { ProjectChannelDto } from '../hooks/use-projects'

type ProjectChannelUnread = Pick<ProjectChannelDto, 'archived' | 'milestoneId' | 'milestoneCompleted' | 'unreadCount'>
type WorkspaceChannelUnread = Pick<WorkspaceChannelDto, 'id' | 'archived' | 'parentChannelId' | 'unreadCount'>
type DmUnread = Pick<DmChannelDto, 'unreadCount'>

/**
 * チャットタブのバッジ件数。一覧画面（chats/index.tsx）が表示する3系統
 * （プロジェクトチャンネル・ワークスペースチャンネル・DM）を合算する。
 * 折りたたみで隠れているもの（アーカイブ済みプロジェクトの全チャンネル、完了済みマイルストーン、
 * アーカイブ済みのチャンネル・スレッドと、親チャンネルがアーカイブ済みの配下スレッド）は含めない。
 * 含めると、一覧のどこにも未読が見えないのにバッジだけが残る
 */
export function chatTabUnreadCount({
  projectChannels,
  workspaceChannels,
  dms,
}: {
  projectChannels: ProjectChannelUnread[]
  workspaceChannels: WorkspaceChannelUnread[]
  dms: DmUnread[]
}): number {
  const archivedParentIds = new Set(
    workspaceChannels
      .filter((channel) => channel.archived === true && channel.parentChannelId == null)
      .map((channel) => channel.id),
  )
  return (
    projectChannels
      .filter((channel) => !channel.archived)
      .filter((channel) => !(channel.milestoneId !== null && channel.milestoneCompleted === true))
      .reduce((total, channel) => total + channel.unreadCount, 0) +
    workspaceChannels
      .filter((channel) => channel.archived !== true)
      .filter((channel) => channel.parentChannelId == null || !archivedParentIds.has(channel.parentChannelId))
      .reduce((total, channel) => total + channel.unreadCount, 0) +
    dms.reduce((total, dm) => total + dm.unreadCount, 0)
  )
}
