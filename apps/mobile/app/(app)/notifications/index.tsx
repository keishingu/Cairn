import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useNotifications, useMarkNotificationsRead } from '../../../hooks/use-notifications'
import type { NotificationDto } from '../../../hooks/use-notifications'

const TYPE_LABEL: Record<NotificationDto['type'], string> = {
  mention: 'メンション',
  task: 'タスク',
  file: 'ファイル',
  status: 'ステータス',
  invite: '招待',
  reaction: 'リアクション',
  ai: 'AI',
}

function NotificationItem({ item, onRead }: { item: NotificationDto; onRead: () => void }) {
  const isUnread = item.readAt === null
  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={onRead}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{TYPE_LABEL[item.type]}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
    </TouchableOpacity>
  )
}

export default function NotificationsScreen() {
  const { data: notifications, isLoading, error } = useNotifications()
  const markRead = useMarkNotificationsRead()

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>通知</Text>
        {notifications?.some(n => n.readAt === null) && (
          <TouchableOpacity onPress={() => markRead.mutate(null)} disabled={markRead.isPending}>
            <Text style={styles.markAllRead}>すべて既読</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        renderItem={({ item }) => (
          <NotificationItem
            item={item}
            onRead={() => {
              if (item.readAt === null) markRead.mutate([item.id] as string[])
            }}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>通知はありません</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  heading: { fontSize: 22, fontWeight: '700' },
  markAllRead: { fontSize: 14, color: '#0070f3' },
  list: { padding: 12, gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e8e8e8' },
  cardUnread: { borderColor: '#0070f3', backgroundColor: '#f0f7ff' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  typeBadge: { backgroundColor: '#e8e8e8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 11, color: '#555', fontWeight: '500' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0070f3' },
  timestamp: { fontSize: 11, color: '#999', marginLeft: 'auto' },
  title: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 2 },
  body: { fontSize: 13, color: '#555', lineHeight: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
})
