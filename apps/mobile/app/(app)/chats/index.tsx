import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProjectChannels } from '../../../hooks/use-projects'
import type { ProjectChannelDto } from '../../../hooks/use-projects'
import { useWorkspaceChannels, useWorkspaceDms } from '../../../hooks/use-chat-channels'
import type { DmChannelDto, WorkspaceChannelDto } from '../../../hooks/use-chat-channels'
import { THEME } from '../../../lib/theme'

type ChannelItemProps = {
  channel: ProjectChannelDto
  milestone?: boolean
}

function ChannelItem({ channel, milestone = false }: ChannelItemProps) {
  const router = useRouter()
  const palette = THEME[useColorScheme() === 'dark' ? 'dark' : 'light']
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() =>
        router.push({
          pathname: '/chats/[channelId]',
          params: { channelId: channel.channelId, channelName: milestone ? channel.channelName : channel.projectTitle },
        })
      }
      activeOpacity={0.7}
    >
      <View style={[styles.channelIcon, milestone ? { backgroundColor: palette.card2 } : { backgroundColor: palette.accentSoft }]}>
        <Text style={[styles.channelIconText, { color: milestone ? palette.text3 : palette.accentText }]}>{milestone ? '┗' : '#'}</Text>
      </View>
      <View style={styles.channelCopy}>
        <Text style={[styles.channelName, { color: palette.text }]} numberOfLines={1}>
          {milestone ? channel.channelName : channel.projectTitle}
        </Text>
        {!milestone && <Text style={[styles.projectTitle, { color: palette.text3 }]} numberOfLines={1}>プロジェクトチャンネル</Text>}
      </View>
      {channel.unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: palette.accent }]}>
          <Text style={[styles.badgeText, { color: palette.onAccent }]}>{channel.unreadCount > 99 ? '99+' : channel.unreadCount}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function WorkspaceChannelItem({ channel }: { channel: WorkspaceChannelDto }) {
  const router = useRouter()
  const palette = THEME[useColorScheme() === 'dark' ? 'dark' : 'light']
  const privateChannel = channel.isPrivate
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() => router.push({ pathname: '/chats/[channelId]', params: { channelId: channel.id, channelName: channel.name ?? 'チャンネル' } })}
      activeOpacity={0.7}
    >
      <View style={[styles.channelIcon, { backgroundColor: privateChannel ? palette.card2 : palette.accentSoft }]}>
        {privateChannel
          ? <Ionicons name="lock-closed-outline" size={17} color={palette.text3} />
          : <Text style={[styles.channelIconText, { color: palette.accentText }]}>#</Text>
        }
      </View>
      <Text style={[styles.channelName, styles.rowLabel, { color: palette.text }]} numberOfLines={1}>{channel.name ?? '名称未設定チャンネル'}</Text>
      {channel.unreadCount > 0 && <UnreadBadge count={channel.unreadCount} palette={palette} />}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function DirectMessageItem({ channel }: { channel: DmChannelDto }) {
  const router = useRouter()
  const palette = THEME[useColorScheme() === 'dark' ? 'dark' : 'light']
  return (
    <TouchableOpacity
      style={[styles.channelRow, { borderBottomColor: palette.divider }]}
      onPress={() => router.push({ pathname: '/chats/[channelId]', params: { channelId: channel.id, channelName: channel.participantName } })}
      activeOpacity={0.7}
    >
      {channel.participantAvatarUrl
        ? <Image source={{ uri: channel.participantAvatarUrl }} style={styles.avatar} />
        : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.accentSoft }]}><Text style={[styles.avatarInitial, { color: palette.accentText }]}>{channel.participantName.slice(0, 1)}</Text></View>
      }
      <Text style={[styles.channelName, styles.rowLabel, { color: palette.text }]} numberOfLines={1}>{channel.participantName}</Text>
      {channel.unreadCount > 0 && <UnreadBadge count={channel.unreadCount} palette={palette} />}
      <Ionicons name="chevron-forward" size={16} color={palette.text4} />
    </TouchableOpacity>
  )
}

function UnreadBadge({ count, palette }: { count: number; palette: (typeof THEME)[keyof typeof THEME] }) {
  return <View style={[styles.badge, { backgroundColor: palette.accent }]}><Text style={[styles.badgeText, { color: palette.onAccent }]}>{count > 99 ? '99+' : count}</Text></View>
}

export default function ChatsScreen() {
  const router = useRouter()
  const { data: channels, isLoading, error } = useProjectChannels()
  const workspaceChannelsQuery = useWorkspaceChannels()
  const dmsQuery = useWorkspaceDms()
  const insets = useSafeAreaInsets()
  const palette = THEME[useColorScheme() === 'dark' ? 'dark' : 'light']
  // Web の ChannelList と同じく、通常チャンネルの直下に未完了マイルストーンを並べる。
  const projectGroups = React.useMemo(() => {
    const active = (channels ?? []).filter(channel => !channel.archived)
    return active
      .filter(channel => channel.milestoneId === null)
      .map(channel => ({
        channel,
        milestones: active.filter(candidate => candidate.projectId === channel.projectId && candidate.milestoneId !== null && candidate.milestoneCompleted !== true),
      }))
  }, [channels])

  if (isLoading || workspaceChannelsQuery.isLoading || dmsQuery.isLoading) {
    return <View style={[styles.center, { backgroundColor: palette.bg }]}><ActivityIndicator size="large" color={palette.accent} /></View>
  }

  const fetchError = error ?? workspaceChannelsQuery.error ?? dmsQuery.error
  if (fetchError) {
    return <View style={[styles.center, { backgroundColor: palette.bg }]}><Text style={[styles.errorText, { color: palette.redText }]}>{fetchError.message}</Text></View>
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <View style={[styles.headerIcon, { backgroundColor: palette.accentSoft }]}>
          <Ionicons name="chatbubble-outline" size={17} color={palette.accentText} />
        </View>
        <Text style={[styles.heading, { color: palette.text }]}>チャット</Text>
      </View>
      <FlatList
        data={projectGroups}
        keyExtractor={({ channel }) => channel.channelId}
        renderItem={({ item }) => (
          <View>
            <ChannelItem channel={item.channel} />
            {item.milestones.map(milestone => <ChannelItem key={milestone.channelId} channel={milestone} milestone />)}
          </View>
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <>
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>プロジェクト</Text>
          </>
        )}
        ListFooterComponent={(
          <>
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>チャンネル</Text>
            {(workspaceChannelsQuery.data ?? []).map(channel => <WorkspaceChannelItem key={channel.id} channel={channel} />)}
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>ダイレクトメッセージ</Text>
            {(dmsQuery.data ?? []).map(channel => <DirectMessageItem key={channel.id} channel={channel} />)}
            <Text style={[styles.sectionTitle, { color: palette.text4 }]}>アプリ</Text>
            <TouchableOpacity style={[styles.channelRow, { borderBottomColor: palette.divider }]} onPress={() => router.push('/(app)/ai')} activeOpacity={0.7}>
              <View style={[styles.channelIcon, { backgroundColor: palette.accentSoft }]}><Text style={[styles.channelIconText, { color: palette.accentText }]}>✨</Text></View>
              <Text style={[styles.channelName, styles.rowLabel, { color: palette.text }]}>AIアシスタント</Text>
              <Ionicons name="chevron-forward" size={16} color={palette.text4} />
            </TouchableOpacity>
          </>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: palette.text4 }]}>プロジェクトチャンネルがありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  headerIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 17, fontWeight: '700' },
  list: { paddingTop: 8, paddingBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, paddingHorizontal: 16, paddingVertical: 8 },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  channelIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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
})
