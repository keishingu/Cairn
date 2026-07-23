import React from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { useMe, useWorkspace } from '../hooks/use-account'
import { useProjectChannels } from '../hooks/use-projects'
import { useWorkspaceChannels, useWorkspaceDms } from '../hooks/use-chat-channels'
import { supabase } from '../lib/supabase'
import { useAppAppearance } from './appearance-provider'
import { useNotificationPanel } from './notification-panel-provider'
import { type ProjectsView, useProjectsView } from './projects-view-context'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const TABS: {
  id: 'projects' | 'chats' | 'tasks' | 'ai' | 'menu'
  route: string
  icon: IoniconName
  label: string
}[] = [
  {
    id: 'projects',
    route: 'projects/index',
    icon: 'grid-outline',
    label: 'プロジェクト',
  },
  {
    id: 'chats',
    route: 'chats/index',
    icon: 'chatbubble-outline',
    label: 'チャット',
  },
  {
    id: 'tasks',
    route: 'tasks/index',
    icon: 'checkmark-circle-outline',
    label: 'タスク',
  },
  { id: 'ai', route: 'ai/index', icon: 'sparkles-outline', label: 'AI' },
  { id: 'menu', route: '', icon: 'menu-outline', label: 'メニュー' },
]

const PROJECT_VIEWS: { id: ProjectsView; icon: IoniconName; label: string }[] = [
  { id: 'list', icon: 'list-outline', label: '一覧' },
  { id: 'calendar', icon: 'calendar-outline', label: 'カレンダー' },
  { id: 'kanban', icon: 'grid-outline', label: 'カンバン' },
]

const MENU_ITEMS: { route: string; icon: IoniconName; label: string }[] = [
  {
    route: 'notifications/index',
    icon: 'notifications-outline',
    label: '通知',
  },
  { route: 'files/index', icon: 'folder-outline', label: 'ファイル' },
  { route: 'gallery/index', icon: 'images-outline', label: 'ギャラリー' },
  { route: 'members/index', icon: 'people-outline', label: 'メンバー' },
  { route: 'settings/index', icon: 'settings-outline', label: '設定' },
]

const MENU_ROUTES = new Set([
  ...MENU_ITEMS.map((item) => item.route),
  'signout/index',
  'menu/index',
])

export function MobileNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const { openNotifications } = useNotificationPanel()
  const { view, setView } = useProjectsView()
  const { data: channels } = useProjectChannels()
  const { data: workspaceChannels } = useWorkspaceChannels()
  const { data: dms } = useWorkspaceDms()
  const { data: me } = useMe()
  const { data: workspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [navHeight, setNavHeight] = React.useState(64 + insets.bottom)

  const current = state.routes[state.index]?.name ?? 'projects/index'
  const projectsActive = current.startsWith('projects/')
  const chatsActive = current.startsWith('chats/')
  // チャットタブのバッジは一覧画面（chats/index.tsx）が表示する3系統
  // （プロジェクトチャンネル・ワークスペースチャンネル・DM）すべてを合算する
  const unreadCount =
    (channels ?? []).reduce((total, channel) => total + channel.unreadCount, 0) +
    (workspaceChannels ?? []).reduce((total, channel) => total + channel.unreadCount, 0) +
    (dms ?? []).reduce((total, dm) => total + dm.unreadCount, 0)
  const closeOverlays = () => {
    setMenuOpen(false)
    setPickerOpen(false)
  }

  const navigate = (route: string) => {
    closeOverlays()
    navigation.navigate(route)
  }

  const signOut = async () => {
    closeOverlays()
    await supabase.auth.signOut().catch(() => undefined)
    queryClient.clear()
  }

  const pressTab = (tab: (typeof TABS)[number]) => {
    if (tab.id === 'menu') {
      setPickerOpen(false)
      setMenuOpen((open) => !open)
      return
    }
    if (tab.id === 'projects' && projectsActive) {
      setMenuOpen(false)
      setPickerOpen((open) => !open)
      return
    }
    navigate(tab.route)
  }

  return (
    <>
      <Modal
        transparent
        visible={menuOpen || pickerOpen}
        animationType="fade"
        onRequestClose={closeOverlays}
      >
        <Pressable style={styles.backdrop} onPress={closeOverlays} />
        {pickerOpen && (
          <View
            style={[
              styles.popup,
              styles.picker,
              {
                bottom: navHeight + 8,
                backgroundColor: palette.card,
                borderColor: palette.border,
              },
            ]}
          >
            {PROJECT_VIEWS.map((option, index) => {
              const active = option.id === view
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.divider,
                    },
                  ]}
                  onPress={() => {
                    setView(option.id)
                    navigate('projects/index')
                  }}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={active ? palette.accent : palette.text3}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      {
                        color: active ? palette.accent : palette.text,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={palette.accent} />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
        {menuOpen && (
          <View
            style={[
              styles.popup,
              styles.menu,
              {
                bottom: navHeight + 8,
                backgroundColor: palette.card,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.menuHeader}>
              <View style={styles.identityRow}>
                {workspace?.logoUrl ? (
                  <Image source={{ uri: workspace.logoUrl }} style={styles.workspaceLogo} />
                ) : (
                  <View style={[styles.workspaceLogo, styles.fallback]}>
                    <Text style={styles.fallbackText}>{workspace?.name?.slice(0, 1) ?? '?'}</Text>
                  </View>
                )}
                <View style={styles.identityText}>
                  <Text style={[styles.workspaceName, { color: palette.text }]} numberOfLines={1}>
                    {workspace?.name ?? '…'}
                  </Text>
                  <Text style={[styles.subtext, { color: palette.text3 }]}>ワークスペース</Text>
                </View>
              </View>
              <View
                style={[
                  styles.identityRow,
                  {
                    borderTopWidth: 1,
                    borderTopColor: palette.divider,
                    marginTop: 12,
                    paddingTop: 12,
                  },
                ]}
              >
                {me?.avatarUrl ? (
                  <Image source={{ uri: me.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.fallback]}>
                    <Ionicons name="person" size={16} color="#FFFFFF" />
                  </View>
                )}
                <View style={styles.identityText}>
                  <Text style={[styles.userName, { color: palette.text }]} numberOfLines={1}>
                    {me?.displayName ?? '…'}
                  </Text>
                  {me?.email && (
                    <Text style={[styles.subtext, { color: palette.text3 }]} numberOfLines={1}>
                      {me.email}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.menuItem, { borderTopColor: palette.divider }]}
                onPress={() => {
                  if (item.route === 'notifications/index') {
                    closeOverlays()
                    requestAnimationFrame(openNotifications)
                    return
                  }
                  navigate(item.route)
                }}
              >
                <Ionicons name={item.icon} size={19} color={palette.text3} />
                <Text style={[styles.menuLabel, { color: palette.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={15} color={palette.text3} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.menuItem, { borderTopColor: palette.divider }]}
              onPress={() => void signOut()}
            >
              <Ionicons name="log-out-outline" size={19} color={palette.redText} />
              <Text style={[styles.menuLabel, { color: palette.redText }]}>ログアウト</Text>
              <Ionicons name="chevron-forward" size={15} color={palette.redText} />
            </TouchableOpacity>
          </View>
        )}
      </Modal>
      <View
        style={[
          styles.nav,
          {
            backgroundColor: palette.card,
            borderTopColor: palette.border,
            paddingBottom: insets.bottom,
          },
        ]}
        onLayout={(event) => setNavHeight(event.nativeEvent.layout.height)}
      >
        {TABS.map((tab) => {
          const active =
            tab.id === 'menu'
              ? menuOpen || MENU_ROUTES.has(current)
              : tab.id === 'projects'
                ? pickerOpen || projectsActive
                : tab.id === 'chats'
                  ? chatsActive
                  : current === tab.route
          const color = active ? palette.accent : palette.text3
          return (
            <TouchableOpacity
              key={tab.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => pressTab(tab)}
              activeOpacity={0.7}
            >
              <View>
                {tab.id === 'menu' && me?.avatarUrl ? (
                  <Image
                    source={{ uri: me.avatarUrl }}
                    style={[
                      styles.avatar,
                      active && { borderColor: palette.accent, borderWidth: 2 },
                    ]}
                  />
                ) : (
                  <Ionicons
                    name={
                      tab.id === 'projects' && view === 'calendar' ? 'calendar-outline' : tab.icon
                    }
                    size={22}
                    color={color}
                  />
                )}
                {tab.id === 'chats' && unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, { color, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  nav: { flexDirection: 'row', borderTopWidth: 1 },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  tabLabel: { fontSize: 10 },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  popup: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  picker: { left: 8, minWidth: 168 },
  menu: { left: 12, right: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  rowLabel: { flex: 1, fontSize: 14 },
  menuHeader: { padding: 16 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityText: { flex: 1, minWidth: 0 },
  workspaceLogo: { width: 36, height: 36, borderRadius: 10 },
  fallback: {
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  workspaceName: { fontSize: 14, fontWeight: '700' },
  userName: { fontSize: 13.5, fontWeight: '600' },
  subtext: { fontSize: 11.5 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
})
