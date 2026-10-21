// 入力欄に並べるアプリの起動口（投票など）。Web の AppEntryButtons と同じ流れで、選ぶとスラッシュコマンドと同じ形で
// アプリへ届き、アプリはモーダルを開くなどして応える。Bot がまだチャンネルにいなければ、起動の前に追加を確かめる

import React from 'react'
import { Alert, Pressable, StyleSheet, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cardActionErrorMessage } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'
import type { ThemePalette } from '../lib/theme'
import { useT } from './locale-provider'

type AppEntryPointDto = {
  installationId: string
  appName: string
  appIconUrl: string | null
  inChannel: boolean
  entryPoints: Array<{ command: string; label: string }>
}

async function readError(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : null
}

export function AppEntryActions({ channelId, palette, onError }: { channelId: string; palette: ThemePalette; onError: (message: string | null) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const queryKey = ['app-entry-points', channelId] as const
  const query = useQuery<AppEntryPointDto[]>({
    queryKey,
    queryFn: async () => {
      const res = await apiFetch(`/api/channels/${channelId}/app-entry-points`)
      if (!res.ok) throw new Error(`app-entry-points ${res.status}`)
      return res.json() as Promise<AppEntryPointDto[]>
    },
  })
  const [busy, setBusy] = React.useState(false)

  const invoke = async (app: AppEntryPointDto, command: string) => {
    setBusy(true)
    onError(null)
    try {
      if (!app.inChannel) {
        const added = await apiFetch(`/api/channels/${channelId}/apps`, { method: 'POST', body: JSON.stringify({ installationId: app.installationId }) })
        if (!added.ok) {
          // このエンドポイントは日本語の理由を返す（権限・チャンネルの種類）
          onError((await readError(added)) ?? t(cardActionErrorMessage(null)))
          return
        }
        await queryClient.invalidateQueries({ queryKey })
      }
      const res = await apiFetch('/api/app-commands', { method: 'POST', body: JSON.stringify({ installationId: app.installationId, channelId, command }) })
      if (!res.ok) onError(t(cardActionErrorMessage(await readError(res))))
    } catch {
      onError(t(cardActionErrorMessage(null)))
    } finally {
      setBusy(false)
    }
  }

  const choose = (app: AppEntryPointDto, command: string) => {
    if (app.inChannel) return void invoke(app, command)
    Alert.alert(t('Add {app} to this channel?', { app: app.appName }), t('The app will be able to post to this channel.'), [
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
