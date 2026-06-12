import React from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../../../lib/session-context'
import { useMessages, useMarkChannelRead, parseMentions } from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import { useMessageQueue } from '../../../hooks/use-message-queue'
import type { QueuedMessage } from '../../../hooks/use-message-queue'
import { useAttachmentUpload } from '../../../hooks/use-attachment-upload'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function MessageRow({ message, isMine }: { message: MessageDto; isMine: boolean }) {
  return (
    <View style={[styles.row, isMine && styles.rowMine]}>
      {!isMine && (
        message.senderAvatarUrl
          ? <Image source={{ uri: message.senderAvatarUrl }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{message.senderName.slice(0, 1)}</Text>
            </View>
      )}
      <View style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
        {!isMine && <Text style={styles.senderName}>{message.senderName}</Text>}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {parseMentions(message.content)}
          </Text>
        </View>
        {message.attachments.map(att => (
          <View key={att.id} style={styles.attachment}>
            <Ionicons name="document-attach-outline" size={14} color="#6B7280" />
            <Text style={styles.attachmentName} numberOfLines={1}>{att.fileName}</Text>
          </View>
        ))}
        {message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.map(r => (
              <View key={r.emoji} style={[styles.reaction, r.mine && styles.reactionMine]}>
                <Text style={styles.reactionText}>{r.emoji} {r.count}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  )
}

function QueuedRow({ message, onRetry }: { message: QueuedMessage; onRetry: (tempId: string) => void }) {
  const failed = message.status === 'failed'
  return (
    <View style={[styles.row, styles.rowMine]}>
      <TouchableOpacity
        style={styles.bubbleWrapMine}
        disabled={!failed}
        onPress={() => onRetry(message.tempId)}
        activeOpacity={0.7}
      >
        <View style={[styles.bubble, styles.bubbleQueued]}>
          <Text style={styles.messageTextQueued}>{message.content}</Text>
        </View>
        {failed ? (
          <View style={styles.queueStatus}>
            <Ionicons name="alert-circle" size={13} color="#DC2626" />
            <Text style={styles.queueStatusFailed}>送信失敗・タップして再送</Text>
          </View>
        ) : (
          <View style={styles.queueStatus}>
            <Ionicons name="time-outline" size={13} color="#9CA3AF" />
            <Text style={styles.queueStatusPending}>送信中…</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

export default function ChatChannelScreen() {
  const { channelId, name, project } = useLocalSearchParams<{
    channelId: string; name?: string; project?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const session = useSession()
  const myUserId = session?.user.id

  const { data: messages, isLoading, error } = useMessages(channelId)
  const { queued, send, retry } = useMessageQueue(channelId)
  const { mutate: markRead } = useMarkChannelRead(channelId)
  const upload = useAttachmentUpload(channelId)

  const [draft, setDraft] = React.useState('')

  // 開いたとき・新着を受け取ったときに既読にする
  const messageCount = messages?.length ?? 0
  React.useEffect(() => {
    if (messageCount > 0) markRead()
  }, [messageCount, markRead])

  // inverted FlatList のため新しい順に並べ、未送信キューを先頭（画面最下部）に置く
  type Item = { kind: 'message'; message: MessageDto } | { kind: 'queued'; queued: QueuedMessage }
  const items: Item[] = [
    ...[...queued].reverse().map(q => ({ kind: 'queued' as const, queued: q })),
    ...[...(messages ?? [])].reverse().map(m => ({ kind: 'message' as const, message: m })),
  ]

  const canSend = (draft.trim().length > 0 || upload.doneFileIds.length > 0) && !upload.isUploading

  const handleSend = async () => {
    const content = draft.trim()
    if (!canSend) return
    setDraft('')
    const fileIds = upload.doneFileIds
    upload.clearUploads()
    await send(content, fileIds)
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>#{name ?? 'チャンネル'}</Text>
          {project && <Text style={styles.headerSub} numberOfLines={1}>{project}</Text>}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" /></View>
        ) : error ? (
          <View style={styles.center}><Text style={styles.errorText}>{error.message}</Text></View>
        ) : (
          <FlatList
            inverted
            data={items}
            keyExtractor={item => (item.kind === 'message' ? item.message.id : item.queued.tempId)}
            renderItem={({ item }) =>
              item.kind === 'message'
                ? <MessageRow message={item.message} isMine={item.message.senderId === myUserId} />
                : <QueuedRow message={item.queued} onRetry={retry} />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>まだメッセージがありません</Text>
            }
          />
        )}

        {upload.uploads.length > 0 && (
          <View style={styles.uploadList}>
            {upload.uploads.map(u => (
              <View key={u.id} style={styles.uploadRow}>
                {u.status === 'uploading' && <ActivityIndicator size="small" />}
                {u.status === 'done' && <Ionicons name="checkmark-circle" size={16} color="#059669" />}
                {u.status === 'error' && <Ionicons name="alert-circle" size={16} color="#DC2626" />}
                <Text style={styles.uploadName} numberOfLines={1}>{u.fileName}</Text>
                {u.status === 'uploading' && (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${Math.round(u.progress * 100)}%` }]} />
                  </View>
                )}
                <TouchableOpacity onPress={() => upload.removeUpload(u.id)} hitSlop={8}>
                  <Ionicons name="close" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: 8 }]}>
          <TouchableOpacity onPress={() => void upload.pickImage()} style={styles.iconButton} hitSlop={4}>
            <Ionicons name="image-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void upload.pickDocument()} style={styles.iconButton} hitSlop={4}>
            <Ionicons name="attach-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="メッセージを入力"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            onPress={() => void handleSend()}
            disabled={!canSend}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  backButton: { padding: 2 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  headerSub: { fontSize: 11.5, color: '#888' },
  list: { padding: 12, gap: 10 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, transform: [{ scaleY: -1 }] },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  rowMine: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: { backgroundColor: '#0891B2', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bubbleWrap: { maxWidth: '78%', gap: 3, alignItems: 'flex-start' },
  bubbleWrapMine: { maxWidth: '78%', gap: 3, alignItems: 'flex-end' },
  senderName: { fontSize: 11, color: '#888', marginLeft: 4 },
  bubble: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8' },
  bubbleMine: { backgroundColor: '#0070f3' },
  bubbleQueued: { backgroundColor: '#E5E7EB' },
  messageText: { fontSize: 14.5, color: '#111', lineHeight: 20 },
  messageTextMine: { color: '#fff' },
  messageTextQueued: { fontSize: 14.5, color: '#6B7280', lineHeight: 20 },
  queueStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  queueStatusPending: { fontSize: 11, color: '#9CA3AF' },
  queueStatusFailed: { fontSize: 11, color: '#DC2626', fontWeight: '600' },
  attachment: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8',
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, maxWidth: 240,
  },
  attachmentName: { fontSize: 12, color: '#374151', flexShrink: 1 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reaction: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8',
    borderRadius: 10, paddingVertical: 2, paddingHorizontal: 7,
  },
  reactionMine: { borderColor: '#0070f3', backgroundColor: '#EFF6FF' },
  reactionText: { fontSize: 12 },
  time: { fontSize: 10, color: '#aaa', marginHorizontal: 4 },
  uploadList: {
    borderTopWidth: 1, borderTopColor: '#e8e8e8', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 6, gap: 6,
  },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadName: { flexShrink: 1, fontSize: 12.5, color: '#374151' },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressBar: { height: 4, backgroundColor: '#0070f3' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 6,
    paddingHorizontal: 10, paddingTop: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8e8e8',
  },
  iconButton: { paddingVertical: 8, paddingHorizontal: 2 },
  input: {
    flex: 1, fontSize: 15, maxHeight: 120,
    backgroundColor: '#f1f3f5', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  sendButton: {
    backgroundColor: '#0070f3', borderRadius: 18,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#9CA3AF' },
})
