import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWorkspace } from '../hooks/use-account'
import { useAppAppearance } from './appearance-provider'
import { useNotificationPanel } from './notification-panel-provider'

interface NativeAppHeaderProps {
  title: string
  subtitle?: string | undefined
  onBack?: (() => void) | undefined
  backLabel?: string | undefined
  right?: React.ReactNode
  showNotifications?: boolean
}

export function NativeAppHeader({
  title,
  subtitle,
  onBack,
  backLabel = '前の画面へ戻る',
  right,
  showNotifications = true,
}: NativeAppHeaderProps) {
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const { data: workspace } = useWorkspace()
  const { unreadCount, openNotifications } = useNotificationPanel()

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: insets.top,
          backgroundColor: palette.card,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            style={styles.leadingButton}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={palette.accent} />
          </Pressable>
        ) : workspace?.logoUrl ? (
          <Image source={{ uri: workspace.logoUrl }} style={styles.workspaceLogo} />
        ) : (
          <View style={[styles.workspaceLogo, { backgroundColor: palette.accent }]}>
            <Text style={[styles.workspaceInitial, { color: palette.onAccent }]}>
              {workspace?.name?.slice(0, 1) ?? 'C'}
            </Text>
          </View>
        )}

        <View style={styles.titleArea}>
          <Text
            style={[
              styles.title,
              subtitle ? styles.titleWithSubtitle : null,
              { color: palette.text },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.text4 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
        {showNotifications ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `通知、未読${unreadCount}件` : '通知'}
            onPress={openNotifications}
            style={styles.notificationButton}
            hitSlop={6}
          >
            <Ionicons name="notifications-outline" size={19} color={palette.text3} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { borderBottomWidth: 1 },
  header: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  leadingButton: { padding: 5 },
  workspaceLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceInitial: { fontSize: 12, fontWeight: '800' },
  titleArea: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700' },
  titleWithSubtitle: { fontSize: 15 },
  subtitle: { marginTop: 1, fontSize: 11.5 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  notificationButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
})
