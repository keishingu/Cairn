import React from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ListRenderItemInfo,
} from 'react-native'
import { useLocalSearchParams, Stack, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useProjectChannels } from '../../../hooks/use-projects'
import { useMessages, useSendMessage, useMarkChannelRead, parseMentions } from '../../../hooks/use-messages'
import { apiFetch } from '../../../lib/api-fetch'
import type { MessageDto } from '../../../hooks/use-messages'
import type { ProjectDto } from '../../../hooks/use-projects'

function useProject(id: string) {
  return useQuery<ProjectDto>({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error(`プロジェクトの取得に失敗しました (${res.status})`)
      return res.json() as Promise<ProjectDto>
    },
  })
}

function MessageItem({ item }: { item: MessageDto }) {
  return (
    <View style={styles.message}>
      <View style={styles.messageHeader}>
        <Text style={styles.senderName}>{item.senderName}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={styles.messageContent}>{parseMentions(item.content)}</Text>
    </View>
  )
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [input, setInput] = React.useState('')
  const listRef = React.useRef<FlatList<MessageDto>>(null)

  const { data: project, isLoading: projectLoading } = useProject(id)
  const { data: allChannels } = useProjectChannels()
  const channel = allChannels?.find(c => c.projectId === id) ?? null
  const channelId = channel?.channelId ?? null

  const { data: messages, isLoading: messagesLoading, error: messagesError } = useMessages(channelId)
  const sendMessage = useSendMessage(channelId ?? '')
  const markRead = useMarkChannelRead(channelId ?? '')

  useFocusEffect(
    React.useCallback(() => {
      if (channelId) markRead.mutate()
    }, [channelId]),
  )

  React.useEffect(() => {
    if (messages && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: false })
    }
  }, [messages?.length])

  async function handleSend() {
    const text = input.trim()
    if (!text || !channelId) return
    setInput('')
    try {
      await sendMessage.mutateAsync(text)
      listRef.current?.scrollToEnd({ animated: true })
    } catch {
      // エラーは sendMessage.error に設定される
    }
  }

  if (projectLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  const renderItem = ({ item }: ListRenderItemInfo<MessageDto>) => <MessageItem item={item} />

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: project?.title ?? 'プロジェクト', headerShown: true }} />

      {messagesLoading && <ActivityIndicator style={styles.loadingBar} />}
      {messagesError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{messagesError.message}</Text>
        </View>
      )}
      {sendMessage.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{sendMessage.error.message}</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages ?? []}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          !messagesLoading ? <Text style={styles.empty}>メッセージはまだありません</Text> : null
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="メッセージを入力..."
          multiline
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sendMessage.isPending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
        >
          <Text style={styles.sendButtonText}>送信</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingBar: { marginVertical: 8 },
  errorBox: { backgroundColor: '#fef2f2', padding: 12, margin: 8, borderRadius: 8 },
  errorText: { color: '#b91c1c', fontSize: 13 },
  messageList: { padding: 12, gap: 12 },
  message: { gap: 2 },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  senderName: { fontWeight: '600', fontSize: 13 },
  timestamp: { fontSize: 11, color: '#999' },
  messageContent: { fontSize: 14, color: '#222', lineHeight: 20 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60 },
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#0070f3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendButtonDisabled: { backgroundColor: '#c0d6f5' },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
