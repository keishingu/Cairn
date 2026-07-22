import React from 'react'
import { FEATURE_FLAGS } from '@cairn/shared'
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProjectChannels } from '../../../hooks/use-projects'
import type { ProjectChannelDto } from '../../../hooks/use-projects'
import {
  useCreateWorkspaceChannel,
  useCreateWorkspaceDm,
  useWorkspaceChannels,
  useWorkspaceDms,
  useWorkspaceMembers,
} from '../../../hooks/use-chat-channels'
import type { DmChannelDto, WorkspaceChannelDto } from '../../../hooks/use-chat-channels'
import type { ThemePalette } from '../../../lib/theme'
import { formatChannelPeriod } from '../../../lib/channel-period'
import { useAppAppearance } from '../../../components/appearance-provider'
import { useMe } from '../../../hooks/use-account'

type ChannelItemProps = {
  channel: ProjectChannelDto
  milestone?: boolean
}

function ChannelItem({ channel, milestone = false }: ChannelItemProps) {
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
          },
        })
      }
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

function WorkspaceChannelItem({ channel }: { channel: WorkspaceChannelDto }) {
  const router = useRouter()
  const { palette } = useAppAppearance()
  const privateChannel = channel.isPrivate
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() =>
        router.push({
          pathname: '/chats/[channelId]',
          params: { channelId: channel.id, channelName: channel.name ?? 'チャンネル' },
        })
      }
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.channelIcon,
          { backgroundColor: privateChannel ? palette.card2 : palette.accentSoft },
        ]}
      >
        {privateChannel ? (
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
          params: { channelId: channel.id, channelName: channel.participantName },
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

export default function ChatsScreen() {
  const router = useRouter()
  const { data: channels, isLoading, error } = useProjectChannels()
  const workspaceChannelsQuery = useWorkspaceChannels()
  const dmsQuery = useWorkspaceDms()
  const membersQuery = useWorkspaceMembers()
  const createChannel = useCreateWorkspaceChannel()
  const createDm = useCreateWorkspaceDm()
  const { data: me } = useMe()
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const [createMode, setCreateMode] = React.useState<'menu' | 'channel' | 'dm' | null>(null)
  const [channelName, setChannelName] = React.useState('')
  const [privateChannel, setPrivateChannel] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  // Web の ChannelList と同じく、通常チャンネルの直下に未完了マイルストーンを並べる。
  const projectGroups = React.useMemo(() => {
    const active = (channels ?? []).filter((channel) => !channel.archived)
    return active
      .filter((channel) => channel.milestoneId === null)
      .map((channel) => ({
        channel,
        milestones: active.filter(
          (candidate) =>
            candidate.projectId === channel.projectId &&
            candidate.milestoneId !== null &&
            candidate.milestoneCompleted !== true,
        ),
      }))
  }, [channels])

  if (isLoading || workspaceChannelsQuery.isLoading || dmsQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    )
  }

  const fetchError = error ?? workspaceChannelsQuery.error ?? dmsQuery.error
  if (fetchError) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[styles.errorText, { color: palette.redText }]}>{fetchError.message}</Text>
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
        <View style={[styles.headerIcon, { backgroundColor: palette.accentSoft }]}>
          <Ionicons name="chatbubble-outline" size={17} color={palette.accentText} />
        </View>
        <Text style={[styles.heading, { color: palette.text }]}>チャット</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="通知"
            style={styles.headerAction}
            onPress={() => router.push('/(app)/notifications')}
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
        </View>
      </View>
      <FlatList
        data={projectGroups}
        keyExtractor={({ channel }) => channel.channelId}
        renderItem={({ item }) => (
          <View>
            <ChannelItem channel={item.channel} />
            {item.milestones.map((milestone) => (
              <ChannelItem key={milestone.channelId} channel={milestone} milestone />
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
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>チャンネル</Text>
            {(workspaceChannelsQuery.data ?? []).map((channel) => (
              <WorkspaceChannelItem key={channel.id} channel={channel} />
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
            {createMode !== 'menu' && (
              <Pressable
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
                : createMode === 'dm'
                  ? 'DMを開始'
                  : '新しいチャット'}
            </Text>
            <Pressable onPress={() => setCreateMode(null)} hitSlop={8}>
              <Ionicons name="close" size={22} color={palette.text3} />
            </Pressable>
          </View>

          {createError && (
            <Text style={[styles.createError, { color: palette.redText }]}>{createError}</Text>
          )}

          {createMode === 'menu' && (
            <>
              <CreateMenuButton
                icon="chatbubbles-outline"
                label="チャンネルを作成"
                palette={palette}
                onPress={() => setCreateMode('channel')}
              />
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

          {createMode === 'dm' && (
            <ScrollView style={styles.memberList}>
              {membersQuery.isLoading && <ActivityIndicator size="small" color={palette.accent} />}
              {(membersQuery.data ?? [])
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
                            params: { channelId: id, channelName: member.displayName },
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
                ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
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
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
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
})
