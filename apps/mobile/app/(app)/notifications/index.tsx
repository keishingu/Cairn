import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMarkNotificationsRead, useNotifications, type NotificationDto } from '../../../hooks/use-notifications'

function routeFromUrl(url: string) {
  if (url.startsWith('/chat')) return '/(app)/chats'
  if (url.startsWith('/tasks')) return '/(app)/tasks'
  if (url.startsWith('/ai')) return '/(app)/ai'
  if (url.startsWith('/files')) return '/(app)/files'
  if (url.startsWith('/gallery')) return '/(app)/gallery'
  if (url.startsWith('/members')) return '/(app)/members'
  if (url.startsWith('/settings')) return '/(app)/settings'
  return '/(app)/projects'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function NotificationCard({
  item,
  onPress,
}: {
  item: NotificationDto
  onPress: (item: NotificationDto) => void
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, !item.readAt && styles.cardUnread]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardBody}>{item.body}</Text>
      {!item.readAt ? <Text style={styles.unreadBadge}>未読</Text> : null}
    </Pressable>
  )
}

export default function NotificationsScreen() {
  const router = useRouter()
  const notificationsQuery = useNotifications()
  const markRead = useMarkNotificationsRead()
  const notifications = notificationsQuery.data ?? []

  function handlePress(item: NotificationDto) {
    if (!item.readAt) {
      markRead.mutate([item.id])
    }
    const url = item.data?.['url']
    router.push(url ? routeFromUrl(url) : '/(app)/projects')
  }

  if (notificationsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.heading}>通知</Text>
        <Pressable
          disabled={markRead.isPending || notifications.every((item) => item.readAt)}
          onPress={() => markRead.mutate(null)}
          style={({ pressed }) => [styles.markAllButton, pressed && styles.markAllButtonPressed]}
        >
          <Text style={styles.markAllLabel}>すべて既読</Text>
        </Pressable>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => void notificationsQuery.refetch()}
            tintColor="#2563EB"
          />
        }
        renderItem={({ item }) => <NotificationCard item={item} onPress={handlePress} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>通知はまだありません</Text>
            <Text style={styles.emptyBody}>メンションや更新が届くとここに表示されます。</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  markAllButton: {
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllButtonPressed: { opacity: 0.8 },
  markAllLabel: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
  },
  cardPressed: { opacity: 0.9 },
  cardUnread: { borderColor: '#93C5FD', backgroundColor: '#F8FBFF' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardDate: { fontSize: 12, color: '#64748B' },
  cardBody: { fontSize: 14, lineHeight: 20, color: '#334155' },
  unreadBadge: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  emptyState: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptyBody: { fontSize: 14, lineHeight: 20, color: '#64748B', textAlign: 'center' },
})
