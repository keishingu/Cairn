import React from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
  type NotificationDto,
} from '../hooks/use-notifications'
import { routeFromNotification } from '../lib/notification-routing'
import { useAppAppearance } from './appearance-provider'

interface NotificationPanelContextValue {
  unreadCount: number
  openNotifications: () => void
  closeNotifications: () => void
}

const NotificationPanelContext = React.createContext<NotificationPanelContextValue | null>(null)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function NotificationPanelProvider({ children }: React.PropsWithChildren) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { palette } = useAppAppearance()
  const notificationsQuery = useNotifications()
  const unreadCountQuery = useUnreadNotificationCount()
  const markRead = useMarkNotificationsRead()
  const [visible, setVisible] = React.useState(false)
  const [reduceMotion, setReduceMotion] = React.useState(false)
  const progress = React.useRef(new Animated.Value(1)).current
  const notifications = notificationsQuery.data ?? []
  const unreadCount =
    unreadCountQuery.data ?? notifications.filter((item) => item.readAt === null).length
  const panelWidth = Math.min(400, Math.max(0, width - 24))

  React.useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])

  const openNotifications = React.useCallback(() => {
    progress.setValue(1)
    setVisible(true)
    requestAnimationFrame(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduceMotion ? 0 : 220,
        useNativeDriver: true,
      }).start()
    })
  }, [progress, reduceMotion])

  const closeNotifications = React.useCallback(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setVisible(false)
    })
  }, [progress, reduceMotion])

  const handleNotification = (item: NotificationDto) => {
    if (!item.readAt) markRead.mutate([item.id])
    closeNotifications()
    router.push(routeFromNotification(item))
  }

  const contextValue = React.useMemo(
    () => ({ unreadCount, openNotifications, closeNotifications }),
    [closeNotifications, openNotifications, unreadCount],
  )

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, panelWidth],
  })
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.36, 0],
  })

  return (
    <NotificationPanelContext.Provider value={contextValue}>
      {children}
      <Modal
        transparent
        visible={visible}
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeNotifications}
      >
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="通知を閉じる"
              style={StyleSheet.absoluteFill}
              onPress={closeNotifications}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              {
                width: panelWidth,
                backgroundColor: palette.bg,
                transform: [{ translateX }],
              },
            ]}
          >
            <View
              style={[
                styles.safeArea,
                {
                  paddingTop: insets.top,
                  paddingRight: insets.right,
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              <View
                style={[
                  styles.panelHeader,
                  { backgroundColor: palette.card, borderBottomColor: palette.border },
                ]}
              >
                <View style={styles.titleRow}>
                  <View style={[styles.titleIcon, { backgroundColor: palette.accentSoft }]}>
                    <Ionicons name="notifications-outline" size={17} color={palette.accentText} />
                  </View>
                  <Text style={[styles.title, { color: palette.text }]}>通知</Text>
                  {unreadCount > 0 && (
                    <View style={[styles.countBadge, { backgroundColor: palette.accent }]}>
                      <Text style={[styles.countText, { color: palette.onAccent }]}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="すべて既読にする"
                    disabled={markRead.isPending || unreadCount === 0}
                    onPress={() => markRead.mutate(null)}
                    style={({ pressed }) => [
                      styles.markReadButton,
                      {
                        backgroundColor: palette.accentSoft,
                        opacity: unreadCount === 0 ? 0.45 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.markReadText, { color: palette.accentText }]}>
                      すべて既読
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="通知を閉じる"
                    onPress={closeNotifications}
                    style={styles.closeButton}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={22} color={palette.text3} />
                  </Pressable>
                </View>
              </View>

              {notificationsQuery.isLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="small" color={palette.accent} />
                </View>
              ) : notificationsQuery.error ? (
                <View style={styles.center}>
                  <Ionicons name="cloud-offline-outline" size={24} color={palette.text3} />
                  <Text style={[styles.errorTitle, { color: palette.text }]}>
                    通知を読み込めませんでした
                  </Text>
                  <Text style={[styles.errorBody, { color: palette.text3 }]}>
                    {notificationsQuery.error.message}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void notificationsQuery.refetch()}
                    style={[styles.retryButton, { backgroundColor: palette.accent }]}
                  >
                    <Text style={[styles.retryText, { color: palette.onAccent }]}>再読み込み</Text>
                  </Pressable>
                </View>
              ) : (
                <FlatList
                  data={notifications}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={
                    notifications.length === 0 ? styles.emptyList : styles.list
                  }
                  refreshControl={
                    <RefreshControl
                      refreshing={notificationsQuery.isRefetching || unreadCountQuery.isRefetching}
                      onRefresh={() =>
                        void Promise.all([notificationsQuery.refetch(), unreadCountQuery.refetch()])
                      }
                      tintColor={palette.accent}
                    />
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleNotification(item)}
                      style={({ pressed }) => [
                        styles.notification,
                        {
                          backgroundColor: palette.card,
                          borderColor: item.readAt ? palette.border : palette.accent,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.notificationHeader}>
                        <Text style={[styles.notificationTitle, { color: palette.text }]}>
                          {item.title}
                        </Text>
                        <Text style={[styles.date, { color: palette.text4 }]}>
                          {formatDate(item.createdAt)}
                        </Text>
                      </View>
                      <Text style={[styles.body, { color: palette.text2 }]}>{item.body}</Text>
                      {!item.readAt && (
                        <Text style={[styles.unread, { color: palette.accentText }]}>未読</Text>
                      )}
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Ionicons name="notifications-off-outline" size={28} color={palette.text4} />
                      <Text style={[styles.emptyTitle, { color: palette.text }]}>
                        通知はまだありません
                      </Text>
                      <Text style={[styles.emptyBody, { color: palette.text3 }]}>
                        メンションや更新が届くとここに表示されます。
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </NotificationPanelContext.Provider>
  )
}

export function useNotificationPanel(): NotificationPanelContextValue {
  const value = React.useContext(NotificationPanelContext)
  if (!value) throw new Error('useNotificationPanel must be used within NotificationPanelProvider')
  return value
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, alignItems: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  panel: {
    flex: 1,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
    elevation: 18,
  },
  safeArea: { flex: 1 },
  panelHeader: {
    minHeight: 58,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markReadButton: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  markReadText: { fontSize: 12, fontWeight: '700' },
  closeButton: { padding: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  errorBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { fontSize: 13, fontWeight: '700' },
  list: { padding: 14, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  notification: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  notificationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  notificationTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  date: { fontSize: 11 },
  body: { fontSize: 13, lineHeight: 19 },
  unread: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.78 },
})
