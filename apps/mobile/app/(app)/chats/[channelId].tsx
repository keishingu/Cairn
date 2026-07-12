import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  parseMentions,
  useMarkChannelRead,
  useMessages,
  useSendMessage,
  useToggleMessageReaction,
} from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import { THEME } from '../../../lib/theme'

type Palette = (typeof THEME)[keyof typeof THEME]
type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function formatTime(value: string) {
  const source = new Date(value)
  return `${source.getMonth() + 1}/${source.getDate()} ${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}`
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

function attachmentIcon(mimeType: string | null): IoniconName {
  if (mimeType?.startsWith('image/')) return 'image-outline'
  if (mimeType === 'application/pdf') return 'document-text-outline'
  if (mimeType?.startsWith('text/')) return 'document-outline'
  return 'attach-outline'
}

function AttachmentChip({ attachment, palette }: { attachment: MessageDto['attachments'][number]; palette: Palette }) {
  return (
    <View style={[styles.attachmentChip, { backgroundColor: palette.card2, borderColor: palette.border }]}>
      <Ionicons name={attachmentIcon(attachment.mimeType)} size={20} color={palette.text3} />
      <Text style={[styles.attachmentText, { color: palette.text2 }]} numberOfLines={1}>{attachment.fileName}</Text>
    </View>
  )
}

function ChatMessageRow({ message, palette, onToggleReaction }: {
  message: MessageDto
  palette: Palette
  onToggleReaction: (messageId: string, emoji: string) => void
}) {
  if (message.messageType === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemMessage, { backgroundColor: palette.card2, borderColor: palette.divider, color: palette.text4 }]}>
          {parseMentions(message.content)}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.messageRow}>
      {message.senderAvatarUrl ? (
        <Image source={{ uri: message.senderAvatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.avatarInitial, { color: palette.accentText }]}>{initials(message.senderName)}</Text>
        </View>
      )}

      <View style={styles.messageBody}>
        <View style={styles.messageMeta}>
          <Text style={[styles.senderName, { color: palette.text }]} numberOfLines={1}>{message.senderName}</Text>
          <Text style={[styles.messageTime, { color: palette.text4 }]}>{formatTime(message.createdAt)}</Text>
          {message.isEdited && <Text style={[styles.edited, { color: palette.text4 }]}>編集済み</Text>}
        </View>

        {message.replyTo && (
          <View style={[styles.replyPreview, { borderLeftColor: palette.accent }]}>
            <Ionicons name="arrow-undo-outline" size={13} color={palette.text4} />
            <Text style={[styles.replySender, { color: palette.text3 }]} numberOfLines={1}>{message.replyTo.senderName}</Text>
            <Text style={[styles.replyText, { color: palette.text4 }]} numberOfLines={1}>
              {message.replyTo.isDeleted ? '削除されたメッセージ' : parseMentions(message.replyTo.content) || '（添付ファイル）'}
            </Text>
          </View>
        )}

        {message.content.length > 0 && <Text style={[styles.messageText, { color: palette.text2 }]}>{parseMentions(message.content)}</Text>}

        {message.attachments.length > 0 && (
          <View style={[styles.attachments, message.content.length > 0 && styles.attachmentsWithContent]}>
            {message.attachments.map(attachment => <AttachmentChip key={attachment.id} attachment={attachment} palette={palette} />)}
          </View>
        )}

        {message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.map(reaction => (
              <Pressable
                key={reaction.emoji}
                accessibilityRole="button"
                accessibilityLabel={`${reaction.emoji} ${reaction.count}件のリアクション`}
                onPress={() => onToggleReaction(message.id, reaction.emoji)}
                style={({ pressed }) => [
                  styles.reaction,
                  {
                    backgroundColor: reaction.mine ? palette.accentSoft : palette.card2,
                    borderColor: reaction.mine ? palette.accent : palette.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.reactionText, { color: reaction.mine ? palette.accentText : palette.text2 }]}>{reaction.emoji} {reaction.count}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

export default function ChatThreadScreen() {
  const { channelId, channelName } = useLocalSearchParams<{ channelId: string; channelName?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = THEME[useColorScheme() === 'dark' ? 'dark' : 'light']
  const messagesQuery = useMessages(channelId ?? null)
  const sendMessage = useSendMessage(channelId ?? '')
  const markRead = useMarkChannelRead(channelId ?? '')
  const toggleReaction = useToggleMessageReaction(channelId ?? '')
  const [draft, setDraft] = React.useState('')
  const [sendError, setSendError] = React.useState<string | null>(null)
  const messages = messagesQuery.data ?? []

  // 画面に反映済みの最新メッセージだけを既読化する。キャッシュ中の古い一覧で先読み既読にしない。
  const markReadRef = React.useRef(markRead)
  markReadRef.current = markRead
  const lastReadMessageIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!channelId || messagesQuery.isFetching || messages.length === 0) return
    const lastId = messages[messages.length - 1]?.id
    if (!lastId || lastReadMessageIdRef.current === lastId) return
    lastReadMessageIdRef.current = lastId
    markReadRef.current.mutate()
  }, [channelId, messages, messagesQuery.isFetching])

  async function handleSend() {
    const content = draft.trim()
    if (!content || sendMessage.isPending) return
    setDraft('')
    setSendError(null)
    try {
      await sendMessage.mutateAsync(content)
    } catch {
      setDraft(content)
      setSendError('メッセージを送信できませんでした')
    }
  }

  const handleToggleReaction = (messageId: string, emoji: string) => {
    toggleReaction.mutate({ messageId, emoji })
  }

  // FlatList を inverted 表示するため新しい順に並べ替える。
  const reversedMessages = [...messages].reverse()

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="チャット一覧へ戻る"
          style={styles.backButton}
          onPress={() => router.replace('/(app)/chats')}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={palette.accent} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>{channelName || 'チャット'}</Text>
      </View>

      {messagesQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.accent} /></View>
      ) : messagesQuery.error ? (
        <View style={styles.center}><Text style={[styles.errorText, { color: palette.redText }]}>{messagesQuery.error.message}</Text></View>
      ) : (
        <FlatList
          data={reversedMessages}
          inverted
          keyExtractor={message => message.id}
          renderItem={({ item }) => <ChatMessageRow message={item} palette={palette} onToggleReaction={handleToggleReaction} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, { color: palette.text4 }]}>まだメッセージはありません。最初のメッセージを送ってみましょう！</Text>}
        />
      )}

      <View style={[styles.composerArea, { backgroundColor: palette.card, borderTopColor: palette.border, paddingBottom: insets.bottom || 12 }]}>
        {sendError && <Text style={[styles.sendError, { color: palette.redText }]}>{sendError}</Text>}
        <View style={[styles.composer, { backgroundColor: palette.card2, borderColor: palette.border }]}>
          <TextInput
            accessibilityLabel="メッセージを入力"
            style={[styles.input, { color: palette.text }]}
            value={draft}
            onChangeText={(value) => { setDraft(value); if (sendError) setSendError(null) }}
            placeholder="メッセージを入力..."
            placeholderTextColor={palette.text4}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="メッセージを送信"
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: palette.accent, opacity: !draft.trim() || sendMessage.isPending ? 0.45 : pressed ? 0.75 : 1 },
            ]}
            onPress={() => void handleSend()}
            disabled={!draft.trim() || sendMessage.isPending}
          >
            {sendMessage.isPending
              ? <ActivityIndicator size="small" color={palette.onAccent} />
              : <Ionicons name="send" size={17} color={palette.onAccent} />
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 51, paddingHorizontal: 12, borderBottomWidth: 1 },
  backButton: { padding: 5 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 20, transform: [{ scaleY: -1 }] },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
  messageBody: { flex: 1, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: '700' },
  messageMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 3 },
  senderName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  messageTime: { fontSize: 11 },
  edited: { fontSize: 10, fontStyle: 'italic' },
  messageText: { fontSize: 14, lineHeight: 22 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 5, borderLeftWidth: 2, marginBottom: 5, paddingLeft: 7 },
  replySender: { fontSize: 11.5, fontWeight: '600', flexShrink: 0 },
  replyText: { fontSize: 11.5, flex: 1 },
  attachments: { gap: 6 },
  attachmentsWithContent: { marginTop: 8 },
  attachmentChip: { maxWidth: 240, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  attachmentText: { flex: 1, fontSize: 12.5 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  reaction: { minHeight: 24, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 7 },
  reactionText: { fontSize: 11, fontWeight: '600' },
  systemRow: { alignItems: 'center', paddingVertical: 6 },
  systemMessage: { maxWidth: '100%', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
  composerArea: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8 },
  sendError: { fontSize: 12, marginBottom: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, minHeight: 38, maxHeight: 120, paddingVertical: 7, fontSize: 14, lineHeight: 20 },
  sendButton: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
})
