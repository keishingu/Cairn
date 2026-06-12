import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProjectChannels } from '../../../hooks/use-projects'
import type { ProjectChannelDto } from '../../../hooks/use-projects'
import { THEME } from '../../../lib/theme'
import type { Theme } from '../../../lib/theme'

function ChannelItem({ channel, c }: { channel: ProjectChannelDto; c: Theme }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={() =>
        router.push({
          pathname: '/(app)/chats/[channelId]',
          params: {
            channelId: channel.channelId,
            name: channel.channelName,
            project: channel.projectTitle,
          },
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.cardLeft}>
        <Text style={[styles.channelName, { color: c.text }]}>#{channel.channelName}</Text>
        <Text style={[styles.projectTitle, { color: c.text4 }]} numberOfLines={1}>{channel.projectTitle}</Text>
      </View>
      {channel.unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: c.accent }]}>
          <Text style={[styles.badgeText, { color: c.onAccent }]}>{channel.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function ChatsScreen() {
  const { data: channels, isLoading, error } = useProjectChannels()
  const insets = useSafeAreaInsets()
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? THEME.dark : THEME.light

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.errorText, { color: c.redText }]}>{error.message}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <Text style={[styles.heading, { color: c.text }]}>チャット</Text>
      <FlatList
        data={channels}
        keyExtractor={ch => ch.channelId}
        renderItem={({ item }) => <ChannelItem channel={item} c={c} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: c.text4 }]}>チャンネルがありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '700', padding: 16, paddingBottom: 8 },
  list: { padding: 12, gap: 8 },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1, gap: 2 },
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', marginTop: 48 },
})
