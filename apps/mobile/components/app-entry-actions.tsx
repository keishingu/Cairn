// 入力欄に並べるアプリの起動口（投票など）。Web の AppEntryButtons と同じ流れで、選ぶとスラッシュコマンドと同じ形で
// アプリへ届き、アプリはモーダルを開くなどして応える。Bot がまだチャンネルにいなければ、起動の前に追加を確かめる

import React from 'react'
import { Alert, Pressable, StyleSheet, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { displayAppName, appAddErrorMessage, cardActionErrorMessage } from '@cairn/shared'
import { useAppEntryPoints, type AppEntryPointDto } from '../hooks/use-app-entry-points'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'

export function AppEntryActions({ channelId, palette, onError }: { channelId: string; palette: ThemePalette; onError: (message: string | null) => void }) {
  const t = useT()
  const { query, invoke: invokeEntry, busy } = useAppEntryPoints(channelId)

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

  return (
    <>
      {(query.data ?? []).flatMap((app) =>
        app.entryPoints.map((entry) => (
          <Pressable
            key={`${app.installationId}:${entry.command}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={[styles.action, busy && { opacity: 0.5 }]}
            onPress={() => choose(app, entry.command)}
          >
            <Ionicons name="list-outline" size={15} color={palette.text3} />
            <Text style={[styles.text, { color: palette.text3 }]}>{t(entry.label)}</Text>
          </Pressable>
        )),
      )}
    </>
  )
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  text: { fontSize: 12, fontWeight: '600' },
})
