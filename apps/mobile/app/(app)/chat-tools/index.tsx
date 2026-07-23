import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppWebView } from '../../../components/app-webview'
import { useAppAppearance } from '../../../components/appearance-provider'

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default function ChatToolsScreen() {
  const params = useLocalSearchParams<{
    path?: string | string[]
    title?: string | string[]
    returnChannelId?: string | string[]
    returnChannelName?: string | string[]
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const requestedPath = firstParam(params.path)
  const path = requestedPath?.startsWith('/chats')
    ? requestedPath
    : '/chats?nativeAux=1&panel=global-search'
  const title = firstParam(params.title) ?? 'チャット'
  const returnChannelId = firstParam(params.returnChannelId)
  const returnChannelName = firstParam(params.returnChannelName)

  const close = () => {
    if (returnChannelId) {
      router.replace({
        pathname: '/(app)/chats/[channelId]',
        params: {
          channelId: returnChannelId,
          ...(returnChannelName ? { channelName: returnChannelName } : {}),
        },
      })
      return
    }
    router.replace('/(app)/chats')
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.card, borderBottomColor: palette.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ネイティブチャットへ戻る"
          onPress={close}
          style={styles.backButton}
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color={palette.accent} />
        </Pressable>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <AppWebView path={path} allowChatRoutes includeSafeAreaTop={false} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  backButton: { padding: 5 },
  title: { flex: 1, marginLeft: 4, fontSize: 15, fontWeight: '700' },
})
