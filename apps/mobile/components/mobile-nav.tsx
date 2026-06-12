import React from 'react'
import { View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useProjectChannels } from '../hooks/use-projects'
import { useMe, useWorkspace } from '../hooks/use-account'
import { useProjectsView, type ProjectsView } from './projects-view-context'
import { THEME } from '../lib/theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

// route はナビゲーターの実ルート名（ディレクトリ配下に _layout がないためファイル単位）
const TABS: { id: string; route: string; icon: IoniconName; label: string }[] = [
  { id: 'projects', route: 'projects/index', icon: 'grid-outline', label: 'プロジェクト' },
  { id: 'chats', route: 'chats/index', icon: 'chatbubble-outline', label: 'チャット' },
  { id: 'tasks', route: 'tasks/index', icon: 'checkmark-circle-outline', label: 'タスク' },
  { id: 'ai', route: 'ai/index', icon: 'sparkles-outline', label: 'AI' },
  { id: 'menu', route: '', icon: 'menu-outline', label: 'メニュー' },
]

const PROJECTS_VIEWS: { id: ProjectsView; label: string; icon: IoniconName }[] = [
  { id: 'list', label: '一覧', icon: 'list-outline' },
  { id: 'calendar', label: 'カレンダー', icon: 'calendar-outline' },
  { id: 'kanban', label: 'カンバン', icon: 'grid-outline' },
]

const MENU_ITEMS: { route: string; label: string; icon: IoniconName }[] = [
  { route: 'files', label: 'ファイル', icon: 'folder-outline' },
  { route: 'gallery', label: 'ギャラリー', icon: 'images-outline' },
  { route: 'members', label: 'メンバー', icon: 'people-outline' },
  { route: 'settings', label: '設定', icon: 'settings-outline' },
]

const MENU_ROUTES = new Set(MENU_ITEMS.map((i) => i.route))

export function MobileNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? THEME.dark : THEME.light
  const { view, setView } = useProjectsView()
  const { data: channels } = useProjectChannels()
  const { data: me } = useMe()
  const { data: workspace } = useWorkspace()

  const [menuOpen, setMenuOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  // ポップアップは Modal（フルスクリーン座標系）で出すため、タブバーの実高さを測って真上に配置する
  const [navHeight, setNavHeight] = React.useState(64 + insets.bottom)

  const current = state.routes[state.index]?.name ?? 'projects/index'
  // projects/[id]（プロジェクト詳細）でもプロジェクトタブをアクティブ表示する
  const isProjectsActive = current.startsWith('projects/')
  // chats/[channelId]（会話画面）でもチャットタブをアクティブ表示する
  const isChatsActive = current.startsWith('chats/')
  const closeAll = () => { setMenuOpen(false); setPickerOpen(false) }

  const unreadTotal = (channels ?? []).reduce((sum, ch) => sum + ch.unreadCount, 0)

  const handlePress = (tab: typeof TABS[number]) => {
    if (tab.id === 'menu') {
      setPickerOpen(false)
      setMenuOpen((o) => !o)
      return
    }
    if (tab.id === 'projects') {
      setMenuOpen(false)
      if (isProjectsActive) {
        setPickerOpen((o) => !o)
      } else {
        setPickerOpen(false)
        navigation.navigate('projects/index')
      }
      return
    }
    closeAll()
    navigation.navigate(tab.route)
  }

  const projectsIcon: IoniconName = view === 'calendar' ? 'calendar-outline' : 'grid-outline'
  const isMenuActive = menuOpen || MENU_ROUTES.has(current)

  return (
    <>
      {/* タブバー内の絶対配置は Android で親にクリップされるため、ポップアップは Modal で全画面に重ねる */}
      <Modal transparent visible={menuOpen || pickerOpen} animationType="fade" onRequestClose={closeAll}>
        <Pressable style={styles.backdrop} onPress={closeAll} />

        {/* プロジェクトビュー切替ピッカー */}
        {pickerOpen && (
          <View style={[styles.popup, styles.pickerPopup, { bottom: navHeight + 8, backgroundColor: c.card, borderColor: c.border }]}>
            {PROJECTS_VIEWS.map((v, i) => {
              const active = v.id === view
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.popupRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.divider }, active && { backgroundColor: c.cardHover }]}
                  onPress={() => { closeAll(); setView(v.id); navigation.navigate('projects/index') }}
                >
                  <Ionicons name={v.icon} size={16} color={active ? c.accent : c.text3} />
                  <Text style={[styles.popupLabel, { color: active ? c.accent : c.text, fontWeight: active ? '700' : '500' }]}>{v.label}</Text>
                  {active && <Ionicons name="checkmark" size={14} color={c.accent} />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* メニューポップアップ */}
        {menuOpen && (
          <View style={[styles.popup, styles.menuPopup, { bottom: navHeight + 8, backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHeaderRow}>
                {workspace?.logoUrl
                  ? <Image source={{ uri: workspace.logoUrl }} style={styles.wsLogo} />
                  : <View style={[styles.wsLogo, styles.wsLogoFallback]}><Text style={styles.wsLogoText}>{workspace?.name?.slice(0, 1) ?? '?'}</Text></View>}
                <View style={styles.menuHeaderText}>
                  <Text style={[styles.wsName, { color: c.text }]} numberOfLines={1}>{workspace?.name ?? '…'}</Text>
                  <Text style={[styles.wsSub, { color: c.text3 }]}>ワークスペース</Text>
                </View>
              </View>
              <View style={[styles.userRow, { borderTopColor: c.divider }]}>
                {me?.avatarUrl
                  ? <Image source={{ uri: me.avatarUrl }} style={styles.avatar} />
                  : <View style={[styles.avatar, styles.wsLogoFallback]}><Ionicons name="person" size={16} color="#fff" /></View>}
                <View style={styles.menuHeaderText}>
                  <Text style={[styles.userName, { color: c.text }]} numberOfLines={1}>{me?.displayName ?? '…'}</Text>
                  {me?.email && <Text style={[styles.wsSub, { color: c.text3 }]} numberOfLines={1}>{me.email}</Text>}
                </View>
              </View>
            </View>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.menuItem, { borderTopColor: c.divider }]}
                onPress={() => { closeAll(); navigation.navigate(item.route) }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: c.cardHover }]}>
                  <Ionicons name={item.icon} size={18} color={c.text3} />
                </View>
                <Text style={[styles.menuItemLabel, { color: c.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={c.text3} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>

      <View
        style={[styles.nav, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom }]}
        onLayout={(e) => setNavHeight(e.nativeEvent.layout.height)}
      >
        {TABS.map((tab) => {
          const active =
            tab.id === 'menu' ? isMenuActive :
            tab.id === 'projects' ? (pickerOpen || isProjectsActive) :
            tab.id === 'chats' ? isChatsActive :
            current === tab.route
          const color = active ? c.accent : c.text3
          const iconName = tab.id === 'projects' ? projectsIcon : tab.icon
          return (
            <TouchableOpacity key={tab.id} style={styles.tab} onPress={() => handlePress(tab)} activeOpacity={0.7}>
              <View>
                {tab.id === 'menu' && me?.avatarUrl
                  ? <Image source={{ uri: me.avatarUrl }} style={[styles.tabAvatar, active && { borderColor: c.accent, borderWidth: 2 }]} />
                  : <Ionicons name={iconName} size={22} color={color} />}
                {tab.id === 'chats' && unreadTotal > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{unreadTotal > 99 ? '99+' : unreadTotal}</Text></View>
                )}
              </View>
              <Text style={[styles.tabLabel, { color, fontWeight: active ? '700' : '500' }]}>{tab.label}</Text>
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
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4 },
  tabLabel: { fontSize: 10 },
  tabAvatar: { width: 22, height: 22, borderRadius: 11 },
  badge: {
    position: 'absolute', top: -5, right: -9, backgroundColor: '#EF4444',
    borderRadius: 9, minWidth: 16, height: 16, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  popup: {
    position: 'absolute', borderWidth: 1, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  pickerPopup: { left: 8, minWidth: 168 },
  menuPopup: { left: 12, right: 12 },
  popupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  popupLabel: { flex: 1, fontSize: 14 },
  menuHeader: { padding: 16 },
  menuHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuHeaderText: { flex: 1, minWidth: 0 },
  wsLogo: { width: 36, height: 36, borderRadius: 10 },
  wsLogoFallback: { backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  wsLogoText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  wsName: { fontSize: 14, fontWeight: '700' },
  wsSub: { fontSize: 11.5 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  userName: { fontSize: 13.5, fontWeight: '600' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  menuItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuItemLabel: { fontSize: 15, fontWeight: '500' },
})
