import React from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type * as FileSystemTypes from 'expo-file-system/build/legacy/index'
import * as Sharing from 'expo-sharing'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChannelMessagesError,
  parseMentions,
  useMarkChannelRead,
  useDeleteMessage,
  useEditMessage,
  useMessages,
  useToggleMessageBookmark,
  useToggleMessageReaction,
} from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import type { ThemePalette } from '../../../lib/theme'
import { useAppAppearance } from '../../../components/appearance-provider'
import { useAttachmentUpload } from '../../../hooks/use-attachment-upload'
import { useMe } from '../../../hooks/use-account'
import { useSession } from '../../../lib/session-context'
import { API_BASE_URL } from '../../../lib/env'
import { createClientMessageId, type QueuedMessage } from '../../../lib/offline-message-queue'
import { useOfflineMessageQueue } from '../../../components/offline-message-queue-provider'

// SDK 54 の legacy download API は安定した進捗不要ダウンロードに使える。
// 型定義だけ build 配下から参照し、アプリコード側の exactOptionalPropertyTypes の影響を避ける。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as typeof FileSystemTypes

type Palette = ThemePalette
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

function attachmentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/attachments/${fileId}`
}

async function openAttachmentFile(
  fileId: string,
  fileName: string,
  accessToken: string,
): Promise<void> {
  try {
    const safeName = fileName.replace(/[^\w.\-]/g, '_')
    const target = `${FileSystem.cacheDirectory}${fileId}_${safeName}`
    const result = await FileSystem.downloadAsync(attachmentUrl(fileId), target, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (result.status !== 200) throw new Error(`ダウンロードに失敗しました (${result.status})`)
    if (!(await Sharing.isAvailableAsync())) throw new Error('この端末ではファイルを開けません')
    await Sharing.shareAsync(result.uri)
  } catch (error) {
    console.error('[chat] 添付ファイルを開けませんでした:', error)
    Alert.alert(
      'ファイルを開けませんでした',
      error instanceof Error ? error.message : 'しばらくしてから再度お試しください。',
    )
  }
}

function AttachmentChip({
  attachment,
  palette,
  accessToken,
}: {
  attachment: MessageDto['attachments'][number]
  palette: Palette
  accessToken?: string
}) {
  const isImage = attachment.mimeType?.startsWith('image/') === true
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${attachment.fileName}を開く`}
      disabled={!accessToken}
      onPress={() => {
        if (accessToken)
          void openAttachmentFile(attachment.fileId, attachment.fileName, accessToken)
      }}
      style={({ pressed }) => [
        styles.attachmentChip,
        { backgroundColor: palette.card2, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {isImage && accessToken ? (
        <Image
          source={{
            uri: attachmentUrl(attachment.fileId),
            headers: { Authorization: `Bearer ${accessToken}` },
          }}
          style={styles.attachmentImage}
        />
      ) : (
        <Ionicons name={attachmentIcon(attachment.mimeType)} size={20} color={palette.text3} />
      )}
      <Text style={[styles.attachmentText, { color: palette.text2 }]} numberOfLines={1}>
        {attachment.fileName}
      </Text>
    </Pressable>
  )
}

function ChatMessageRow({
  message,
  palette,
  accessToken,
  onToggleReaction,
  onAddReaction,
  onOpenActions,
}: {
  message: MessageDto
  palette: Palette
  accessToken?: string
  onToggleReaction: (messageId: string, emoji: string) => void
  onAddReaction: (message: MessageDto) => void
  onOpenActions: (message: MessageDto) => void
}) {
  if (message.messageType === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text
          style={[
            styles.systemMessage,
            { backgroundColor: palette.card2, borderColor: palette.divider, color: palette.text4 },
          ]}
        >
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
        <View
          style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.accentSoft }]}
        >
          <Text style={[styles.avatarInitial, { color: palette.accentText }]}>
            {initials(message.senderName)}
          </Text>
        </View>
      )}

      <Pressable
        style={styles.messageBody}
        onLongPress={() => onOpenActions(message)}
        delayLongPress={350}
      >
        <View style={styles.messageMeta}>
          <Text style={[styles.senderName, { color: palette.text }]} numberOfLines={1}>
            {message.senderName}
          </Text>
          <Text style={[styles.messageTime, { color: palette.text4 }]}>
            {formatTime(message.createdAt)}
          </Text>
          {message.isEdited && (
            <Text style={[styles.edited, { color: palette.text4 }]}>編集済み</Text>
          )}
          {message.bookmarked && <Ionicons name="bookmark" size={12} color={palette.accent} />}
        </View>

        {message.replyTo && (
          <View style={[styles.replyPreview, { borderLeftColor: palette.accent }]}>
            <Ionicons name="arrow-undo-outline" size={13} color={palette.text4} />
            <Text style={[styles.replySender, { color: palette.text3 }]} numberOfLines={1}>
              {message.replyTo.senderName}
            </Text>
            <Text style={[styles.replyText, { color: palette.text4 }]} numberOfLines={1}>
              {message.replyTo.isDeleted
                ? '削除されたメッセージ'
                : parseMentions(message.replyTo.content) || '（添付ファイル）'}
            </Text>
          </View>
        )}

        {message.content.length > 0 && (
          <Text style={[styles.messageText, { color: palette.text2 }]}>
            {parseMentions(message.content)}
          </Text>
        )}

        {message.attachments.length > 0 && (
          <View
            style={[
              styles.attachments,
              message.content.length > 0 && styles.attachmentsWithContent,
            ]}
          >
            {message.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                palette={palette}
                {...(accessToken ? { accessToken } : {})}
              />
            ))}
          </View>
        )}

        {message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.map((reaction) => (
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
                <Text
                  style={[
                    styles.reactionText,
                    { color: reaction.mine ? palette.accentText : palette.text2 },
                  ]}
                >
                  {reaction.emoji} {reaction.count}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="リアクションを追加"
              onPress={() => onAddReaction(message)}
              style={[
                styles.reaction,
                { backgroundColor: palette.card2, borderColor: palette.border },
              ]}
            >
              <Ionicons name="happy-outline" size={14} color={palette.text3} />
              <Ionicons name="add" size={10} color={palette.text3} />
            </Pressable>
          </View>
        )}
        {message.reactions.length === 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="リアクションを追加"
            onPress={() => onAddReaction(message)}
            style={[
              styles.reactionAddStandalone,
              { backgroundColor: palette.card2, borderColor: palette.border },
            ]}
          >
            <Ionicons name="happy-outline" size={14} color={palette.text3} />
            <Ionicons name="add" size={10} color={palette.text3} />
          </Pressable>
        )}
      </Pressable>
    </View>
  )
}

function QueuedMessageRow({
  message,
  palette,
  senderName,
  onRetry,
  onCancel,
}: {
  message: QueuedMessage
  palette: Palette
  senderName: string
  onRetry: () => void
  onCancel: () => void
}) {
  const statusLabel =
    message.status === 'sending'
      ? '送信中…'
      : message.status === 'failed'
        ? '送信を完了できませんでした'
        : '電波待ち・接続後に自動送信'
  return (
    <View style={styles.messageRow}>
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.accentSoft }]}>
        <Text style={[styles.avatarInitial, { color: palette.accentText }]}>
          {initials(senderName)}
        </Text>
      </View>
      <View style={styles.messageBody}>
        <View style={styles.messageMeta}>
          <Text style={[styles.senderName, { color: palette.text }]}>{senderName}</Text>
          <Text style={[styles.messageTime, { color: palette.text4 }]}>未送信</Text>
        </View>
        <Text style={[styles.messageText, { color: palette.text2 }]}>{message.content}</Text>
        <View style={styles.queueStatusRow}>
          <Ionicons
            name={message.status === 'failed' ? 'alert-circle-outline' : 'cloud-upload-outline'}
            size={13}
            color={message.status === 'failed' ? palette.redText : palette.accent}
          />
          <Text
            style={[
              styles.queueStatus,
              { color: message.status === 'failed' ? palette.redText : palette.accentText },
            ]}
          >
            {statusLabel}
          </Text>
          {message.status === 'failed' && (
            <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={6}>
              <Text style={[styles.queueAction, { color: palette.accentText }]}>再送</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6}>
            <Text style={[styles.queueAction, { color: palette.text4 }]}>取消</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function ActionButton({
  icon,
  label,
  palette,
  destructive = false,
  onPress,
}: {
  icon: IoniconName
  label: string
  palette: Palette
  destructive?: boolean
  onPress: () => void
}) {
  const color = destructive ? palette.redText : palette.text
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderTopColor: palette.divider, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.actionButtonLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

export default function ChatThreadScreen() {
  const { channelId, channelName } = useLocalSearchParams<{
    channelId: string
    channelName?: string
  }>()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const messagesQuery = useMessages(channelId ?? null)
  const markRead = useMarkChannelRead(channelId ?? '')
  const toggleReaction = useToggleMessageReaction(channelId ?? '')
  const editMessage = useEditMessage(channelId ?? '')
  const deleteMessage = useDeleteMessage(channelId ?? '')
  const toggleBookmark = useToggleMessageBookmark(channelId ?? '')
  const upload = useAttachmentUpload(channelId ?? '')
  const { data: me } = useMe()
  const session = useSession()
  const offlineQueue = useOfflineMessageQueue()
  const [draft, setDraft] = React.useState('')
  const [isQueueing, setIsQueueing] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [replyTarget, setReplyTarget] = React.useState<MessageDto | null>(null)
  const [editingMessage, setEditingMessage] = React.useState<MessageDto | null>(null)
  const [actionTarget, setActionTarget] = React.useState<MessageDto | null>(null)
  const [reactionTarget, setReactionTarget] = React.useState<MessageDto | null>(null)
  const messages = messagesQuery.data ?? []
  const queuedMessages = offlineQueue.messages.filter((message) => message.channelId === channelId)
  // 送信失敗時の catch は非同期に発火するため、常に最新の channelId を参照できるようにする
  const channelIdRef = React.useRef(channelId)
  channelIdRef.current = channelId
  const draftRef = React.useRef(draft)
  draftRef.current = draft

  // chats/[channelId] は chats/index と同じ Tab Navigator 内の兄弟タブ（href: null）のため、
  // 他のタブへ切り替えても既定では画面がアンマウントされない。
  // Realtimeによるキャッシュ更新があっても、フォーカスが外れている間は既読化を止める。
  const [isFocused, setIsFocused] = React.useState(true)
  React.useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => setIsFocused(true))
    const unsubBlur = navigation.addListener('blur', () => setIsFocused(false))
    return () => {
      unsubFocus()
      unsubBlur()
    }
  }, [navigation])

  // タブ内のフォーカスが保たれたままアプリがバックグラウンド・ロックされた場合も
  // navigation の focus/blur は発火しない。AppState でアプリ自体の前面状態も見る
  const [isAppActive, setIsAppActive] = React.useState(AppState.currentState === 'active')
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setIsAppActive(state === 'active'))
    return () => sub.remove()
  }, [])

  // 表示中に届いたRealtime更新も既読化する（開いた瞬間だけだと、購読中の
  // 新着がスレッド上には表示されるのに未読バッジへ残り続けてしまう）。
  // /read はサーバー側の最新メッセージを既読化するため、取得中（キャッシュがまだ最新と
  // 限らない状態）に呼ぶと、画面にまだ表示していない新着まで既読化されてしまう。
  // そのため fetch 完了後（isFetching が false）かつ直近の取得が成功している場合のみ既読化する
  const markReadRef = React.useRef(markRead)
  markReadRef.current = markRead
  const lastReadMessageIdRef = React.useRef<string | null>(null)

  // chats/[channelId] は隠しタブとして常駐するため、一覧に戻って別チャンネルを開いても
  // コンポーネントは再マウントされない。channelId が変わったら下書き・エラー・既読化の
  // 状態を初期化しないと、A に入力した下書きが B に誤送信されてしまう。
  // また refetchOnMount: 'always' はコンポーネント自体の再マウント時にしか働かないため、
  // 常駐したまま queryKey だけが切り替わるこのケースでは staleTime 内のキャッシュが
  // そのまま既読化判定に使われてしまう。channelId 変更時は明示的に再取得する
  const previousChannelIdRef = React.useRef(channelId)
  // 「今の channelId で取得が完了した」ことを明示的に確認できたチャンネルID。
  // refetch() 呼び出しは非同期なので、呼び出した直後の同じレンダーでは
  // messagesQuery.isFetching がまだ false（切替前のキャッシュ由来）のことがあり、
  // isFetching だけを見ると未取得のキャッシュで既読化してしまう
  const confirmedFetchedChannelIdRef = React.useRef<string | null>(null)
  // 直前のチャンネルの fetch が完了しないまま切り替えると、この ref に前チャンネルの
  // 「取得中だった」痕跡が残り、新チャンネルの isFetching===false（切替直後のキャッシュ）を
  // 誤って「取得完了」と判定してしまう。channelId 変更時は必ずリセットする
  const wasFetchingRef = React.useRef(false)
  React.useEffect(() => {
    if (previousChannelIdRef.current === channelId) return
    previousChannelIdRef.current = channelId
    setDraft('')
    setSendError(null)
    setReplyTarget(null)
    setEditingMessage(null)
    setActionTarget(null)
    setReactionTarget(null)
    upload.clearUploads()
    lastReadMessageIdRef.current = null
    confirmedFetchedChannelIdRef.current = null
    wasFetchingRef.current = false
    void messagesQuery.refetch()
  }, [channelId])

  React.useEffect(() => {
    if (messagesQuery.isFetching) {
      wasFetchingRef.current = true
      return
    }
    if (!wasFetchingRef.current) return
    wasFetchingRef.current = false
    if (!messagesQuery.isError) confirmedFetchedChannelIdRef.current = channelId
  }, [channelId, messagesQuery.isFetching, messagesQuery.isError])

  React.useEffect(() => {
    if (
      !channelId ||
      !isFocused ||
      !isAppActive ||
      messagesQuery.isFetching ||
      messagesQuery.isError ||
      messages.length === 0
    )
      return
    if (confirmedFetchedChannelIdRef.current !== channelId) return
    if (markReadRef.current.isPending) return
    const lastId = messages[messages.length - 1]?.id
    if (!lastId || lastReadMessageIdRef.current === lastId) return
    // 成功した場合のみ ref を進める。失敗時は次のポーリングで同じメッセージに対して再試行する
    markReadRef.current.mutate(undefined, {
      onSuccess: () => {
        lastReadMessageIdRef.current = lastId
      },
    })
  }, [channelId, messages, messagesQuery.isFetching, messagesQuery.isError, isFocused, isAppActive])

  async function handleSend() {
    const content = draft.trim()
    if (editingMessage) {
      if (!content || editMessage.isPending) return
      setSendError(null)
      try {
        await editMessage.mutateAsync({ messageId: editingMessage.id, content })
        setDraft('')
        setEditingMessage(null)
      } catch (error) {
        setSendError(error instanceof Error ? error.message : 'メッセージの編集に失敗しました')
      }
      return
    }
    const attachmentFileIds = upload.doneFileIds
    if (
      (!content && attachmentFileIds.length === 0) ||
      !channelId ||
      !offlineQueue.ready ||
      isQueueing ||
      upload.isUploading ||
      upload.hasFailedUploads
    )
      return
    const sendingChannelId = channelId
    const sendingDraft = draft
    const parentMessageId = replyTarget?.id
    const clientMessageId = createClientMessageId()
    setSendError(null)
    setIsQueueing(true)
    try {
      // ネットワークへ送る前に必ず端末へ保存する。POST応答待ち中にアプリが終了しても、
      // 次回起動時に同じ clientMessageId で再送できるため本文を失わない。
      await offlineQueue.enqueue({
        id: clientMessageId,
        channelId: sendingChannelId,
        content,
        createdAt: new Date().toISOString(),
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(attachmentFileIds.length > 0 ? { attachmentFileIds } : {}),
      })
      if (channelIdRef.current !== sendingChannelId) return
      if (draftRef.current === sendingDraft) setDraft('')
      setReplyTarget(null)
      upload.clearUploads()
    } catch {
      if (channelIdRef.current !== sendingChannelId) return
      setSendError('未送信メッセージを端末に保存できませんでした。再度送信してください。')
    } finally {
      setIsQueueing(false)
    }
  }

  const beginReply = (message: MessageDto) => {
    setActionTarget(null)
    setEditingMessage(null)
    setReplyTarget(message)
  }

  const beginEdit = (message: MessageDto) => {
    setActionTarget(null)
    setReplyTarget(null)
    setEditingMessage(message)
    setDraft(message.content)
  }

  const confirmDelete = (message: MessageDto) => {
    setActionTarget(null)
    Alert.alert('メッセージを削除しますか？', 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteMessage.mutate(message.id, {
            onError: (error) =>
              setSendError(
                error instanceof Error ? error.message : 'メッセージの削除に失敗しました',
              ),
          })
        },
      },
    ])
  }

  const handleBookmark = (message: MessageDto) => {
    setActionTarget(null)
    toggleBookmark.mutate(message.id, {
      onError: (error) =>
        setSendError(error instanceof Error ? error.message : 'ブックマークの更新に失敗しました'),
    })
  }

  const canSubmit = editingMessage
    ? draft.trim().length > 0 && !editMessage.isPending
    : (draft.trim().length > 0 || upload.doneFileIds.length > 0) &&
      offlineQueue.ready &&
      !isQueueing &&
      !upload.isUploading &&
      !upload.hasFailedUploads

  const handleToggleReaction = (messageId: string, emoji: string) => {
    toggleReaction.mutate(
      { messageId, emoji },
      {
        onError: (err) => {
          setSendError(err instanceof Error ? err.message : 'リアクションの更新に失敗しました')
        },
      },
    )
  }

  // アクセス権のないチャンネル（参加外プロジェクトのゲスト等）は 403 を返す。
  // 生のエラーではなく「参加していない」ことを明示する案内を出す
  const isAccessDenied =
    messagesQuery.error instanceof ChannelMessagesError && messagesQuery.error.status === 403
  // セッション切れの 401 も「Unauthorized」等の生の文言を出さず、専用の案内にする
  const isSessionExpired =
    messagesQuery.error instanceof ChannelMessagesError && messagesQuery.error.status === 401

  // FlatList を inverted 表示するため新しい順に並べ替える。
  const reversedMessages = [...messages].reverse()
  const listItems = [
    ...queuedMessages
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((message) => ({ kind: 'queued' as const, message })),
    ...reversedMessages.map((message) => ({ kind: 'server' as const, message })),
  ]

  const openSearch = () => {
    if (!channelId) return
    router.push({
      pathname: '/(app)/chat-tools',
      params: {
        path: `/chats/${channelId}?nativeAux=1&panel=search`,
        title: 'メッセージ検索',
        returnChannelId: channelId,
        ...(channelName ? { returnChannelName: channelName } : {}),
      },
    })
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: palette.card, borderBottomColor: palette.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="チャット一覧へ戻る"
          style={styles.backButton}
          onPress={() => router.replace('/(app)/chats')}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={palette.accent} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
          {channelName || 'チャット'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="メッセージを検索"
          style={styles.headerButton}
          onPress={openSearch}
          hitSlop={6}
        >
          <Ionicons name="search-outline" size={19} color={palette.text3} />
        </Pressable>
      </View>

      {messagesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : isAccessDenied ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={24} color={palette.text3} />
          <Text style={[styles.errorTitle, { color: palette.text }]}>
            このチャンネルは表示できません
          </Text>
          <Text style={[styles.errorBody, { color: palette.text3 }]}>
            このプロジェクトに参加していないため、チャットを開けません。閲覧するにはワークスペースの管理者にプロジェクトへの招待を依頼してください。
          </Text>
        </View>
      ) : isSessionExpired ? (
        <View style={styles.center}>
          <Ionicons name="log-in-outline" size={24} color={palette.text3} />
          <Text style={[styles.errorTitle, { color: palette.text }]}>セッションが切れました</Text>
          <Text style={[styles.errorBody, { color: palette.text3 }]}>
            再度ログインしてください。
          </Text>
        </View>
      ) : (
        <View style={styles.messageListContainer}>
          {messagesQuery.error && (
            <View
              accessibilityRole="alert"
              style={[
                styles.refreshError,
                { backgroundColor: palette.card2, borderColor: palette.redText },
              ]}
            >
              <Ionicons name="cloud-offline-outline" size={16} color={palette.redText} />
              <Text style={[styles.refreshErrorText, { color: palette.redText }]} numberOfLines={2}>
                {messagesQuery.error.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="メッセージを再読み込み"
                disabled={messagesQuery.isFetching}
                onPress={() => void messagesQuery.refetch()}
                hitSlop={6}
              >
                {messagesQuery.isFetching ? (
                  <ActivityIndicator size="small" color={palette.redText} />
                ) : (
                  <Text style={[styles.refreshErrorAction, { color: palette.redText }]}>再試行</Text>
                )}
              </Pressable>
            </View>
          )}
          <FlatList
            style={styles.messageList}
            data={listItems}
            inverted
            keyExtractor={(item) => `${item.kind}:${item.message.id}`}
            renderItem={({ item }) =>
              item.kind === 'queued' ? (
                <QueuedMessageRow
                  message={item.message}
                  palette={palette}
                  senderName={me?.displayName ?? '自分'}
                  onRetry={() => offlineQueue.retry(item.message.id)}
                  onCancel={() => offlineQueue.cancel(item.message.id)}
                />
              ) : (
                <ChatMessageRow
                  message={item.message}
                  palette={palette}
                  onToggleReaction={handleToggleReaction}
                  onAddReaction={setReactionTarget}
                  onOpenActions={setActionTarget}
                  {...(session?.access_token ? { accessToken: session.access_token } : {})}
                />
              )
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              messagesQuery.error ? null : (
                <Text style={[styles.empty, { color: palette.text4 }]}>
                  まだメッセージはありません。最初のメッセージを送ってみましょう！
                </Text>
              )
            }
          />
        </View>
      )}

      {!isAccessDenied && !isSessionExpired && (
        <View
          style={[
            styles.composerArea,
            {
              backgroundColor: palette.card,
              borderTopColor: palette.border,
              paddingBottom: insets.bottom || 12,
            },
          ]}
        >
          {sendError && (
            <Text style={[styles.sendError, { color: palette.redText }]}>{sendError}</Text>
          )}
          {offlineQueue.restoreError && (
            <View style={styles.queueRestoreError} accessibilityRole="alert">
              <Text style={[styles.queueRestoreErrorText, { color: palette.redText }]}>
                {offlineQueue.restoreError}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="未送信メッセージを再読み込み"
                onPress={offlineQueue.retryRestore}
                hitSlop={6}
              >
                <Text style={[styles.queueRestoreRetry, { color: palette.redText }]}>再試行</Text>
              </Pressable>
            </View>
          )}
          {(replyTarget || editingMessage) && (
            <View
              style={[
                styles.composerContext,
                { backgroundColor: palette.card2, borderColor: palette.border },
              ]}
            >
              <Ionicons
                name={editingMessage ? 'create-outline' : 'arrow-undo-outline'}
                size={15}
                color={palette.accent}
              />
              <View style={styles.composerContextText}>
                <Text style={[styles.composerContextTitle, { color: palette.text3 }]}>
                  {editingMessage
                    ? 'メッセージを編集中'
                    : `${replyTarget?.senderName ?? ''} に返信`}
                </Text>
                {!editingMessage && (
                  <Text
                    style={[styles.composerContextBody, { color: palette.text4 }]}
                    numberOfLines={1}
                  >
                    {replyTarget ? parseMentions(replyTarget.content) || '（添付ファイル）' : ''}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返信または編集をキャンセル"
                onPress={() => {
                  if (editingMessage) setDraft('')
                  setEditingMessage(null)
                  setReplyTarget(null)
                }}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={palette.text4} />
              </Pressable>
            </View>
          )}
          {!editingMessage && (
            <View style={styles.attachmentActions}>
              <Pressable style={styles.attachmentAction} onPress={() => void upload.pickImage()}>
                <Ionicons name="image-outline" size={15} color={palette.text3} />
                <Text style={[styles.attachmentActionText, { color: palette.text3 }]}>画像</Text>
              </Pressable>
              <Pressable style={styles.attachmentAction} onPress={() => void upload.pickDocument()}>
                <Ionicons name="attach-outline" size={15} color={palette.text3} />
                <Text style={[styles.attachmentActionText, { color: palette.text3 }]}>
                  ファイル
                </Text>
              </Pressable>
            </View>
          )}
          {upload.uploads.length > 0 && !editingMessage && (
            <View style={styles.uploads}>
              {upload.uploads.map((pending) => (
                <View
                  key={pending.id}
                  style={[styles.uploadRow, { backgroundColor: palette.card2 }]}
                >
                  {pending.status === 'uploading' && (
                    <ActivityIndicator size="small" color={palette.accent} />
                  )}
                  {pending.status === 'done' && (
                    <Ionicons name="checkmark-circle" size={16} color={palette.accent} />
                  )}
                  {pending.status === 'error' && (
                    <Ionicons name="alert-circle" size={16} color={palette.redText} />
                  )}
                  <Text
                    style={[
                      styles.uploadName,
                      { color: pending.status === 'error' ? palette.redText : palette.text2 },
                    ]}
                    numberOfLines={1}
                  >
                    {pending.status === 'error' && pending.error
                      ? `${pending.fileName}: ${pending.error}`
                      : pending.fileName}
                  </Text>
                  <Pressable onPress={() => upload.removeUpload(pending.id)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={palette.text4} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View
            style={[
              styles.composer,
              { backgroundColor: palette.card2, borderColor: palette.border },
            ]}
          >
            <TextInput
              accessibilityLabel="メッセージを入力"
              style={[styles.input, { color: palette.text }]}
              value={draft}
              onChangeText={(value) => {
                setDraft(value)
                if (sendError) setSendError(null)
              }}
              placeholder="メッセージを入力..."
              placeholderTextColor={palette.text4}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="メッセージを送信"
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: palette.accent,
                  opacity: !canSubmit ? 0.45 : pressed ? 0.75 : 1,
                },
              ]}
              onPress={() => void handleSend()}
              disabled={!canSubmit}
            >
              {isQueueing || editMessage.isPending ? (
                <ActivityIndicator size="small" color={palette.onAccent} />
              ) : (
                <Ionicons
                  name={editingMessage ? 'checkmark' : 'send'}
                  size={17}
                  color={palette.onAccent}
                />
              )}
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        transparent
        visible={actionTarget !== null}
        animationType="fade"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActionTarget(null)} />
        <View
          style={[
            styles.actionSheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={[styles.sheetGrip, { backgroundColor: palette.border }]} />
          <ActionButton
            icon="arrow-undo-outline"
            label="返信"
            palette={palette}
            onPress={() => actionTarget && beginReply(actionTarget)}
          />
          <ActionButton
            icon={actionTarget?.bookmarked ? 'bookmark' : 'bookmark-outline'}
            label={actionTarget?.bookmarked ? 'ブックマークを解除' : 'ブックマーク'}
            palette={palette}
            onPress={() => actionTarget && handleBookmark(actionTarget)}
          />
          <ActionButton
            icon="happy-outline"
            label="リアクションを追加"
            palette={palette}
            onPress={() => {
              setReactionTarget(actionTarget)
              setActionTarget(null)
            }}
          />
          {actionTarget?.senderId === me?.id && (
            <>
              <ActionButton
                icon="create-outline"
                label="編集"
                palette={palette}
                onPress={() => actionTarget && beginEdit(actionTarget)}
              />
              <ActionButton
                icon="trash-outline"
                label="削除"
                palette={palette}
                destructive
                onPress={() => actionTarget && confirmDelete(actionTarget)}
              />
            </>
          )}
        </View>
      </Modal>

      <Modal
        transparent
        visible={reactionTarget !== null}
        animationType="fade"
        onRequestClose={() => setReactionTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReactionTarget(null)} />
        <View
          style={[
            styles.reactionSheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text style={[styles.reactionSheetTitle, { color: palette.text }]}>リアクション</Text>
          <View style={styles.reactionChoices}>
            {['👍', '❤️', '😂', '🎉', '🙌', '👀'].map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`${emoji}を追加`}
                onPress={() => {
                  if (reactionTarget) handleToggleReaction(reactionTarget.id, emoji)
                  setReactionTarget(null)
                }}
                style={[styles.reactionChoice, { backgroundColor: palette.card2 }]}
              >
                <Text style={styles.reactionChoiceText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 51,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 5 },
  headerButton: { padding: 5 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
  errorTitle: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 20 },
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
  queueStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  queueStatus: { fontSize: 11.5, flexShrink: 1 },
  queueAction: { fontSize: 11.5, fontWeight: '700' },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderLeftWidth: 2,
    marginBottom: 5,
    paddingLeft: 7,
  },
  replySender: { fontSize: 11.5, fontWeight: '600', flexShrink: 0 },
  replyText: { fontSize: 11.5, flex: 1 },
  attachments: { gap: 6 },
  attachmentsWithContent: { marginTop: 8 },
  attachmentChip: {
    maxWidth: 240,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachmentImage: { width: 72, height: 54, borderRadius: 6 },
  attachmentText: { flex: 1, fontSize: 12.5 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  reaction: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
  },
  reactionText: { fontSize: 11, fontWeight: '600' },
  reactionAddStandalone: {
    alignSelf: 'flex-start',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    marginTop: 6,
  },
  systemRow: { alignItems: 'center', paddingVertical: 6 },
  systemMessage: {
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  composerArea: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8 },
  messageListContainer: { flex: 1 },
  messageList: { flex: 1 },
  refreshError: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshErrorText: { flex: 1, fontSize: 12, lineHeight: 16 },
  refreshErrorAction: { fontSize: 12, fontWeight: '700' },
  sendError: { fontSize: 12, marginBottom: 6 },
  queueRestoreError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  queueRestoreErrorText: { flex: 1, fontSize: 12, lineHeight: 16 },
  queueRestoreRetry: { fontSize: 12, fontWeight: '700' },
  composerContext: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 7,
  },
  composerContextText: { flex: 1, minWidth: 0 },
  composerContextTitle: { fontSize: 11.5, fontWeight: '700' },
  composerContextBody: { fontSize: 11.5, marginTop: 1 },
  attachmentActions: { flexDirection: 'row', gap: 16, paddingHorizontal: 4, paddingBottom: 7 },
  attachmentAction: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  attachmentActionText: { fontSize: 12, fontWeight: '600' },
  uploads: { gap: 5, marginBottom: 7 },
  uploadRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 8,
    paddingHorizontal: 9,
  },
  uploadName: { flex: 1, fontSize: 11.5 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingVertical: 7,
    fontSize: 14,
    lineHeight: 20,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  actionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  sheetGrip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 6 },
  actionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  actionButtonLabel: { fontSize: 15, fontWeight: '600' },
  reactionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  reactionSheetTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  reactionChoices: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  reactionChoice: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  reactionChoiceText: { fontSize: 24 },
})
