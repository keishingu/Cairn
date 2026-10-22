// 入力欄の「アプリ」から選ぶアプリの起動口（投票など）。Web の AppEntryButtons と同じく、アプリが増えても入力欄の幅を
// 取らないようボタン1つのシートにまとめる。選ぶとスラッシュコマンドと同じ形でアプリへ届き、アプリはモーダルを開くなどして応える。
// Bot がまだチャンネルにいなければ、起動の前に追加を確かめる

import React from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { displayAppName, appAddErrorMessage, cardActionErrorMessage } from '@cairn/shared'
import { useAppEntryPoints, type AppEntryPointDto } from '../hooks/use-app-entry-points'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'

export function AppEntryActions({ channelId, palette, onError }: { channelId: string; palette: ThemePalette; onError: (message: string | null) => void }) {
  const t = useT()
  const { query, invoke: invokeEntry, busy } = useAppEntryPoints(channelId)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const insets = useSafeAreaInsets()

  const invoke = async (app: AppEntryPointDto, command: string) => {
    onError(null)
    const failure = await invokeEntry(app, command)
    if (!failure) return
    // 追加 API の本文は日本語固定なので見せず、状態コードから表示言語の案内にする
    onError(t(failure.step === 'add' ? appAddErrorMessage(failure.status) : cardActionErrorMessage(failure.code)))
  }

  const choose = (app: AppEntryPointDto, command: string) => {
    if (app.inChannel) return void invoke(app, command)
    Alert.alert(t('Add {app} to this channel?', { app: displayAppName({ name: app.appName, firstParty: app.firstParty }, t) }), t('The app will be able to post to this channel.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Add'), onPress: () => void invoke(app, command) },
    ])
  }

  if (query.isError) {
    // 読み込めなかったことを黙って隠さない
    return (
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => void query.refetch()}>
        <Text style={[styles.text, { color: palette.redText }]}>{t('Could not load apps')}</Text>
      </Pressable>
    )
  }

  const entries = (query.data ?? []).flatMap((app) => app.entryPoints.map((entry) => ({ app, entry })))
  if (entries.length === 0) return null

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Apps')}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        hitSlop={6}
        style={[styles.action, busy && { opacity: 0.5 }]}
        onPress={() => setSheetOpen(true)}
      >
        <Ionicons name="grid-outline" size={17} color={palette.text3} />
      </Pressable>
      <Modal transparent visible={sheetOpen} animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel={t('Close')} onPress={() => setSheetOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grip, { backgroundColor: palette.border }]} />
          <Text style={[styles.sheetTitle, { color: palette.text3 }]}>{t('Apps')}</Text>
          {entries.map(({ app, entry }) => (
            <Pressable
              key={`${app.installationId}:${entry.command}`}
              accessibilityRole="button"
              style={[styles.sheetItem, { borderTopColor: palette.divider }]}
              onPress={() => {
                setSheetOpen(false)
                choose(app, entry.command)
              }}
            >
              <Ionicons name="list-outline" size={19} color={palette.text2} />
              <Text style={[styles.sheetLabel, { color: palette.text }]} numberOfLines={1}>{t(entry.label)}</Text>
              <Text style={[styles.sheetApp, { color: palette.text4 }]} numberOfLines={1}>{displayAppName({ name: app.appName, firstParty: app.firstParty }, t)}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  text: { fontSize: 12, fontWeight: '600' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingHorizontal: 12 },
  grip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 7 },
  sheetTitle: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 6 },
  sheetItem: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  sheetLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  sheetApp: { marginLeft: 'auto', fontSize: 12.5 },
})
