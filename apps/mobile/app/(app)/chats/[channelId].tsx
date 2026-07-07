import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMarkChannelRead, useMessages, useSendMessage, parseMentions } from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import { useSession } from '../../../lib/session-context'

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function MessageBubble({ message, mine }: { message: MessageDto; mine: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {!mine && <Text style={styles.senderName}>{message.senderName}</Text>}
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{parseMentions(message.content)}</Text>
        <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  )
}

export default function ChatThreadScreen() {
  const { channelId, channelName } = useLocalSearchParams<{ channelId: string; channelName?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const session = useSession()
  const myUserId = session?.user.id

  const messagesQuery = useMessages(channelId ?? null)
  const sendMessage = useSendMessage(channelId ?? '')
  const markRead = useMarkChannelRead(channelId ?? '')
  const [draft, setDraft] = React.useState('')

  // チャンネルを開いたタイミングでのみ既読化する（メッセージ更新のたびには送らない）
  const markReadRef = React.useRef(markRead)
  markReadRef.current = markRead
  React.useEffect(() => {
    if (channelId) markReadRef.current.mutate()
  }, [channelId])

  async function handleSend() {
    const content = draft.trim()
    if (!content || sendMessage.isPending) return
    setDraft('')
    try {
      await sendMessage.mutateAsync(content)
    } catch {
      setDraft(content)
    }
  }

  const messages = messagesQuery.data ?? []
  // FlatList を inverted 表示するため新しい順に並べ替える
  const reversedMessages = [...messages].reverse()

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {channelName ? `#${channelName}` : 'チャット'}
        </Text>
      </View>

      {messagesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : messagesQuery.error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{messagesQuery.error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={reversedMessages}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} mine={item.senderId === myUserId} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>メッセージがありません</Text>}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom || 12 }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="メッセージを入力"
          placeholderTextColor="#94A3B8"
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!draft.trim() || sendMessage.isPending) && styles.sendButtonDisabled]}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sendMessage.isPending}
        >
          <Text style={styles.sendButtonText}>送信</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backButton: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, transform: [{ scaleY: -1 }] },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleOther: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleMine: { backgroundColor: '#2563EB' },
  senderName: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  bubbleText: { fontSize: 15, color: '#0F172A' },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: '#94A3B8', alignSelf: 'flex-end' },
  bubbleTimeMine: { color: '#DBEAFE' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  sendButton: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
})
