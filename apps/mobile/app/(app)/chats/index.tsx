import React from 'react'
import { FEATURE_FLAGS, workspaceChannelDeleteCopy } from '@cairn/shared'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProjectChannels } from '../../../hooks/use-projects'
import type { ProjectChannelDto } from '../../../hooks/use-projects'
import {
  useCreateWorkspaceChannel,
  useCreateWorkspaceDm,
  useCreateChannelThread,
  useDeleteWorkspaceChannel,
  usePatchProjectMilestone,
  useRenameWorkspaceChannel,
  useWorkspaceChannels,
  useWorkspaceDms,
  useWorkspaceMembers,
} from '../../../hooks/use-chat-channels'
import type { DmChannelDto, WorkspaceChannelDto } from '../../../hooks/use-chat-channels'
import type { ThemePalette } from '../../../lib/theme'
import { formatChannelPeriod } from '../../../lib/channel-period'
import { useAppAppearance } from '../../../components/appearance-provider'
import { useNotificationPanel } from '../../../components/notification-panel-provider'
import { WorkspaceSwitcherButton } from '../../../components/workspace-switcher-button'
import { useMe } from '../../../hooks/use-account'

type ChannelItemProps = {
  channel: ProjectChannelDto
  milestone?: boolean
  onOpenActions?: () => void
}

function ChannelItem({ channel, milestone = false, onOpenActions }: ChannelItemProps) {
  const router = useRouter()
  const { palette } = useAppAppearance()
  const period = formatChannelPeriod(
    channel.startDate,
    channel.endDate,
    channel.startTime,
    channel.endTime,
  )
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() =>
        router.push({
          pathname: '/chats/[channelId]',
          params: {
            channelId: channel.channelId,
            channelName: milestone ? channel.channelName : channel.projectTitle,
            channelType: 'project',
            projectId: channel.projectId,
          },
        })
      }
      {...(onOpenActions
        ? {
            onLongPress: onOpenActions,
            delayLongPress: 350,
            accessibilityHint: '長押しでメニューを表示',
          }
        : {})}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.channelIcon,
          milestone ? { backgroundColor: palette.card2 } : { backgroundColor: palette.accentSoft },
        ]}
      >
        <Text
          style={[
            styles.channelIconText,
            { color: milestone ? palette.text3 : palette.accentText },
          ]}
        >
          {milestone ? '┗' : '#'}
        </Text>
      </View>
      <View style={styles.channelCopy}>
        <Text style={[styles.channelName, { color: palette.text }]} numberOfLines={1}>
          {milestone ? channel.channelName : channel.projectTitle}
        </Text>
        {!milestone && period && (
          <Text style={[styles.projectTitle, { color: palette.text3 }]} numberOfLines={1}>
            {period}
          </Text>
        )}
      </View>
      {channel.unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: palette.accent }]}>
          <Text style={[styles.badgeText, { color: palette.onAccent }]}>
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function WorkspaceChannelItem({
  channel,
  thread = false,
  onOpenActions,
}: {
  channel: WorkspaceChannelDto
  thread?: boolean
  onOpenActions?: () => void
}) {
  const router = useRouter()
  const { palette } = useAppAppearance()
  const privateChannel = channel.isPrivate
  return (
    <TouchableOpacity
      style={[
        styles.channelRow,
        thread && styles.threadRow,
        { borderBottomColor: palette.divider },
      ]}
      onPress={() =>
        router.push({
          pathname: '/chats/[channelId]',
          params: {
            channelId: channel.id,
            channelName: channel.name ?? 'チャンネル',
            channelType: 'workspace',
            isPrivate: channel.isPrivate ? '1' : '0',
          },
        })
      }
      {...(onOpenActions
        ? {
            onLongPress: onOpenActions,
            delayLongPress: 350,
            accessibilityHint: '長押しでメニューを表示',
          }
        : {})}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.channelIcon,
          { backgroundColor: privateChannel ? palette.card2 : palette.accentSoft },
        ]}
      >
        {thread ? (
          <Text style={[styles.channelIconText, { color: palette.text3 }]}>┗</Text>
        ) : privateChannel ? (
          <Ionicons name="lock-closed-outline" size={17} color={palette.text3} />
        ) : (
          <Text style={[styles.channelIconText, { color: palette.accentText }]}>#</Text>
        )}
      </View>
      <Text
        style={[styles.channelName, styles.rowLabel, { color: palette.text }]}
        numberOfLines={1}
      >
        {channel.name ?? '名称未設定チャンネル'}
      </Text>
      {channel.unreadCount > 0 && <UnreadBadge count={channel.unreadCount} palette={palette} />}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function DirectMessageItem({ channel }: { channel: DmChannelDto }) {
  const router = useRouter()
  const { palette } = useAppAppearance()
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() =>
        router.push({
          pathname: '/chats/[channelId]',
          params: {
            channelId: channel.id,
            channelName: channel.participantName,
            channelType: 'dm',
          },
        })
      }
      activeOpacity={0.7}
    >
      {channel.participantAvatarUrl ? (
        <Image source={{ uri: channel.participantAvatarUrl }} style={styles.avatar} />
      ) : (
        <View
          style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.accentSoft }]}
        >
          <Text style={[styles.avatarInitial, { color: palette.accentText }]}>
            {channel.participantName.slice(0, 1)}
          </Text>
        </View>
      )}
      <Text
        style={[styles.channelName, styles.rowLabel, { color: palette.text }]}
        numberOfLines={1}
      >
        {channel.participantName}
      </Text>
      {channel.unreadCount > 0 && <UnreadBadge count={channel.unreadCount} palette={palette} />}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function UnreadBadge({ count, palette }: { count: number; palette: ThemePalette }) {
  return (
    <View style={[styles.badge, { backgroundColor: palette.accent }]}>
      <Text style={[styles.badgeText, { color: palette.onAccent }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  )
}

type RowActionTarget =
  | { type: 'project'; channel: ProjectChannelDto; completedCount: number }
  | { type: 'milestone'; channel: ProjectChannelDto }
  | { type: 'workspace'; channel: WorkspaceChannelDto }

export default function ChatsScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const {
    data: channels,
    isLoading,
    isFetching: isFetchingProjectChannels,
    error,
    refetch: refetchProjectChannels,
  } = useProjectChannels()
  const workspaceChannelsQuery = useWorkspaceChannels()
  const dmsQuery = useWorkspaceDms()
  const membersQuery = useWorkspaceMembers()
  const createChannel = useCreateWorkspaceChannel()
  const createDm = useCreateWorkspaceDm()
  const createThread = useCreateChannelThread()
  const renameChannel = useRenameWorkspaceChannel()
  const deleteChannel = useDeleteWorkspaceChannel()
  const patchMilestone = usePatchProjectMilestone()
  const meQuery = useMe()
  const me = meQuery.data
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const { openNotifications } = useNotificationPanel()
  const [createMode, setCreateMode] = React.useState<'menu' | 'channel' | 'dm' | 'thread' | 'rename' | null>(
    null,
  )
  const [channelName, setChannelName] = React.useState('')
  const [privateChannel, setPrivateChannel] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [rowActionTarget, setRowActionTarget] = React.useState<RowActionTarget | null>(null)
  const [threadParent, setThreadParent] = React.useState<WorkspaceChannelDto | null>(null)
  const [renamingChannel, setRenamingChannel] = React.useState<WorkspaceChannelDto | null>(null)
  const [expandedCompletedProjects, setExpandedCompletedProjects] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [showArchivedProjects, setShowArchivedProjects] = React.useState(false)
  const canCreateAdminResources = me?.wsRole === 'owner' || me?.wsRole === 'admin'
  const canManageChildChats = me?.wsRole != null && me.wsRole !== 'guest'
  const canCreateAnyChat = canCreateAdminResources || FEATURE_FLAGS.dm

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void Promise.all([
        refetchProjectChannels(),
        workspaceChannelsQuery.refetch(),
        dmsQuery.refetch(),
      ])
    })
    return unsubscribe
  }, [dmsQuery.refetch, navigation, refetchProjectChannels, workspaceChannelsQuery.refetch])
  // Web の ChannelList と同じく、通常チャンネルの直下に未完了マイルストーンを並べる。
  const { projectGroups, archivedProjects } = React.useMemo(() => {
    const active = (channels ?? []).filter((channel) => !channel.archived)
    return {
      projectGroups: active
        .filter((channel) => channel.milestoneId === null)
        .map((channel) => ({
          channel,
          activeMilestones: active.filter(
            (candidate) =>
              candidate.projectId === channel.projectId &&
              candidate.milestoneId !== null &&
              candidate.milestoneCompleted !== true,
          ),
          completedMilestones: active.filter(
            (candidate) =>
              candidate.projectId === channel.projectId &&
              candidate.milestoneId !== null &&
              candidate.milestoneCompleted === true,
          ),
        })),
      archivedProjects: (channels ?? []).filter(
        (channel) => channel.archived && channel.milestoneId === null,
      ),
    }
  }, [channels])
  const workspaceChannelGroups = React.useMemo(() => {
    const allChannels = workspaceChannelsQuery.data ?? []
    return allChannels
      .filter((channel) => channel.parentChannelId == null)
      .map((channel) => ({
        channel,
        threads: allChannels.filter((candidate) => candidate.parentChannelId === channel.id),
      }))
  }, [workspaceChannelsQuery.data])

  const openChatTool = (path: string, title: string) => {
    router.push({ pathname: '/(app)/chat-tools', params: { path, title } })
  }

  const openCreateProject = () =>
    openChatTool('/chats?nativeAux=1&panel=create-project', 'プロジェクトを作成')

  const openCreateMilestone = (channel: ProjectChannelDto) =>
    openChatTool(
      `/chats?nativeAux=1&panel=create-milestone&projectId=${encodeURIComponent(channel.projectId)}&projectTitle=${encodeURIComponent(channel.projectTitle)}`,
      'マイルストーンを作成',
    )

  const openEditMilestone = (channel: ProjectChannelDto) => {
    if (!channel.milestoneId) return
    openChatTool(
      `/chats?nativeAux=1&panel=edit-milestone&milestoneId=${encodeURIComponent(channel.milestoneId)}`,
      'マイルストーンを編集',
    )
  }

  const toggleCompletedMilestones = (projectId: string) => {
    setExpandedCompletedProjects((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
    setRowActionTarget(null)
  }

  const openRenameChannel = (channel: WorkspaceChannelDto) => {
    setRenamingChannel(channel)
    setRowActionTarget(null)
    setChannelName(channel.name ?? '')
    setCreateError(null)
    setCreateMode('rename')
  }

  const confirmDeleteChannel = (channel: WorkspaceChannelDto) => {
    const isThread = channel.parentChannelId != null
    const childThreadCount = (workspaceChannelsQuery.data ?? []).filter(
      (candidate) => candidate.parentChannelId === channel.id,
    ).length
    const copy = workspaceChannelDeleteCopy({
      name: channel.name,
      isThread,
      childThreadCount,
    })
    setRowActionTarget(null)
    Alert.alert(copy.title, copy.message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteChannel.mutate(channel.id, {
            onError: (mutationError) =>
              Alert.alert(
                '削除できませんでした',
                mutationError instanceof Error ? mutationError.message : '再度お試しください。',
              ),
          })
        },
      },
    ])
  }

  const setMilestoneCompleted = (channel: ProjectChannelDto, completed: boolean) => {
    if (!channel.milestoneId || patchMilestone.isPending) return
    setRowActionTarget(null)
    patchMilestone.mutate(
      { projectId: channel.projectId, milestoneId: channel.milestoneId, completed },
      {
        onError: (mutationError) =>
          Alert.alert(
            'マイルストーンを更新できませんでした',
            mutationError instanceof Error ? mutationError.message : '再度お試しください。',
          ),
      },
    )
  }

  if (isLoading || workspaceChannelsQuery.isLoading || dmsQuery.isLoading || meQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    )
  }

  const fetchError =
    error ?? workspaceChannelsQuery.error ?? dmsQuery.error ?? (me ? null : meQuery.error)
  if (fetchError) {
    const isRetrying =
      isFetchingProjectChannels ||
      workspaceChannelsQuery.isFetching ||
      dmsQuery.isFetching ||
      meQuery.isFetching
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorText, { color: palette.redText }]}>{fetchError.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="チャット一覧を再読み込み"
          disabled={isRetrying}
          onPress={() =>
            void Promise.all([
              refetchProjectChannels(),
              workspaceChannelsQuery.refetch(),
              dmsQuery.refetch(),
              meQuery.refetch(),
            ])
          }
          style={[styles.memberRetry, { borderColor: palette.border }]}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={palette.accent} />
          ) : (
            <Text style={[styles.memberRetryText, { color: palette.accentText }]}>再試行</Text>
          )}
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.card, borderBottomColor: palette.border },
        ]}
      >
        <WorkspaceSwitcherButton />
        <Text style={[styles.heading, { color: palette.text }]}>チャット</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="通知"
            style={styles.headerAction}
            onPress={openNotifications}
          >
            <Ionicons name="notifications-outline" size={19} color={palette.text3} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ブックマーク"
            style={styles.headerAction}
            onPress={() =>
              router.push({
                pathname: '/(app)/chat-tools',
                params: {
                  path: '/chats?nativeAux=1&panel=bookmarks',
                  title: 'ブックマーク',
                },
              })
            }
          >
            <Ionicons name="bookmark-outline" size={18} color={palette.text3} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="全チャンネル検索"
            style={styles.headerAction}
            onPress={() =>
              router.push({
                pathname: '/(app)/chat-tools',
                params: {
                  path: '/chats?nativeAux=1&panel=global-search',
                  title: '全チャンネル検索',
                },
              })
            }
          >
            <Ionicons name="search-outline" size={19} color={palette.text3} />
          </Pressable>
          {canCreateAnyChat && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="チャットを作成"
              style={[styles.headerAction, { backgroundColor: palette.card2 }]}
              onPress={() => {
                setCreateError(null)
                setCreateMode('menu')
              }}
            >
              <Ionicons name="add" size={20} color={palette.accent} />
            </Pressable>
          )}
        </View>
      </View>
      <FlatList
        data={projectGroups}
        keyExtractor={({ channel }) => channel.channelId}
        renderItem={({ item }) => (
          <View>
            <ChannelItem
              channel={item.channel}
              {...(canManageChildChats
                ? {
                    onOpenActions: () =>
                      setRowActionTarget({
                        type: 'project',
                        channel: item.channel,
                        completedCount: item.completedMilestones.length,
                      }),
                  }
                : {})}
            />
            {item.activeMilestones.map((milestone) => (
              <ChannelItem
                key={milestone.channelId}
                channel={milestone}
                milestone
                {...(canManageChildChats
                  ? {
                      onOpenActions: () =>
                        setRowActionTarget({ type: 'milestone', channel: milestone }),
                    }
                  : {})}
              />
            ))}
            {expandedCompletedProjects.has(item.channel.projectId) &&
              item.completedMilestones.map((milestone) => (
                <ChannelItem
                  key={milestone.channelId}
                  channel={milestone}
                  milestone
                  {...(canManageChildChats
                    ? {
                        onOpenActions: () =>
                          setRowActionTarget({ type: 'milestone', channel: milestone }),
                      }
                    : {})}
                />
              ))}
          </View>
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>プロジェクト</Text>
          </>
        }
        ListFooterComponent={
          <>
            {archivedProjects.length > 0 && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showArchivedProjects
                      ? 'アーカイブ済みプロジェクトを閉じる'
                      : 'アーカイブ済みプロジェクトを開く'
                  }
                  accessibilityState={{ expanded: showArchivedProjects }}
                  onPress={() => setShowArchivedProjects((current) => !current)}
                  style={styles.collapsibleHeading}
                >
                  <Ionicons
                    name={showArchivedProjects ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color={palette.text4}
                  />
                  <Text style={[styles.sectionTitleText, { color: palette.text4 }]}>
                    アーカイブ済み
                  </Text>
                  <Text style={[styles.sectionCount, { color: palette.text4 }]}>
                    {archivedProjects.length}
                  </Text>
                </Pressable>
                {showArchivedProjects &&
                  archivedProjects.map((channel) => (
                    <ChannelItem key={channel.channelId} channel={channel} />
                  ))}
              </>
            )}
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>チャンネル</Text>
            {workspaceChannelGroups.map(({ channel, threads }) => (
              <React.Fragment key={channel.id}>
                <WorkspaceChannelItem
                  channel={channel}
                  {...(canManageChildChats
                    ? { onOpenActions: () => setRowActionTarget({ type: 'workspace', channel }) }
                    : {})}
                />
                {threads.map((thread) => (
                  <WorkspaceChannelItem
                    key={thread.id}
                    channel={thread}
                    thread
                    {...(canManageChildChats
                      ? { onOpenActions: () => setRowActionTarget({ type: 'workspace', channel: thread }) }
                      : {})}
                  />
                ))}
              </React.Fragment>
            ))}
            {FEATURE_FLAGS.dm && (
              <>
                <Text style={[styles.sectionTitle, { color: palette.text4 }]}>
                  ダイレクトメッセージ
                </Text>
                {(dmsQuery.data ?? []).map((channel) => (
                  <DirectMessageItem key={channel.id} channel={channel} />
                ))}
              </>
            )}
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>アプリ</Text>
            <TouchableOpacity
              style={[styles.channelRow, { borderBottomColor: palette.divider }]}
              onPress={() => router.push('/(app)/ai')}
              activeOpacity={0.7}
            >
              <View style={[styles.channelIcon, { backgroundColor: palette.accentSoft }]}>
                <Text style={[styles.channelIconText, { color: palette.accentText }]}>✨</Text>
              </View>
              <Text style={[styles.channelName, styles.rowLabel, { color: palette.text }]}>
                AIアシスタント
              </Text>
              <Ionicons name="chevron-forward" size={16} color={palette.text4} />
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: palette.text4 }]}>
            プロジェクトチャンネルがありません
          </Text>
        }
      />

      <Modal
        transparent
        visible={createMode !== null}
        animationType="fade"
        onRequestClose={() => setCreateMode(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateMode(null)} />
        <View
          style={[
            styles.createSheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={[styles.sheetGrip, { backgroundColor: palette.border }]} />
          <View style={styles.createHeader}>
            {createMode !== 'menu' && createMode !== 'rename' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="作成メニューへ戻る"
                onPress={() => {
                  setCreateError(null)
                  setCreateMode('menu')
                }}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={palette.text2} />
              </Pressable>
            )}
            <Text style={[styles.createTitle, { color: palette.text }]}>
              {createMode === 'channel'
                ? 'チャンネルを作成'
                : createMode === 'thread'
                  ? 'スレッドを作成'
                  : createMode === 'rename'
                    ? renamingChannel?.parentChannelId
                      ? 'スレッド名を変更'
                      : 'チャンネル名を変更'
                    : createMode === 'dm'
                      ? 'DMを開始'
                      : '新しいチャット'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="作成画面を閉じる"
              onPress={() => setCreateMode(null)}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={palette.text3} />
            </Pressable>
          </View>

          {createError && (
            <Text style={[styles.createError, { color: palette.redText }]}>{createError}</Text>
          )}

          {createMode === 'menu' && (
            <>
              {canCreateAdminResources && (
                <>
                  <CreateMenuButton
                    icon="folder-open-outline"
                    label="プロジェクトを作成"
                    palette={palette}
                    onPress={() => {
                      setCreateMode(null)
                      openCreateProject()
                    }}
                  />
                  <CreateMenuButton
                    icon="chatbubbles-outline"
                    label="チャンネルを作成"
                    palette={palette}
                    onPress={() => setCreateMode('channel')}
                  />
                </>
              )}
              {FEATURE_FLAGS.dm && (
                <CreateMenuButton
                  icon="person-add-outline"
                  label="ダイレクトメッセージを開始"
                  palette={palette}
                  onPress={() => setCreateMode('dm')}
                />
              )}
            </>
          )}

          {createMode === 'channel' && (
            <View style={styles.channelForm}>
              <TextInput
                autoFocus
                value={channelName}
                onChangeText={(value) => {
                  setChannelName(value)
                  setCreateError(null)
                }}
                placeholder="チャンネル名"
                placeholderTextColor={palette.text4}
                style={[
                  styles.channelInput,
                  {
                    color: palette.text,
                    backgroundColor: palette.card2,
                    borderColor: palette.border,
                  },
                ]}
              />
              <View style={styles.privateRow}>
                <View style={styles.privateCopy}>
                  <Text style={[styles.privateTitle, { color: palette.text }]}>
                    非公開チャンネル
                  </Text>
                  <Text style={[styles.privateDescription, { color: palette.text3 }]}>
                    招待されたメンバーだけが参加できます
                  </Text>
                </View>
                <Switch
                  value={privateChannel}
                  onValueChange={setPrivateChannel}
                  trackColor={{ true: palette.accent }}
                />
              </View>
              <Pressable
                disabled={!channelName.trim() || createChannel.isPending}
                style={[
                  styles.createSubmit,
                  {
                    backgroundColor: palette.accent,
                    opacity: !channelName.trim() || createChannel.isPending ? 0.45 : 1,
                  },
                ]}
                onPress={() => {
                  createChannel.mutate(
                    { name: channelName.trim(), isPrivate: privateChannel },
                    {
                      onSuccess: (channel) => {
                        setCreateMode(null)
                        setChannelName('')
                        setPrivateChannel(false)
                        router.push({
                          pathname: '/chats/[channelId]',
                          params: {
                            channelId: channel.id,
                            channelName: channel.name ?? 'チャンネル',
                            channelType: 'workspace',
                            isPrivate: channel.isPrivate ? '1' : '0',
                          },
                        })
                      },
                      onError: (error) =>
                        setCreateError(
                          error instanceof Error ? error.message : 'チャンネルの作成に失敗しました',
                        ),
                    },
                  )
                }}
              >
                {createChannel.isPending ? (
                  <ActivityIndicator size="small" color={palette.onAccent} />
                ) : (
                  <Text style={[styles.createSubmitText, { color: palette.onAccent }]}>作成</Text>
                )}
              </Pressable>
            </View>
          )}

          {createMode === 'thread' && threadParent && (
            <View style={styles.channelForm}>
              <Text style={[styles.formContext, { color: palette.text3 }]}>
                # {threadParent.name}
              </Text>
              <TextInput
                autoFocus
                value={channelName}
                maxLength={60}
                onChangeText={(value) => {
                  setChannelName(value)
                  setCreateError(null)
                }}
                placeholder="スレッド名"
                placeholderTextColor={palette.text4}
                style={[
                  styles.channelInput,
                  {
                    color: palette.text,
                    backgroundColor: palette.card2,
                    borderColor: palette.border,
                  },
                ]}
              />
              <Pressable
                disabled={!channelName.trim() || createThread.isPending}
                style={[
                  styles.createSubmit,
                  {
                    backgroundColor: palette.accent,
                    opacity: !channelName.trim() || createThread.isPending ? 0.45 : 1,
                  },
                ]}
                onPress={() => {
                  createThread.mutate(
                    { channelId: threadParent.id, name: channelName.trim() },
                    {
                      onSuccess: ({ id }) => {
                        const name = channelName.trim()
                        setCreateMode(null)
                        setThreadParent(null)
                        setChannelName('')
                        router.push({
                          pathname: '/chats/[channelId]',
                          params: {
                            channelId: id,
                            channelName: name,
                            channelType: 'workspace',
                            isPrivate: threadParent.isPrivate ? '1' : '0',
                          },
                        })
                      },
                      onError: (mutationError) =>
                        setCreateError(
                          mutationError instanceof Error
                            ? mutationError.message
                            : 'スレッドの作成に失敗しました',
                        ),
                    },
                  )
                }}
              >
                {createThread.isPending ? (
                  <ActivityIndicator size="small" color={palette.onAccent} />
                ) : (
                  <Text style={[styles.createSubmitText, { color: palette.onAccent }]}>作成</Text>
                )}
              </Pressable>
            </View>
          )}

          {createMode === 'rename' && renamingChannel && (
            <View style={styles.channelForm}>
              <TextInput
                autoFocus
                value={channelName}
                maxLength={60}
                onChangeText={(value) => {
                  setChannelName(value)
                  setCreateError(null)
                }}
                placeholder={renamingChannel.parentChannelId ? 'スレッド名' : 'チャンネル名'}
                placeholderTextColor={palette.text4}
                style={[
                  styles.channelInput,
                  {
                    color: palette.text,
                    backgroundColor: palette.card2,
                    borderColor: palette.border,
                  },
                ]}
              />
              <Pressable
                disabled={!channelName.trim() || renameChannel.isPending}
                style={[
                  styles.createSubmit,
                  {
                    backgroundColor: palette.accent,
                    opacity: !channelName.trim() || renameChannel.isPending ? 0.45 : 1,
                  },
                ]}
                onPress={() => {
                  const target = renamingChannel
                  renameChannel.mutate(
                    { channelId: target.id, name: channelName.trim() },
                    {
                      onSuccess: () => {
                        setCreateMode(null)
                        setRenamingChannel(null)
                        setChannelName('')
                      },
                      onError: (mutationError) =>
                        setCreateError(
                          mutationError instanceof Error
                            ? mutationError.message
                            : '名前の変更に失敗しました',
                        ),
                    },
                  )
                }}
              >
                {renameChannel.isPending ? (
                  <ActivityIndicator size="small" color={palette.onAccent} />
                ) : (
                  <Text style={[styles.createSubmitText, { color: palette.onAccent }]}>保存</Text>
                )}
              </Pressable>
            </View>
          )}

          {createMode === 'dm' && (
            <ScrollView style={styles.memberList}>
              {membersQuery.isLoading && <ActivityIndicator size="small" color={palette.accent} />}
              {membersQuery.error ? (
                <View style={styles.memberError}>
                  <Text style={[styles.memberErrorText, { color: palette.redText }]}>
                    {membersQuery.error.message}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="メンバーを再読み込み"
                    disabled={membersQuery.isFetching}
                    onPress={() => void membersQuery.refetch()}
                    style={[styles.memberRetry, { borderColor: palette.border }]}
                  >
                    {membersQuery.isFetching ? (
                      <ActivityIndicator size="small" color={palette.accent} />
                    ) : (
                      <Text style={[styles.memberRetryText, { color: palette.accentText }]}>
                        再試行
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                (membersQuery.data ?? [])
                  .filter((member) => member.userId !== me?.id)
                  .map((member) => (
                    <Pressable
                      key={member.userId}
                      disabled={createDm.isPending}
                      style={[styles.memberRow, { borderTopColor: palette.divider }]}
                      onPress={() =>
                        createDm.mutate(member.userId, {
                          onSuccess: ({ id }) => {
                            setCreateMode(null)
                            router.push({
                              pathname: '/chats/[channelId]',
                              params: {
                                channelId: id,
                                channelName: member.displayName,
                                channelType: 'dm',
                              },
                            })
                          },
                          onError: (error) =>
                            setCreateError(
                              error instanceof Error ? error.message : 'DMの開始に失敗しました',
                            ),
                        })
                      }
                    >
                      {member.avatarUrl ? (
                        <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatar} />
                      ) : (
                        <View
                          style={[
                            styles.memberAvatar,
                            styles.avatarFallback,
                            { backgroundColor: palette.accentSoft },
                          ]}
                        >
                          <Text style={{ color: palette.accentText }}>
                            {member.displayName.slice(0, 1)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.memberCopy}>
                        <Text style={[styles.memberName, { color: palette.text }]}>
                          {member.displayName}
                        </Text>
                        {member.email && (
                          <Text style={[styles.memberEmail, { color: palette.text3 }]}>
                            {member.email}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
                    </Pressable>
                  ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        transparent
        visible={rowActionTarget !== null}
        animationType="fade"
        onRequestClose={() => setRowActionTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRowActionTarget(null)} />
        <View
          style={[
            styles.actionSheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={[styles.sheetGrip, { backgroundColor: palette.border }]} />
          {rowActionTarget?.type === 'project' && (
            <>
              <ActionSheetButton
                icon="flag-outline"
                label="マイルストーンを作成"
                palette={palette}
                onPress={() => {
                  const channel = rowActionTarget.channel
                  setRowActionTarget(null)
                  openCreateMilestone(channel)
                }}
              />
              {rowActionTarget.completedCount > 0 && (
                <ActionSheetButton
                  icon={
                    expandedCompletedProjects.has(rowActionTarget.channel.projectId)
                      ? 'eye-off-outline'
                      : 'eye-outline'
                  }
                  label={`完了済みマイルストーンを${
                    expandedCompletedProjects.has(rowActionTarget.channel.projectId)
                      ? '非表示'
                      : '表示'
                  }`}
                  palette={palette}
                  onPress={() => toggleCompletedMilestones(rowActionTarget.channel.projectId)}
                />
              )}
            </>
          )}
          {rowActionTarget?.type === 'milestone' && (
            <>
              {rowActionTarget.channel.milestoneCompleted !== true && (
                <ActionSheetButton
                  icon="create-outline"
                  label="編集"
                  palette={palette}
                  onPress={() => {
                    const channel = rowActionTarget.channel
                    setRowActionTarget(null)
                    openEditMilestone(channel)
                  }}
                />
              )}
              <ActionSheetButton
                icon={
                  rowActionTarget.channel.milestoneCompleted
                    ? 'refresh-outline'
                    : 'checkmark-circle-outline'
                }
                label={rowActionTarget.channel.milestoneCompleted ? '未完了にする' : '完了にする'}
                palette={palette}
                onPress={() =>
                  setMilestoneCompleted(
                    rowActionTarget.channel,
                    rowActionTarget.channel.milestoneCompleted !== true,
                  )
                }
              />
            </>
          )}
          {rowActionTarget?.type === 'workspace' && (
            <>
              {rowActionTarget.channel.parentChannelId == null && (
                <ActionSheetButton
                  icon="chatbubble-ellipses-outline"
                  label="スレッドを作成"
                  palette={palette}
                  onPress={() => {
                    setThreadParent(rowActionTarget.channel)
                    setRowActionTarget(null)
                    setChannelName('')
                    setCreateError(null)
                    setCreateMode('thread')
                  }}
                />
              )}
              {(rowActionTarget.channel.parentChannelId != null || canCreateAdminResources) && (
                <>
                  <ActionSheetButton
                    icon="create-outline"
                    label="名前を変更"
                    palette={palette}
                    onPress={() => openRenameChannel(rowActionTarget.channel)}
                  />
                  <ActionSheetButton
                    icon="trash-outline"
                    label="削除"
                    palette={palette}
                    danger
                    onPress={() => confirmDeleteChannel(rowActionTarget.channel)}
                  />
                </>
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  )
}

function ActionSheetButton({
  icon,
  label,
  palette,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  palette: ThemePalette
  onPress: () => void
  danger?: boolean
}) {
  const color = danger ? palette.redText : palette.text
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.actionSheetButton, { borderTopColor: palette.divider }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={danger ? palette.redText : palette.text2} />
      <Text style={[styles.actionSheetLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

function CreateMenuButton({
  icon,
  label,
  palette,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  palette: ThemePalette
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.createMenuButton, { borderTopColor: palette.divider }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={palette.accent} />
      <Text style={[styles.createMenuLabel, { color: palette.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  heading: { fontSize: 17, fontWeight: '700' },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 1 },
  headerAction: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingTop: 8, paddingBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  collapsibleHeading: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  sectionTitleText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  sectionCount: { fontSize: 11, fontWeight: '600' },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  threadRow: { paddingLeft: 34 },
  channelIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconText: { fontSize: 18, fontWeight: '600' },
  channelCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { flex: 1 },
  channelName: { fontSize: 15, fontWeight: '600' },
  projectTitle: { fontSize: 12 },
  badge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', marginTop: 48 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  createSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  sheetGrip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 7 },
  createHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  createTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  createError: { fontSize: 12, marginBottom: 8 },
  formContext: { fontSize: 12.5, fontWeight: '600' },
  createMenuButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
  },
  createMenuLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  channelForm: { gap: 14, paddingTop: 6 },
  channelInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  privateCopy: { flex: 1 },
  privateTitle: { fontSize: 14, fontWeight: '600' },
  privateDescription: { fontSize: 11.5, marginTop: 2 },
  createSubmit: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  createSubmitText: { fontSize: 14, fontWeight: '700' },
  memberList: { maxHeight: 430 },
  memberError: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 24 },
  memberErrorText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  memberRetry: {
    minWidth: 88,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
  },
  memberRetryText: { fontSize: 13, fontWeight: '700' },
  memberRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberEmail: { fontSize: 11.5, marginTop: 2 },
  actionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  actionSheetButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  actionSheetLabel: { fontSize: 15, fontWeight: '600' },
})
