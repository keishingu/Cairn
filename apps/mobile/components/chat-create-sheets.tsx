import React from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable,
  StyleSheet, ScrollView, ActivityIndicator, Image, Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useCreateWorkspaceChannel, useCreateDm } from '../hooks/use-projects'
import { useWorkspaceMembers } from '../hooks/use-account'
import { useSession } from '../lib/session-context'
import type { Theme } from '../lib/theme'

// ボトムシート共通枠。背景タップ・下スワイプ相当のバックドロップで閉じる
function Sheet({ visible, onClose, c, children }: {
  visible: boolean; onClose: () => void; c: Theme; children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 12, borderColor: c.border }]}>
        <View style={[styles.grip, { backgroundColor: c.border2 }]} />
        {children}
      </View>
    </Modal>
  )
}

// ─── チャンネル作成 ───────────────────────────────────────────────

export function CreateChannelSheet({ visible, onClose, onCreated, c }: {
  visible: boolean
  onClose: () => void
  onCreated: (channelId: string, name: string) => void
  c: Theme
}) {
  const [name, setName] = React.useState('')
  const [isPrivate, setIsPrivate] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { mutate, isPending } = useCreateWorkspaceChannel()

  const reset = () => { setName(''); setIsPrivate(false); setError(null) }
  const close = () => { reset(); onClose() }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('チャンネル名を入力してください'); return }
    setError(null)
    mutate({ name: trimmed, isPrivate }, {
      onSuccess: (channel) => { close(); onCreated(channel.id, channel.name ?? trimmed) },
      onError: (e) => setError(e.message),
    })
  }

  return (
    <Sheet visible={visible} onClose={close} c={c}>
      <Text style={[styles.title, { color: c.text }]}>新規チャンネル</Text>
      <Text style={[styles.subtitle, { color: c.text3 }]}>プロジェクトに紐づかない全体・招待制チャンネルを作成します</Text>

      <Text style={[styles.label, { color: c.text2 }]}>チャンネル名</Text>
      <TextInput
        style={[styles.input, { color: c.text, backgroundColor: c.card2, borderColor: error ? c.red : c.border }]}
        placeholder="例: 連絡事項"
        placeholderTextColor={c.text4}
        value={name}
        onChangeText={setName}
        maxLength={60}
        autoFocus
      />

      <TouchableOpacity style={styles.privacyRow} onPress={() => setIsPrivate(p => !p)} activeOpacity={0.7}>
        <Ionicons name={isPrivate ? 'lock-closed' : 'globe-outline'} size={18} color={c.text3} />
        <View style={styles.privacyText}>
          <Text style={[styles.privacyLabel, { color: c.text }]}>招待制にする</Text>
          <Text style={[styles.privacySub, { color: c.text4 }]}>
            {isPrivate ? '招待されたメンバーのみ参加できます' : 'ワークスペース全員が参加できます'}
          </Text>
        </View>
        <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: c.accent }} />
      </TouchableOpacity>

      {error && <Text style={[styles.error, { color: c.redText }]}>{error}</Text>}

      <TouchableOpacity
        style={[styles.submit, { backgroundColor: name.trim() && !isPending ? c.accent : c.border2 }]}
        onPress={submit}
        disabled={!name.trim() || isPending}
      >
        {isPending
          ? <ActivityIndicator color={c.onAccent} />
          : <Text style={[styles.submitText, { color: c.onAccent }]}>作成</Text>}
      </TouchableOpacity>
    </Sheet>
  )
}

// ─── DM 作成（メンバー選択） ─────────────────────────────────────

export function CreateDmSheet({ visible, onClose, onCreated, c }: {
  visible: boolean
  onClose: () => void
  onCreated: (channelId: string, participantName: string) => void
  c: Theme
}) {
  const session = useSession()
  const myUserId = session?.user.id
  const { data: members, isLoading, error } = useWorkspaceMembers()
  const { mutate, isPending } = useCreateDm()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [createError, setCreateError] = React.useState<string | null>(null)

  // 自分宛ての DM は作れないため一覧から除外する
  const others = (members ?? []).filter(m => m.userId !== myUserId)

  const start = (userId: string, displayName: string) => {
    if (isPending) return
    setPendingId(userId)
    setCreateError(null)
    mutate({ targetUserId: userId }, {
      onSuccess: ({ id }) => { setPendingId(null); onClose(); onCreated(id, displayName) },
      onError: (e) => { setPendingId(null); setCreateError(e.message) },
    })
  }

  return (
    <Sheet visible={visible} onClose={onClose} c={c}>
      <Text style={[styles.title, { color: c.text }]}>ダイレクトメッセージ</Text>
      <Text style={[styles.subtitle, { color: c.text3 }]}>メンバーを選んで個別のメッセージを開始します</Text>

      {createError && <Text style={[styles.error, { color: c.redText }]}>{createError}</Text>}

      {isLoading ? (
        <View style={styles.dmLoading}><ActivityIndicator color={c.accent} /></View>
      ) : error ? (
        <Text style={[styles.error, { color: c.redText }]}>{error.message}</Text>
      ) : (
        <ScrollView style={styles.dmList}>
          {others.length === 0 && <Text style={[styles.empty, { color: c.text4 }]}>他のメンバーがいません</Text>}
          {others.map(m => (
            <TouchableOpacity
              key={m.userId}
              style={[styles.dmRow, { borderBottomColor: c.divider }]}
              onPress={() => start(m.userId, m.displayName)}
              activeOpacity={0.6}
              disabled={isPending}
            >
              {m.avatarUrl
                ? <Image source={{ uri: m.avatarUrl }} style={styles.dmAvatar} />
                : <View style={[styles.dmAvatar, { backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: c.onAccent, fontSize: 14, fontWeight: '700' }}>{m.displayName.slice(0, 1)}</Text>
                  </View>}
              <Text style={[styles.dmName, { color: c.text }]} numberOfLines={1}>{m.displayName}</Text>
              {pendingId === m.userId && <ActivityIndicator size="small" color={c.accent} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1,
    paddingHorizontal: 20, paddingTop: 10,
  },
  grip: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 2, marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  privacyText: { flex: 1 },
  privacyLabel: { fontSize: 14, fontWeight: '600' },
  privacySub: { fontSize: 11.5, marginTop: 1 },
  error: { fontSize: 12.5, marginTop: 12 },
  submit: { marginTop: 20, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700' },
  dmLoading: { paddingVertical: 32, alignItems: 'center' },
  dmList: { maxHeight: 360, marginTop: 4 },
  dmRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  dmAvatar: { width: 38, height: 38, borderRadius: 19 },
  dmName: { flex: 1, fontSize: 15 },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 13 },
})
