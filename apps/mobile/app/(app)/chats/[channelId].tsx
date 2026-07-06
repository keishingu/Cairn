import React from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMessages, useSendMessage, useMarkChannelRead, parseMentions } from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import { useProjectChannels } from '../../../hooks/use-projects'

function MessageRow({ message }: { message: MessageDto }) {
  const time = new Date(message.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return (
    <View style={styles.messageRow}>
      <View style={styles.messageHeader}>
        <Text style={styles.senderName}>{message.senderName}</Text>
        <Text style={styles.timestamp}>{time}</Text>
      </View>
      <Text style={styles.messageContent}>{parseMentions(message.content)}</Text>
      {message.attachments.length > 0 && (
        <View style={styles.attachmentList}>
          {message.attachments.map(a => (
            <Text key={a.id} style={styles.attachmentName} numberOfLines={1}>📎 {a.fileName}</Text>
          ))}
        </View>
      )}
    </View>
  )
}

export default function ChatThreadScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const listRef = React.useRef<FlatList<MessageDto>>(null)

  const { data: channels } = useProjectChannels()
  const channel = channels?.find(c => c.channelId === channelId)

  const { data: messages, isLoading, error } = useMessages(channelId ?? null)
  const sendMessage = useSendMessage(channelId)
  const markChannelRead = useMarkChannelRead(channelId)
  const [draft, setDraft] = React.useState('')

  // チャンネルを開いた時点で一度だけ既読化する（送信時は useSendMessage 側で自動処理済み）
  const markedChannelRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!channelId || markedChannelRef.current === channelId) return
    markedChannelRef.current = channelId
    markChannelRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  function handleSend() {
    const content = draft.trim()
    if (!content || sendMessage.isPending) return
    setDraft('')
    sendMessage.mutate(content)
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {channel ? `#${channel.channelName}` : 'チャット'}
          </Text>
          {channel && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{channel.projectTitle}</Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageRow message={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>メッセージがありません</Text>}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 12) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="メッセージを入力"
          placeholderTextColor="#999"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!draft.trim() || sendMessage.isPending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || sendMessage.isPending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  backButton: { padding: 6 },
  headerText: { flex: 1, marginLeft: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 12, color: '#888' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  list: { padding: 12, gap: 14, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
  messageRow: { gap: 2 },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  senderName: { fontSize: 13, fontWeight: '700', color: '#111' },
  timestamp: { fontSize: 11, color: '#999' },
  messageContent: { fontSize: 15, color: '#222', lineHeight: 20 },
  attachmentList: { marginTop: 4, gap: 2 },
  attachmentName: { fontSize: 12, color: '#0070f3' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: '#f1f3f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0070f3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#a9c9f5' },
})
