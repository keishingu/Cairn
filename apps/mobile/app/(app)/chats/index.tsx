import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useProjectChannels, useWorkspaceChannels, useDms } from '../../../hooks/use-projects'
import { THEME } from '../../../lib/theme'
import type { Theme } from '../../../lib/theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function SectionHeader({ title, c }: { title: string; c: Theme }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: c.text4 }]}>{title}</Text>
      <Ionicons name="add" size={16} color={c.text4} />
    </View>
  )
}

// # / ✨ などの記号を、Web 版と同じ角丸スクエア（accent-soft 背景）で表示する
function PrefixIcon({ prefix, locked, c }: { prefix: string; locked?: boolean | undefined; c: Theme }) {
  if (locked) {
    return (
      <View style={[styles.prefix, { backgroundColor: c.card2 }]}>
        <Ionicons name="lock-closed" size={16} color={c.text3} />
      </View>
    )
  }
  return (
    <View style={[styles.prefix, { backgroundColor: c.accentSoft }]}>
      <Text style={[styles.prefixText, { color: c.accentText }]}>{prefix}</Text>
    </View>
  )
}

function Avatar({ name, url, c }: { name: string; url: string | null; c: Theme }) {
  if (url) return <Image source={{ uri: url }} style={styles.avatar} />
  return (
    <View style={[styles.avatar, { backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: c.onAccent, fontSize: 15, fontWeight: '700' }}>{name.slice(0, 1)}</Text>
    </View>
  )
}

function ChatRow({ label, badge, onPress, c, prefix, locked, avatarName, avatarUrl }: {
  label: string
  badge?: number
  onPress: () => void
  c: Theme
  prefix?: string
  locked?: boolean | undefined
  avatarName?: string
  avatarUrl?: string | null
}) {
  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: c.divider }]} onPress={onPress} activeOpacity={0.6}>
      {prefix !== undefined
        ? <PrefixIcon prefix={prefix} locked={locked} c={c} />
        : <Avatar name={avatarName ?? '?'} url={avatarUrl ?? null} c={c} />}
      <Text
        style={[styles.rowLabel, { color: c.text, fontWeight: badge && badge > 0 ? '600' : '500' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {badge != null && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: c.accent }]}>
          <Text style={[styles.badgeText, { color: c.onAccent }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.text4} />
    </TouchableOpacity>
  )
}

export default function ChatsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? THEME.dark : THEME.light

  const projectChannelsQ = useProjectChannels()
  const workspaceChannelsQ = useWorkspaceChannels()
  const dmsQ = useDms()

  const isLoading = projectChannelsQ.isLoading || workspaceChannelsQ.isLoading || dmsQ.isLoading
  // どれか一つでも失敗したらサイレントに隠さずエラーを見せる（CLAUDE.md のエラー表示方針）
  const error = projectChannelsQ.error ?? workspaceChannelsQ.error ?? dmsQ.error

  const openChannel = (channelId: string, name: string, opts?: { project?: string; dm?: boolean }) => {
    router.push({
      pathname: '/(app)/chats/[channelId]',
      params: {
        channelId,
        name,
        ...(opts?.project ? { project: opts.project } : {}),
        ...(opts?.dm ? { dm: '1' } : {}),
      },
    })
  }

  const header = (
    <View style={[styles.topBar, { borderBottomColor: c.divider }]}>
      <Text style={[styles.heading, { color: c.text }]}>チャット</Text>
      <TouchableOpacity onPress={() => router.push('/(app)/notifications')} hitSlop={8} style={styles.topIcon}>
        <Ionicons name="notifications-outline" size={22} color={c.text2} />
      </TouchableOpacity>
    </View>
  )

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        {header}
        <View style={styles.center}><Text style={[styles.errorText, { color: c.redText }]}>{error.message}</Text></View>
      </View>
    )
  }

  const projectChannels = projectChannelsQ.data ?? []
  const workspaceChannels = workspaceChannelsQ.data ?? []
  const dms = dmsQ.data ?? []
  const aiIcon: IoniconName = 'sparkles'

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionHeader title="プロジェクト" c={c} />
        {projectChannels.map(ch => (
          <ChatRow
            key={ch.channelId}
            prefix="#"
            label={ch.projectTitle}
            badge={ch.unreadCount}
            c={c}
            onPress={() => openChannel(ch.channelId, ch.channelName, { project: ch.projectTitle })}
          />
        ))}

        <SectionHeader title="チャンネル" c={c} />
        {workspaceChannels.map(ch => (
          <ChatRow
            key={ch.id}
            prefix="#"
            locked={ch.isPrivate}
            label={ch.name ?? ''}
            badge={ch.unreadCount}
            c={c}
            onPress={() => openChannel(ch.id, ch.name ?? '')}
          />
        ))}

        <SectionHeader title="ダイレクトメッセージ" c={c} />
        {dms.map(dm => (
          <ChatRow
            key={dm.id}
            avatarName={dm.participantName}
            avatarUrl={dm.participantAvatarUrl}
            label={dm.participantName}
            badge={dm.unreadCount}
            c={c}
            onPress={() => openChannel(dm.id, dm.participantName, { dm: true })}
          />
        ))}

        <SectionHeader title="アプリ" c={c} />
        <TouchableOpacity style={[styles.row, { borderBottomColor: c.divider }]} onPress={() => router.push('/(app)/ai')} activeOpacity={0.6}>
          <View style={[styles.prefix, { backgroundColor: c.accentSoft }]}>
            <Ionicons name={aiIcon} size={16} color="#EAB308" />
          </View>
          <Text style={[styles.rowLabel, { color: c.text }]}>AIアシスタント</Text>
          <Ionicons name="chevron-forward" size={16} color={c.text4} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  heading: { flex: 1, fontSize: 22, fontWeight: '700' },
  topIcon: { padding: 4 },
  scroll: { paddingVertical: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1,
  },
  prefix: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefixText: { fontSize: 18, fontWeight: '700' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  rowLabel: { flex: 1, fontSize: 16 },
  badge: { borderRadius: 999, minWidth: 20, height: 20, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
})
