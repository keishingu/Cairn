import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AppWebView } from '../../../components/app-webview'
import { useAppAppearance } from '../../../components/appearance-provider'
import { NativeAppHeader } from '../../../components/native-app-header'

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
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <NativeAppHeader title={title} onBack={close} backLabel="ネイティブチャットへ戻る" />
      <AppWebView path={path} allowChatRoutes includeSafeAreaTop={false} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
