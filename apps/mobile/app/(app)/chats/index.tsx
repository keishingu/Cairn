import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useProjectChannels } from '../../../hooks/use-projects'
import type { ProjectChannelDto } from '../../../hooks/use-projects'

function ChannelItem({ channel }: { channel: ProjectChannelDto }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/projects/${channel.projectId}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.channelName}>#{channel.channelName}</Text>
        <Text style={styles.projectTitle} numberOfLines={1}>{channel.projectTitle}</Text>
      </View>
      {channel.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{channel.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function ChatsScreen() {
  const { data: channels, isLoading, error } = useProjectChannels()
  // アーカイブ済みプロジェクトはモバイルのチャット一覧には表示しない
  const visibleChannels = channels?.filter(c => !c.archived)

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>チャット</Text>
      <FlatList
        data={visibleChannels}
        keyExtractor={c => c.channelId}
        renderItem={({ item }) => <ChannelItem channel={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>チャンネルがありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  heading: { fontSize: 22, fontWeight: '700', padding: 16, paddingBottom: 8 },
  list: { padding: 12, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1, gap: 2 },
  channelName: { fontSize: 15, fontWeight: '600', color: '#111' },
  projectTitle: { fontSize: 12, color: '#888' },
  badge: {
    backgroundColor: '#0070f3',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
})
