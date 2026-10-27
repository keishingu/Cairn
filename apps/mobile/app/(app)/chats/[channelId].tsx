import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
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
  useMoveMessagesToThread,
  useToggleMessageBookmark,
  useToggleMessageReaction,
} from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import type { ThemePalette } from '../../../lib/theme'
import { isEdgeBackSwipe } from '../../../lib/edge-back-swipe'
import { useAppAppearance } from '../../../components/appearance-provider'
import { ChatImageViewer } from '../../../components/chat-image-viewer'
import { ChatMarkdownViewer } from '../../../components/chat-markdown-viewer'
import { ChatOfficeViewer } from '../../../components/chat-office-viewer'
import { ChatPdfViewer } from '../../../components/chat-pdf-viewer'
import { MobileMarkdown } from '../../../components/mobile-markdown'
import { MessageCard, type CardAction } from '../../../components/message-card'
import { AppEntryActions } from '../../../components/app-entry-actions'
import { postCardAction } from '../../../lib/card-actions'
import { LinkedTasksModal, MessageTaskPickerModal } from '../../../components/message-task-picker'
import { messageTaskErrorMessage, type MessageTaskCandidate, type MessageTaskSubmitItem } from '../../../lib/message-task'
import { useAttachmentUpload } from '../../../hooks/use-attachment-upload'
import { useMe } from '../../../hooks/use-account'
import { useSession } from '../../../lib/session-context'
import { attachmentRequestHeaders, type AttachmentAuth } from '../../../lib/attachment-auth'
import { useSelectedWorkspaceId } from '../../../hooks/use-selected-workspace-id'
import { displayAppName, FEATURE_FLAGS, chatProjectRoleLabel, filterMentionCandidates, insertLineTaskMarkers, openChannelDisappeared } from '@cairn/shared'
import { shareCachedAttachment } from '../../../lib/attachment-cache'
import { attachmentViewer, isImageMime, isPreviewableAttachment } from '../../../lib/attachment-file'
import { API_BASE_URL } from '../../../lib/env'
import { createClientMessageId, type QueuedMessage } from '../../../lib/offline-message-queue'
import { useOfflineMessageQueue } from '../../../components/offline-message-queue-provider'
import { apiActionError, apiFetch } from '../../../lib/api-fetch'
import {
  findMentionQuery,
  getReactionPeopleSummary,
  insertMention,
  parseEditableMentions,
  rebaseMentionSelections,
  resolveMobileMarkdownLink,
  serializeMentions,
  splitMentionSegments,
} from '../../../lib/mobile-chat-state'
import type { MentionSelection } from '../../../lib/mobile-chat-state'
import {
  useChannelMembers,
  useProjectMembers,
  useWorkspaceChannels,
  useWorkspaceDms,
  useWorkspaceMembers,
} from '../../../hooks/use-chat-channels'
import { useProjectChannels } from '../../../hooks/use-projects'
import { MoveToThreadSheet } from '../../../components/move-to-thread-sheet'
import { TextSelectSheet } from '../../../components/text-select-sheet'
import * as Clipboard from 'expo-clipboard'
import { canMoveMessageToThread } from '../../../lib/move-to-thread'
import { useAppLocale, useT } from '../../../components/locale-provider'
import { ReactionPicker } from '../../../components/reaction-picker'
import { useReactionHistory } from '../../../hooks/use-reaction-history'
import { createReactionHistoryQueue } from '../../../lib/reaction-history'
import { UserAvatar } from '../../../components/user-avatar'
import { chatInputSubmitBehavior, loadChatSendOnEnter, saveChatSendOnEnter } from '../../../lib/chat-send-key'

type Palette = ThemePalette
type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function formatTime(value: string) {
  const source = new Date(value)
  return `${source.getMonth() + 1}/${source.getDate()} ${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}`
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
  mimeType: string | null,
  auth: AttachmentAuth,
  t: (message: string, values?: Record<string, string | number>) => string,
): Promise<void> {
  try {
    await shareCachedAttachment({
      fileUrl: attachmentUrl(fileId),
      fileId,
      fileName,
      auth,
      mimeType,
      dialogTitle: t('Open file'),
      t,
    })
  } catch (error) {
    console.error('[chat] 添付ファイルを開けませんでした:', error)
    Alert.alert(
      t('Could not open the file'),
      error instanceof Error ? error.message : t('Please try again in a moment.'),
    )
  }
}

function AttachmentChip({
  attachment,
  palette,
  auth,
  onOpenPreview,
}: {
  attachment: MessageDto['attachments'][number]
  palette: Palette
  auth?: AttachmentAuth
  onOpenPreview: (attachment: MessageDto['attachments'][number]) => void
}) {
  const t = useT()
  const isImage = isImageMime(attachment.mimeType)
  const isPreviewable = isPreviewableAttachment(attachment.mimeType, attachment.fileName, Platform.OS)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isPreviewable ? t('View {name}', { name: attachment.fileName }) : t('Open {name}', { name: attachment.fileName })
      }
      disabled={!auth}
      onPress={() => {
        if (!auth) return
        if (isPreviewable) {
          onOpenPreview(attachment)
          return
        }
        void openAttachmentFile(
          attachment.fileId,
          attachment.fileName,
          attachment.mimeType,
          auth,
          t,
        )
      }}
      style={({ pressed }) => [
        styles.attachmentChip,
        { backgroundColor: palette.card2, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {isImage && auth ? (
        <Image
          source={{
            uri: attachmentUrl(attachment.fileId),
            headers: attachmentRequestHeaders(auth),
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
  mentionNames,
  attachmentAuth,
  onToggleReaction,
  onAddReaction,
  onShowReactors,
  onLinkPress,
  onOpenActions,
  onOpenPreview,
  onOpenTask,
  onShowTasks,
}: {
  message: MessageDto
  palette: Palette
  /** userId → 現在の表示名。カードの mrkdwn のメンション（`<@id>`、名前なし）を解決する */
  mentionNames: Map<string, string>
  attachmentAuth?: AttachmentAuth
  onToggleReaction: (messageId: string, emoji: string) => void
  onAddReaction: (message: MessageDto) => void
  onShowReactors: (emoji: string, messageId: string) => void
  onLinkPress: (url: string) => boolean
  onOpenActions: (message: MessageDto) => void
  onOpenPreview: (attachment: MessageDto['attachments'][number]) => void
  onOpenTask: (taskId: string) => void
  onShowTasks: (tasks: MessageDto['linkedTasks']) => void
}) {
  const t = useT()
  // アプリの発言は現在のアプリ名で出す（Bot の profile 名はインストール時の名前のまま残り得る）
  const senderName = message.senderApp ? displayAppName(message.senderApp, t) : message.senderName
  // カードのメンションは、サーバーが解決した名前（非活性のメンバーを含む）を優先し、無ければ現在のメンバー一覧で引く
  // カードの操作はアプリへ届ける。結果のカードはアプリの chat.update が Realtime で届いて置き換わる
  const { locale } = useAppLocale()
  const handleCardAction = React.useCallback((action: CardAction) => postCardAction(message.id, message.blocksRevision ?? '', action, locale), [message.id, message.blocksRevision, locale])
  const cardMentionNames = React.useMemo(() => {
    if (!message.mentionNames) return mentionNames
    const merged = new Map(mentionNames)
    for (const [id, name] of Object.entries(message.mentionNames)) merged.set(id, name)
    return merged
  }, [message.mentionNames, mentionNames])
  const projectRoleLabelText = chatProjectRoleLabel({
    legacyRole: message.senderProjectRole,
    roleName: message.senderProjectRoleName,
    configuredLegacyRole: message.senderProjectRoleLegacy,
  })
  const projectRoleColor = message.senderProjectRoleName ? message.senderProjectRoleColor : null
  // 行末に「✓ タスク」ラベルを出せたタスクは下部のチップから除く（行に対応しない分・ブロック中の本文は従来どおりチップで示す）
  const chipTasks = React.useMemo(() => {
    if (message.linkedTasks.length === 0) return message.linkedTasks
    // カード（blocks）は本文を Markdown で描かず行末ラベルを出せないため、すべてチップで示す（代替テキストの行で置けた扱いにして消さない）
    if (message.blocked || message.content.length === 0 || message.messageType === 'blocks') return message.linkedTasks
    const { placed } = insertLineTaskMarkers(message.content, message.linkedTasks)
    return message.linkedTasks.filter((_, index) => !placed[index])
  }, [message.linkedTasks, message.content, message.blocked, message.messageType])

  if (message.messageType === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text
          style={[
            styles.systemMessage,
            { backgroundColor: palette.card2, borderColor: palette.divider, color: palette.text4 },
          ]}
        >
          {parseMentions(message.content, t)}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.messageRow}>
      <UserAvatar name={senderName} url={message.senderApp ? message.senderApp.iconUrl : message.senderAvatarUrl} size={36} />

      <View style={styles.messageBody}>
        <Pressable onLongPress={() => onOpenActions(message)} delayLongPress={350}>
          <View style={styles.messageMeta}>
            <Text style={[styles.senderName, { color: palette.text }]}>{senderName}</Text>
            {/* 人間と取り違えないよう、アプリの発言には必ず印を付ける */}
            {message.senderApp && (
              <Text style={[styles.projectRole, { backgroundColor: palette.card2, color: palette.text3 }]}>
                {message.senderApp.uninstalled ? `${t('App')} · ${t('Uninstalled')}` : t('App')}
              </Text>
            )}
            {projectRoleLabelText && (
              <Text
                style={[
                  styles.projectRole,
                  {
                    backgroundColor: projectRoleColor ? palette.card2 : palette.accentSoft,
                    color: projectRoleColor ?? palette.accentText,
                  },
                ]}
              >
                {projectRoleLabelText}
              </Text>
            )}
            <Text style={[styles.messageTime, { color: palette.text4 }]}>
              {formatTime(message.createdAt)}
            </Text>
            {message.isEdited && (
              <Text style={[styles.edited, { color: palette.text4 }]}>{t('Edited')}</Text>
            )}
            {message.bookmarked && <Ionicons name="bookmark" size={12} color={palette.accent} />}
          </View>

          {(message.senderProfileAttributes?.length ?? 0) > 0 && (
            <View style={styles.profileAttributes}>
              {message.senderProfileAttributes?.map((attribute) => (
                <Text
                  key={attribute.id}
                  style={[
                    styles.profileAttribute,
                    {
                      backgroundColor: palette.profileAttributeColors[attribute.color].background,
                      color: palette.profileAttributeColors[attribute.color].text,
                    },
                  ]}
                >
                  {attribute.name}
                </Text>
              ))}
            </View>
          )}

          {message.replyTo && (
            <View style={[styles.replyPreview, { borderLeftColor: palette.accent }]}>
              <Ionicons name="arrow-undo-outline" size={13} color={palette.text4} />
              <Text style={[styles.replySender, { color: palette.text3 }]} numberOfLines={1}>
                {message.replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, { color: palette.text4 }]} numberOfLines={1}>
                {message.replyTo.isDeleted
                  ? t('Deleted message')
                  : parseMentions(message.replyTo.content, t) || t('(Attachment)')}
              </Text>
            </View>
          )}

          {message.blocked ? (
            <Text style={[styles.messageText, { color: palette.text3 }]}>{t('Message from a blocked user (long-press the menu to show it)')}</Text>
          ) : message.messageType === 'blocks' ? (
            <MessageCard
              blocks={message.blocks}
              fallbackText={message.content}
              palette={palette}
              mentionNames={cardMentionNames}
              onLinkPress={onLinkPress}
              onAction={handleCardAction}
              revision={message.blocksRevision}
            />
          ) : (
            message.content.length > 0 && (
              <MobileMarkdown
                content={message.content}
                palette={palette}
                onLinkPress={onLinkPress}
                lineTasks={message.linkedTasks}
                onTaskPress={onOpenTask}
                onLongPress={() => onOpenActions(message)}
              />
            )
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
                  onOpenPreview={onOpenPreview}
                  {...(attachmentAuth ? { auth: attachmentAuth } : {})}
                />
              ))}
            </View>
          )}
        </Pressable>

        {chipTasks.length > 0 && (() => {
          const tasks = chipTasks
          const doneCount = tasks.filter((task) => task.status === 'done').length
          const allDone = doneCount === tasks.length
          const single = tasks.length === 1 ? tasks[0] : undefined
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={single ? t('Open task') : t('Show tasks')}
              onPress={() => (single ? onOpenTask(single.id) : onShowTasks(tasks))}
              style={({ pressed }) => [
                styles.taskChip,
                {
                  backgroundColor: allDone ? palette.card2 : palette.accentSoft,
                  borderColor: allDone ? palette.border : palette.accent,
                  opacity: pressed ? 0.7 : allDone ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name={allDone ? 'checkbox' : 'checkbox-outline'}
                size={13}
                color={allDone ? palette.text3 : palette.accentText}
              />
              <Text style={[styles.reactionText, { color: allDone ? palette.text3 : palette.accentText }]}>
                {single ? t('Task') : t('Task {done}/{total}', { done: doneCount, total: tasks.length })}
              </Text>
            </Pressable>
          )
        })()}

        {message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                accessibilityRole="button"
                accessibilityLabel={t('{emoji} {count} reactions', { emoji: reaction.emoji, count: reaction.count })}
                accessibilityHint={t('Long-press to see who reacted')}
                onPress={() => onToggleReaction(message.id, reaction.emoji)}
                onLongPress={() => onShowReactors(reaction.emoji, message.id)}
                delayLongPress={350}
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
              accessibilityLabel={t('Add reaction')}
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
            accessibilityLabel={t('Add reaction')}
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
      </View>
    </View>
  )
}

function QueuedMessageRow({
  message,
  palette,
  senderName,
  onLinkPress,
  onRetry,
  onCancel,
}: {
  message: QueuedMessage
  palette: Palette
  senderName: string
  onLinkPress: (url: string) => boolean
  onRetry: () => void
  onCancel: () => void
}) {
  const t = useT()
  const statusLabel =
    message.status === 'sending'
      ? t('Sending…')
      : message.status === 'failed'
        ? t('Could not finish sending')
        : t('Waiting for a connection. It will send automatically.')
  return (
    <View style={styles.messageRow}>
      <UserAvatar name={senderName} size={36} />
      <View style={styles.messageBody}>
        <View style={styles.messageMeta}>
          <Text style={[styles.senderName, { color: palette.text }]}>{senderName}</Text>
          <Text style={[styles.messageTime, { color: palette.text4 }]}>{t('Unsent')}</Text>
        </View>
        <MobileMarkdown
          content={message.content}
          palette={palette}
          onLinkPress={onLinkPress}
          {...(message.mentionNames ? { mentionNames: message.mentionNames } : {})}
        />
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
              <Text style={[styles.queueAction, { color: palette.accentText }]}>{t('Resend')}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6}>
            <Text style={[styles.queueAction, { color: palette.text4 }]}>{t('Discard')}</Text>
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
  const t = useT()
  const { channelId, channelName, channelType, projectId, isPrivate } = useLocalSearchParams<{
    channelId: string
    channelName?: string
    channelType?: 'project' | 'workspace' | 'dm'
    projectId?: string
    isPrivate?: string
  }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { palette } = useAppAppearance()
  const messagesQuery = useMessages(channelId ?? null)
  const markRead = useMarkChannelRead(channelId ?? '')
  const toggleReaction = useToggleMessageReaction(channelId ?? '')
  const editMessage = useEditMessage(channelId ?? '')
  const deleteMessage = useDeleteMessage(channelId ?? '')
  const toggleBookmark = useToggleMessageBookmark(channelId ?? '')
  const moveToThread = useMoveMessagesToThread(channelId ?? '')
  const upload = useAttachmentUpload(channelId ?? '')
  const { data: me } = useMe()
  const projectChannelsQuery = useProjectChannels()
  const workspaceChannelsQuery = useWorkspaceChannels()
  const dmsQuery = useWorkspaceDms()
  const workspaceChannel = workspaceChannelsQuery.data?.find((channel) => channel.id === channelId)
  const channelSubtitle = channelType === 'project'
    ? t('Participating members')
    : channelType === 'dm'
      ? t('Direct messages')
      : workspaceChannel?.isPrivate
        ? t('{count} participating', { count: workspaceChannel.memberCount })
        : workspaceChannel
          ? t('Open to everyone')
          : undefined
  const workspaceMembers = useWorkspaceMembers()
  // userId → 現在の表示名。本文のメンションはサーバーが名前を埋めて返すが、カードの mrkdwn は名前なしの `<@id>` のため
  const mentionNames = React.useMemo(
    () => new Map((workspaceMembers.data ?? []).map((member) => [member.userId, member.displayName])),
    [workspaceMembers.data],
  )
  // 公開チャンネルでも、ゲストを候補に出してよいかの判定に channel_members が要る
  const channelMembers = useChannelMembers(
    channelId ?? null,
    isPrivate === '1' || channelType === 'workspace',
  )
  const projectMembers = useProjectMembers(projectId ?? null)
  const session = useSession()
  const selectedWorkspace = useSelectedWorkspaceId(session?.user.id)
  const attachmentAuth = React.useMemo<AttachmentAuth | undefined>(
    () =>
      session?.access_token && selectedWorkspace.ready
        ? { accessToken: session.access_token, workspaceId: selectedWorkspace.workspaceId }
        : undefined,
    [session?.access_token, selectedWorkspace.ready, selectedWorkspace.workspaceId],
  )
  const reactionHistory = useReactionHistory(session?.user.id)
  const [queueReactionHistory] = React.useState(createReactionHistoryQueue)
  const offlineQueue = useOfflineMessageQueue()
  const [draft, setDraft] = React.useState('')
  const [sendOnEnter, setSendOnEnter] = React.useState(false)
  const [sendKeyPreferenceLoaded, setSendKeyPreferenceLoaded] = React.useState(false)
  const [sendKeyPreferenceSaving, setSendKeyPreferenceSaving] = React.useState(false)
  const [sendKeyPreferenceError, setSendKeyPreferenceError] = React.useState<string | null>(null)
  const [isQueueing, setIsQueueing] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)
  const [selectableText, setSelectableText] = React.useState<string | null>(null)
  const [copiedNotice, setCopiedNotice] = React.useState(false)
  const copiedNoticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => () => {
    if (copiedNoticeTimer.current) clearTimeout(copiedNoticeTimer.current)
  }, [])
  const [replyTarget, setReplyTarget] = React.useState<MessageDto | null>(null)
  const [editingMessage, setEditingMessage] = React.useState<MessageDto | null>(null)
  const [actionTarget, setActionTarget] = React.useState<MessageDto | null>(null)
  const [reactionTarget, setReactionTarget] = React.useState<MessageDto | null>(null)
  // 「スレッドに切り出す」シートの起点メッセージ
  const [moveTarget, setMoveTarget] = React.useState<MessageDto | null>(null)
  const [moveError, setMoveError] = React.useState<string | null>(null)
  const [taskPicker, setTaskPicker] = React.useState<{ messageId: string; candidates: MessageTaskCandidate[] } | null>(null)
  // ピッカー（Modal）が開いている間の失敗は sendError だと隠れるため、シート内に出す
  const [taskPickerError, setTaskPickerError] = React.useState<string | null>(null)
  const [linkedTasksSheet, setLinkedTasksSheet] = React.useState<MessageDto['linkedTasks'] | null>(null)
  const [reactionPeople, setReactionPeople] = React.useState<{
    selectedEmoji: string
    messageId: string
  } | null>(null)
  const [attachmentPreview, setAttachmentPreview] = React.useState<
    MessageDto['attachments'][number] | null
  >(null)
  const previewViewer = attachmentPreview
    ? attachmentViewer(attachmentPreview.mimeType, attachmentPreview.fileName, Platform.OS)
    : null
  const [selection, setSelection] = React.useState({ start: 0, end: 0 })
  const translateRef = React.useRef(t)
  translateRef.current = t

  React.useEffect(() => {
    let isMounted = true
    void loadChatSendOnEnter(AsyncStorage)
      .then((saved) => {
        if (isMounted) setSendOnEnter(saved)
      })
      .catch(() => {
        if (isMounted) setSendKeyPreferenceError(translateRef.current('Could not read the chat input preference on this device.'))
      })
      .finally(() => {
        if (isMounted) setSendKeyPreferenceLoaded(true)
      })
    return () => { isMounted = false }
  }, [])

  const toggleSendOnEnter = async () => {
    if (!sendKeyPreferenceLoaded || sendKeyPreferenceSaving) return
    const next = !sendOnEnter
    setSendKeyPreferenceSaving(true)
    try {
      await saveChatSendOnEnter(next, AsyncStorage)
      setSendOnEnter(next)
      setSendKeyPreferenceError(null)
    } catch {
      setSendKeyPreferenceError(t('Could not save the chat input preference on this device.'))
    } finally {
      setSendKeyPreferenceSaving(false)
    }
  }
  const mentionSelectionsRef = React.useRef<MentionSelection[]>([])
  const messages = messagesQuery.data ?? []
  const reactionPeopleMessage = messages.find(message => message.id === reactionPeople?.messageId)
  const reactionPeopleSummary = reactionPeople && reactionPeopleMessage
    ? getReactionPeopleSummary(reactionPeopleMessage.reactions, reactionPeople.selectedEmoji)
    : null
  const queuedMessages = offlineQueue.messages.filter((message) => message.channelId === channelId)
  const mentionRange = React.useMemo(
    () => findMentionQuery(draft, selection.start),
    [draft, selection.start],
  )
  // 候補の種類と並び（グループ → メンバー）は Web の入力欄と揃える
  const mentionCandidates = React.useMemo(() => {
    if (channelType === 'dm' || !mentionRange) return []
    const channelMemberIds = new Set((channelMembers.data ?? []).map((member) => member.userId))
    const members =
      isPrivate === '1'
        ? (channelMembers.data ?? [])
        : filterMentionCandidates(
            workspaceMembers.data ?? [],
            projectId
              ? {
                  kind: 'project',
                  projectMemberIds: new Set((projectMembers.data ?? []).map((member) => member.userId)),
                }
              : channelType === 'workspace'
                ? { kind: 'workspace', channelMemberIds }
                : { kind: 'unresolved' },
          )
    const query = mentionRange.query.toLocaleLowerCase()
    type MentionCandidate = { tokenId: string; displayName: string; avatarUrl: string | null; hint?: string }
    const groups: MentionCandidate[] = []
    if ('all'.startsWith(query)) {
      groups.push({ tokenId: 'all', displayName: 'all', avatarUrl: null, hint: t('Everyone') })
    }
    if (projectId && 'project_members'.startsWith(query)) {
      groups.push({
        tokenId: 'project_members',
        displayName: 'project_members',
        avatarUrl: null,
        hint: t('Project members'),
      })
    }
    return [
      ...groups,
      ...members
        .filter((member) => member.userId !== me?.id)
        .filter((member) => member.displayName.toLocaleLowerCase().includes(query))
        .map((member): MentionCandidate => ({
          tokenId: member.userId,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
        })),
    ]
  }, [
    channelMembers.data,
    channelType,
    isPrivate,
    me?.id,
    mentionRange,
    projectId,
    projectMembers.data,
    t,
    workspaceMembers.data,
  ])
  const mentionMembersError =
    channelType === 'dm'
      ? null
      : isPrivate === '1'
        ? channelMembers.error
        : (workspaceMembers.error ??
          (projectId ? projectMembers.error : channelType === 'workspace' ? channelMembers.error : null))
  const isFetchingMentionMembers =
    channelMembers.isFetching || workspaceMembers.isFetching || projectMembers.isFetching

  const retryMentionMembers = () => {
    if (isPrivate === '1') return channelMembers.refetch()
    if (projectId) return Promise.all([workspaceMembers.refetch(), projectMembers.refetch()])
    if (channelType === 'workspace') return Promise.all([workspaceMembers.refetch(), channelMembers.refetch()])
    return workspaceMembers.refetch()
  }
  // 送信失敗時の catch は非同期に発火するため、常に最新の channelId を参照できるようにする
  const channelIdRef = React.useRef(channelId)
  channelIdRef.current = channelId
  const draftRef = React.useRef(draft)
  draftRef.current = draft

  // chats/[channelId] は chats/index と同じ Tab Navigator 内の兄弟タブ（href: null）のため、
  // 他のタブへ切り替えても既定では画面がアンマウントされない。
  // Realtimeによるキャッシュ更新があっても、フォーカスが外れている間は既読化を止める。
  const [isFocused, setIsFocused] = React.useState(true)
  const swipeX = React.useRef(new Animated.Value(0)).current
  const goBackToList = React.useCallback(() => {
    swipeX.setValue(0)
    router.replace('/(app)/chats')
  }, [router, swipeX])
  const backSwipe = React.useMemo(
    () =>
      PanResponder.create({
        // 左端から右へ動かしたときだけ一覧へ戻す。縦スクロールと戻るボタンのタップは奪わない。
        onMoveShouldSetPanResponderCapture: (_event, gesture) => isEdgeBackSwipe(gesture),
        onPanResponderMove: (_event, gesture) => {
          swipeX.setValue(Math.max(0, gesture.dx))
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 72 || gesture.vx > 0.75) {
            goBackToList()
            return
          }
          Animated.timing(swipeX, { toValue: 0, duration: 160, useNativeDriver: true }).start()
        },
        onPanResponderTerminate: () => {
          Animated.timing(swipeX, { toValue: 0, duration: 160, useNativeDriver: true }).start()
        },
      }),
    [goBackToList, swipeX],
  )
  const channelListsSettled = projectChannelsQuery.isSuccess && !projectChannelsQuery.isFetching
    && workspaceChannelsQuery.isSuccess && !workspaceChannelsQuery.isFetching
    && (!FEATURE_FLAGS.dm || (dmsQuery.isSuccess && !dmsQuery.isFetching))
  const visibleChannelIds = React.useMemo(() => [
    ...(projectChannelsQuery.data ?? []).map(channel => channel.channelId),
    ...(workspaceChannelsQuery.data ?? []).map(channel => channel.id),
    ...(dmsQuery.data ?? []).map(channel => channel.id),
  ], [dmsQuery.data, projectChannelsQuery.data, workspaceChannelsQuery.data])
  const previousVisibleChannelIdsRef = React.useRef<string[] | null>(null)
  // 一覧に見えていた会話が消えたら、スレッドに残って失敗表示を見せない。作成直後で未反映の ID は対象外。
  React.useEffect(() => {
    if (!channelListsSettled || !channelId) return
    const disappeared = openChannelDisappeared(
      channelId,
      previousVisibleChannelIdsRef.current,
      visibleChannelIds,
    )
    if (disappeared && !isFocused) return
    previousVisibleChannelIdsRef.current = visibleChannelIds
    if (disappeared) goBackToList()
  }, [channelId, channelListsSettled, goBackToList, isFocused, visibleChannelIds])

  React.useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => setIsFocused(true))
    const unsubBlur = navigation.addListener('blur', () => {
      setIsFocused(false)
      swipeX.setValue(0)
    })
    return () => {
      unsubFocus()
      unsubBlur()
    }
  }, [navigation, swipeX])

  React.useEffect(() => {
    if (!isFocused) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (attachmentPreview || reactionPeople || reactionTarget || actionTarget) {
        setAttachmentPreview(null)
        setReactionPeople(null)
        setReactionTarget(null)
        setActionTarget(null)
        return true
      }
      goBackToList()
      return true
    })
    return () => subscription.remove()
  }, [actionTarget, attachmentPreview, goBackToList, isFocused, reactionPeople, reactionTarget])

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
    setReactionPeople(null)
    setAttachmentPreview(null)
    setSelection({ start: 0, end: 0 })
    mentionSelectionsRef.current = []
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
    const content = serializeMentions(draft, mentionSelectionsRef.current).trim()
    if (editingMessage) {
      if (!content || editMessage.isPending) return
      setSendError(null)
      try {
        await editMessage.mutateAsync({ messageId: editingMessage.id, content })
        setDraft('')
        setEditingMessage(null)
        mentionSelectionsRef.current = []
      } catch (error) {
        setSendError(error instanceof Error ? error.message : t('Could not edit the message'))
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
        ...(mentionSelectionsRef.current.length > 0
          ? {
              mentionNames: Object.fromEntries(
                mentionSelectionsRef.current.map(({ userId, displayName }) => [
                  userId,
                  displayName,
                ]),
              ),
            }
          : {}),
        createdAt: new Date().toISOString(),
        ...(parentMessageId ? { parentMessageId } : {}),
        ...(attachmentFileIds.length > 0 ? { attachmentFileIds } : {}),
      })
      if (channelIdRef.current !== sendingChannelId) return
      if (draftRef.current === sendingDraft) {
        setDraft('')
        mentionSelectionsRef.current = []
      }
      setReplyTarget(null)
      upload.clearUploads()
    } catch {
      if (channelIdRef.current !== sendingChannelId) return
      setSendError(t('Could not save unsent messages on this device. Send again.'))
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
    const editable = parseEditableMentions(message.content, t)
    mentionSelectionsRef.current = editable.mentions
    setDraft(editable.text)
    setSelection({ start: editable.text.length, end: editable.text.length })
  }

  const confirmDelete = (message: MessageDto) => {
    setActionTarget(null)
    Alert.alert(t('Delete this message?'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: () => {
          deleteMessage.mutate(message.id, {
            onError: (error) =>
              setSendError(
                error instanceof Error ? error.message : t('Could not delete the message'),
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
        setSendError(error instanceof Error ? error.message : t('Could not update the bookmark')),
    })
  }

  const openTask = (taskId: string) => {
    // 同じタスクを続けて開いても WebView が再遷移するよう、開くたびに異なる open を付ける
    router.push({ pathname: '/(app)/tasks', params: { taskId, open: String(Date.now()) } })
  }

  // 選んだ行（line）を編集後のタスク名（title）でタスクにする。成功したら true。失敗は sendError に出す。
  const createTasks = async (messageId: string, items: MessageTaskSubmitItem[], fromPicker = false): Promise<boolean> => {
    const reportError = fromPicker ? setTaskPickerError : setSendError
    setSendError(null)
    setTaskPickerError(null)
    try {
      const response = await apiFetch(`/api/messages/${messageId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        tasks?: { id: string }[]
        createdCount?: number
      }
      if (!response.ok || !data.tasks?.length || typeof data.createdCount !== 'number') {
        reportError(messageTaskErrorMessage(data, t('Could not make a task from this message')))
        return false
      }
      // タスク化済みの印（チップ）を出すため、そのチャンネルのメッセージを取り直す
      void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      const only = data.tasks.length === 1 ? data.tasks[0] : undefined
      const title =
        data.createdCount === 0
          ? t('This message is already a task')
          : data.createdCount === 1
            ? t('Added to tasks')
            : t('Added {count} tasks', { count: data.createdCount })
      Alert.alert(title, undefined, [
        { text: t('Close'), style: 'cancel' },
        { text: t('Open'), onPress: () => (only ? openTask(only.id) : router.push('/(app)/tasks')) },
      ])
      return true
    } catch {
      reportError(t('Could not make a task from this message'))
      return false
    }
  }

  const makeTask = async (message: MessageDto) => {
    setActionTarget(null)
    setSendError(null)
    try {
      const response = await apiFetch(`/api/messages/${message.id}/task`)
      const data = (await response.json().catch(() => ({}))) as { error?: string; candidates?: MessageTaskCandidate[] }
      if (!response.ok || !Array.isArray(data.candidates)) {
        setSendError(data.error ?? t('Could not make a task from this message'))
        return
      }
      const candidates = data.candidates
      const open = candidates.filter((candidate) => !candidate.taskId)
      if (candidates.length === 0) {
        setSendError(t('This message has no text to make a task from'))
      } else if (open.length === 0) {
        Alert.alert(t('All lines of this message are already tasks'))
      } else if (candidates.length === 1 && open[0]) {
        await createTasks(message.id, [{ line: open[0].line, title: open[0].title }])
      } else {
        setTaskPickerError(null)
        setTaskPicker({ messageId: message.id, candidates })
      }
    } catch {
      setSendError(t('Could not make a task from this message'))
    }
  }

  const report = async (
    message: MessageDto,
    reason: 'harassment' | 'discriminatory' | 'sexual' | 'violence' | 'spam' | 'other',
    details?: string,
  ) => {
    setActionTarget(null)
    const error = await apiActionError(
      apiFetch(`/api/messages/${message.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, ...(details ? { details } : {}) }),
      }),
      t('Could not submit the report'),
    )
    if (error) {
      setSendError(error)
      return
    }
    // 他人のメッセージ長押しメニューにブロックを置かないため、報告後にブロックの導線を出す（App Store 1.2）
    // アプリ（Bot）はユーザーではないのでブロックの対象にしない
    if (message.senderId === me?.id || message.blocked || message.senderApp) {
      Alert.alert(t('Reported'), t('The moderators will review it.'))
      return
    }
    Alert.alert(t('Reported'), t('The moderators will review it.'), [
      { text: t('Block this user'), style: 'destructive', onPress: () => void blockUser(message) },
      { text: t('Close'), style: 'cancel' },
    ])
  }
  const reportMenu = (message: MessageDto) =>
    Alert.alert(t('Report reason'), t('Choose a reason'), [
      { text: t('Harassment or bullying'), onPress: () => void report(message, 'harassment') },
      { text: t('Discriminatory or hostile'), onPress: () => void report(message, 'discriminatory') },
      { text: t('Sexual or inappropriate'), onPress: () => void report(message, 'sexual') },
      { text: t('Violence or threats'), onPress: () => void report(message, 'violence') },
      { text: t('Spam'), onPress: () => void report(message, 'spam') },
      {
        text: t('Other'),
        onPress: () =>
          Alert.prompt(t('Details'), t('Describe what happened'), (text) => {
            if (text.trim()) void report(message, 'other', text.trim())
          }),
      },
      { text: t('Cancel'), style: 'cancel' },
    ])
  const blockUser = async (message: MessageDto) => {
    setActionTarget(null)
    const error = await apiActionError(
      apiFetch('/api/me/blocks', {
        method: 'POST',
        body: JSON.stringify({ userId: message.senderId }),
      }),
      t('Could not block this user'),
    )
    if (error) setSendError(error)
    else {
      await messagesQuery.refetch()
      Alert.alert(t('User blocked'))
    }
  }

  const canSubmit = editingMessage
    ? draft.trim().length > 0 && !editMessage.isPending
    : (draft.trim().length > 0 || upload.doneFileIds.length > 0) &&
      offlineQueue.ready &&
      !isQueueing &&
      !upload.isUploading &&
      !upload.hasFailedUploads

  const handleToggleReaction = (messageId: string, emoji: string) => {
    const request = toggleReaction.mutateAsync({ messageId, emoji })
    void queueReactionHistory(request, async () => {
      await reactionHistory.record(emoji).catch(() => setSendError(t('Could not save recent reactions')))
    }).catch((err: unknown) => {
      setSendError(err instanceof Error ? err.message : t('Could not update the reaction'))
    })
  }

  const selectMention = (candidate: { tokenId: string; displayName: string }) => {
    if (!mentionRange) return
    const member = { userId: candidate.tokenId, displayName: candidate.displayName }
    const inserted = insertMention(draft, mentionRange, member.displayName)
    mentionSelectionsRef.current = [
      ...rebaseMentionSelections(draft, inserted.text, mentionSelectionsRef.current),
      {
        start: mentionRange.start,
        end: mentionRange.start + member.displayName.length + 1,
        userId: member.userId,
        displayName: member.displayName,
      },
    ].sort((left, right) => left.start - right.start)
    setDraft(inserted.text)
    setSelection({ start: inserted.cursor, end: inserted.cursor })
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

  const loadOlderMessages = () => {
    if (!channelId || !messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) return
    void messagesQuery.fetchNextPage()
  }

  const openSearch = () => {
    if (!channelId) return
    router.push({
      pathname: '/(app)/chat-tools',
      params: {
        path: `/chats/${channelId}?nativeAux=1&panel=search`,
        title: t('Message search'),
        returnChannelId: channelId,
        ...(channelName ? { returnChannelName: channelName } : {}),
        ...(channelType ? { returnChannelType: channelType } : {}),
        ...(projectId ? { returnProjectId: projectId } : {}),
        ...(isPrivate ? { returnIsPrivate: isPrivate } : {}),
      },
    })
  }

  const openInfo = () => {
    if (!channelId) return
    router.push({
      pathname: '/(app)/chat-tools',
      params: {
        path: `/chats/${channelId}?nativeAux=1&panel=info`,
        title: t('Channel info'),
        returnChannelId: channelId,
        ...(channelName ? { returnChannelName: channelName } : {}),
        ...(channelType ? { returnChannelType: channelType } : {}),
        ...(projectId ? { returnProjectId: projectId } : {}),
        ...(isPrivate ? { returnIsPrivate: isPrivate } : {}),
      },
    })
  }

  const openMarkdownLink = React.useCallback(
    (url: string) => {
      const target = resolveMobileMarkdownLink(url, API_BASE_URL)
      if (!target) {
        setSendError(t('This link cannot be opened.'))
        return false
      }
      if (target.kind === 'external') {
        void Linking.openURL(target.url).catch(() => setSendError(t('Could not open the link.')))
        return false
      }
      if (!channelId) return false
      router.push({
        pathname: '/(app)/chat-tools',
        params: {
          path: target.path,
          title: t('Link'),
          returnChannelId: channelId,
          ...(channelName ? { returnChannelName: channelName } : {}),
          ...(channelType ? { returnChannelType: channelType } : {}),
          ...(projectId ? { returnProjectId: projectId } : {}),
          ...(isPrivate ? { returnIsPrivate: isPrivate } : {}),
        },
      })
      return false
    },
    [channelId, channelName, channelType, isPrivate, projectId, router, t],
  )

  // PDF 内のリンクもチャット本文と同じ規則で開く。アプリ内の画面へ移るときは
  // モーダルが遷移先を覆わないよう閉じ、外部ブラウザへ渡すときは読んでいた位置を残す。
  // 送信欄のエラーはモーダルの裏に隠れるため、PDF 表示中の失敗は Alert で伝える
  const openDocumentLink = React.useCallback(
    (url: string) => {
      const target = resolveMobileMarkdownLink(url, API_BASE_URL)
      if (!target) {
        Alert.alert(t('This link cannot be opened.'))
        return
      }
      if (target.kind === 'external') {
        void Linking.openURL(target.url).catch(() => Alert.alert(t('Could not open the link.')))
        return
      }
      setAttachmentPreview(null)
      openMarkdownLink(url)
    },
    [openMarkdownLink, t],
  )

  const copyMessageText = async (message: MessageDto) => {
    setActionTarget(null)
    const body = parseMentions(message.content, t)
    if (body.trim().length === 0) return
    try {
      await Clipboard.setStringAsync(body)
      if (copiedNoticeTimer.current) clearTimeout(copiedNoticeTimer.current)
      setCopiedNotice(true)
      copiedNoticeTimer.current = setTimeout(() => setCopiedNotice(false), 1600)
    } catch {
      setSendError(t('Could not copy the message'))
    }
  }

  // iOS は閉じかけの操作メニューの上に別の Modal を出すと表示が捨てられるため、メニューが閉じ終えてから（onDismiss で）開く
  const pendingSelectTextRef = React.useRef<string | null>(null)
  const beginSelectText = (message: MessageDto) => {
    setActionTarget(null)
    const text = parseMentions(message.content, t)
    // onDismiss は iOS でしか呼ばれない。Android はそのまま開ける
    if (Platform.OS === 'ios') pendingSelectTextRef.current = text
    else setSelectableText(text)
  }

  const shareMessage = async (message: MessageDto) => {
    setActionTarget(null)
    const body = parseMentions(message.content, t).trim()
    const url = `${API_BASE_URL}/chats/${channelId}?m=${message.id}`
    try {
      await Share.share({ message: body ? `${body}\n${url}` : url })
    } catch (shareError) {
      setSendError(
        shareError instanceof Error ? shareError.message : t('Could not share the message'),
      )
    }
  }

  return (
    // Android も padding にする。targetSdk 36 の edge-to-edge ではキーボードが出てもウィンドウが縮まず、
    // behavior を付けないと入力欄がキーボードの裏に隠れる。縮む端末では重なりが 0 になり余白は足されない
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      behavior="padding"
      {...backSwipe.panHandlers}
    >
      <Animated.View style={[styles.swipeContent, { transform: [{ translateX: swipeX }] }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: palette.card, borderBottomColor: palette.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Back to the chat list')}
            style={styles.backButton}
            onPress={goBackToList}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={palette.accent} />
          </Pressable>
          <View style={styles.headerTitleArea}>
            <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
              {channelName || t('Chats')}
            </Text>
            {channelSubtitle ? (
              <Text style={[styles.headerSubtitle, { color: palette.text4 }]} numberOfLines={1}>
                {channelSubtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Search messages')}
            style={styles.headerButton}
            onPress={openSearch}
            hitSlop={6}
          >
            <Ionicons name="search-outline" size={19} color={palette.text3} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Channel info')}
            style={styles.headerButton}
            onPress={openInfo}
            hitSlop={6}
          >
            <Ionicons name="information-circle-outline" size={20} color={palette.text3} />
          </Pressable>
        </View>

        {messagesQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : isAccessDenied ? (
          <View style={styles.center}>
            <Ionicons name="lock-closed-outline" size={24} color={palette.text3} />
            <Text style={[styles.errorTitle, { color: palette.text }]}>{t('This channel cannot be shown')}</Text>
            <Text style={[styles.errorBody, { color: palette.text3 }]}>{t('You are not in this project, so this chat cannot be opened. Ask a workspace admin to invite you to the project.')}</Text>
          </View>
        ) : isSessionExpired ? (
          <View style={styles.center}>
            <Ionicons name="log-in-outline" size={24} color={palette.text3} />
            <Text style={[styles.errorTitle, { color: palette.text }]}>{t('Your session has expired')}</Text>
            <Text style={[styles.errorBody, { color: palette.text3 }]}>{t('Please sign in again.')}</Text>
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
                <Text
                  style={[styles.refreshErrorText, { color: palette.redText }]}
                  numberOfLines={2}
                >
                  {messagesQuery.error.message}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Reload messages')}
                  disabled={messagesQuery.isFetching}
                  onPress={() => void messagesQuery.refetch()}
                  hitSlop={6}
                >
                  {messagesQuery.isFetching ? (
                    <ActivityIndicator size="small" color={palette.redText} />
                  ) : (
                    <Text style={[styles.refreshErrorAction, { color: palette.redText }]}>{t('Retry')}</Text>
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
                    senderName={me?.displayName ?? t('You')}
                    onLinkPress={openMarkdownLink}
                    onRetry={() => offlineQueue.retry(item.message.id)}
                    onCancel={() => offlineQueue.cancel(item.message.id)}
                  />
                ) : (
                  <ChatMessageRow
                    message={item.message}
                    palette={palette}
                    mentionNames={mentionNames}
                    onToggleReaction={handleToggleReaction}
                    onAddReaction={setReactionTarget}
                    onShowReactors={(selectedEmoji, messageId) => setReactionPeople({ selectedEmoji, messageId })}
                    onLinkPress={openMarkdownLink}
                    onOpenActions={setActionTarget}
                    onOpenPreview={setAttachmentPreview}
                    onOpenTask={openTask}
                    onShowTasks={setLinkedTasksSheet}
                    {...(attachmentAuth ? { attachmentAuth } : {})}
                  />
                )
              }
              contentContainerStyle={styles.list}
              onEndReached={() => void loadOlderMessages()}
              onEndReachedThreshold={0.25}
              ListFooterComponent={
                messagesQuery.isFetchingNextPage ? (
                  <ActivityIndicator
                    style={styles.olderLoading}
                    size="small"
                    color={palette.accent}
                  />
                ) : messagesQuery.isFetchNextPageError ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Reload older messages')}
                    onPress={() => void loadOlderMessages()}
                    style={styles.olderError}
                  >
                    <Text style={[styles.olderErrorText, { color: palette.redText }]}>
                      {messagesQuery.error?.message ?? t('Could not load older messages')}
                      {t(' {action}', { action: t('Retry') })}
                    </Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                messagesQuery.error ? null : (
                  <Text style={[styles.empty, { color: palette.text4 }]}>{t('No messages yet. Send the first one.')}</Text>
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
              },
            ]}
          >
            {sendError && (
              <Text style={[styles.sendError, { color: palette.redText }]}>{sendError}</Text>
            )}
            {sendKeyPreferenceError && (
              <Text accessibilityRole="alert" style={[styles.sendError, { color: palette.redText }]}>{sendKeyPreferenceError}</Text>
            )}
            {selectedWorkspace.error && (
              <Pressable accessibilityRole="button" onPress={selectedWorkspace.retry}>
                <Text accessibilityRole="alert" style={[styles.sendError, { color: palette.redText }]}>
                  {t('Could not load the selected workspace, so attachments cannot be shown. Tap to retry.')}
                </Text>
              </Pressable>
            )}
            {offlineQueue.restoreError && (
              <View style={styles.queueRestoreError} accessibilityRole="alert">
                <Text style={[styles.queueRestoreErrorText, { color: palette.redText }]}>
                  {offlineQueue.restoreError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Reload unsent messages')}
                  onPress={offlineQueue.retryRestore}
                  hitSlop={6}
                >
                  <Text style={[styles.queueRestoreRetry, { color: palette.redText }]}>{t('Retry')}</Text>
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
                      ? t('Editing message')
                      : t('Reply to {name}', { name: replyTarget?.senderName ?? '' })}
                  </Text>
                  {!editingMessage && (
                    <Text
                      style={[styles.composerContextBody, { color: palette.text4 }]}
                      numberOfLines={1}
                    >
                      {replyTarget ? parseMentions(replyTarget.content, t) || t('(Attachment)') : ''}
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Cancel reply or edit')}
                  onPress={() => {
                    if (editingMessage) setDraft('')
                    setEditingMessage(null)
                    setReplyTarget(null)
                    mentionSelectionsRef.current = []
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={palette.text4} />
                </Pressable>
              </View>
            )}
            {!editingMessage && (
              <View style={styles.attachmentActions}>
                {/* 画面幅が狭いので、ラベルは付けずアイコンだけにする（読み上げは accessibilityLabel） */}
                <Pressable style={styles.attachmentAction} accessibilityRole="button" accessibilityLabel={t('Photo')} hitSlop={6} onPress={() => void upload.pickImage()}>
                  <Ionicons name="image-outline" size={17} color={palette.text3} />
                </Pressable>
                <Pressable
                  style={styles.attachmentAction}
                  accessibilityRole="button"
                  accessibilityLabel={t('Files')}
                  hitSlop={6}
                  onPress={() => void upload.pickDocument()}
                >
                  <Ionicons name="attach-outline" size={17} color={palette.text3} />
                </Pressable>
                {channelType !== 'dm' && channelId && <AppEntryActions channelId={channelId} palette={palette} onError={setSendError} />}
                <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel={t('Enter to send')}
                    accessibilityState={{ checked: sendOnEnter, disabled: !sendKeyPreferenceLoaded || sendKeyPreferenceSaving }}
                    disabled={!sendKeyPreferenceLoaded || sendKeyPreferenceSaving}
                    onPress={() => void toggleSendOnEnter()}
                    style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: sendKeyPreferenceLoaded ? 1 : 0.5 }}
                  >
                    <View style={{ width: 28, height: 16, borderRadius: 10, padding: 2, backgroundColor: sendOnEnter ? palette.accent : palette.border, alignItems: sendOnEnter ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: palette.card }} />
                    </View>
                    <Text style={[styles.attachmentActionText, { color: palette.text3 }]}>{t('Enter to send')}</Text>
                  </Pressable>
                </View>
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
                    {pending.status === 'error' && pending.retryFinalize && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('Retry')}
                        onPress={() => void upload.retryUpload(pending.id)}
                        hitSlop={8}
                      >
                        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '600' }}>{t('Retry')}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Remove {name}', { name: pending.fileName })}
                      onPress={() => upload.removeUpload(pending.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={16} color={palette.text4} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {mentionRange && mentionMembersError && (
              <View
                accessibilityRole="alert"
                style={[
                  styles.refreshError,
                  {
                    backgroundColor: palette.card2,
                    borderColor: palette.redText,
                    borderWidth: 1,
                    borderRadius: 10,
                    marginBottom: 7,
                  },
                ]}
              >
                <Text
                  style={[styles.refreshErrorText, { color: palette.redText }]}
                  numberOfLines={2}
                >
                  {mentionMembersError.message}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Reload mention suggestions')}
                  disabled={isFetchingMentionMembers}
                  onPress={() => void retryMentionMembers()}
                  hitSlop={6}
                >
                  {isFetchingMentionMembers ? (
                    <ActivityIndicator size="small" color={palette.redText} />
                  ) : (
                    <Text style={[styles.refreshErrorAction, { color: palette.redText }]}>{t('Retry')}</Text>
                  )}
                </Pressable>
              </View>
            )}
            {mentionRange && !mentionMembersError && mentionCandidates.length > 0 && (
              <ScrollView
                style={[
                  styles.mentionSuggestions,
                  { backgroundColor: palette.card, borderColor: palette.border },
                ]}
                // 候補を押してもキーボードを閉じず、そのまま入力を続けられるようにする
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled
              >
                {mentionCandidates.map((candidate) => (
                  <Pressable
                    key={candidate.tokenId}
                    accessibilityRole="button"
                    accessibilityLabel={t('Mention {name}', { name: candidate.displayName })}
                    onPress={() => selectMention(candidate)}
                    style={({ pressed }) => [
                      styles.mentionSuggestion,
                      { backgroundColor: pressed ? palette.card2 : palette.card },
                    ]}
                  >
                    <UserAvatar name={candidate.displayName} url={candidate.avatarUrl} size={26} />
                    <Text style={[styles.mentionName, { color: palette.text }]} numberOfLines={1}>
                      @{candidate.displayName}
                      {candidate.hint ? (
                        <Text style={[styles.mentionHint, { color: palette.text4 }]}>  {candidate.hint}</Text>
                      ) : null}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View
              style={[
                styles.composer,
                { backgroundColor: palette.card2, borderColor: palette.border },
              ]}
            >
              <TextInput
                accessibilityLabel={t('Enter a message')}
                style={[styles.input, { color: palette.text }]}
                submitBehavior={chatInputSubmitBehavior(sendOnEnter, !!editingMessage)}
                returnKeyType={sendOnEnter && !editingMessage ? 'send' : 'default'}
                onSubmitEditing={() => {
                  if (sendOnEnter && !editingMessage) void handleSend()
                }}
                selection={selection}
                onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                onChangeText={(value) => {
                  mentionSelectionsRef.current = rebaseMentionSelections(
                    draft,
                    value,
                    mentionSelectionsRef.current,
                  )
                  setDraft(value)
                  if (sendError) setSendError(null)
                }}
                placeholder={t('Write a message…')}
                placeholderTextColor={palette.text4}
                multiline
              >
                {/* value の代わりに子要素で本文を渡し、候補から挿入したメンションだけ色を変える */}
                {splitMentionSegments(draft, mentionSelectionsRef.current).map((segment, index) =>
                  segment.mention ? (
                    <Text
                      key={index}
                      style={{ color: palette.accent, backgroundColor: palette.accentSoft }}
                    >
                      {segment.text}
                    </Text>
                  ) : (
                    <Text key={index}>{segment.text}</Text>
                  ),
                )}
              </TextInput>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Send message')}
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
          onDismiss={() => {
            const pending = pendingSelectTextRef.current
            pendingSelectTextRef.current = null
            if (pending !== null) setSelectableText(pending)
          }}
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
            {/* 項目が多く横向きなど縦の短い画面では収まらないため、シートの高さを抑えて一覧をスクロールさせる */}
            <ScrollView style={styles.actionList} bounces={false}>
              <ActionButton
                icon="arrow-undo-outline"
                label={t('Reply')}
                palette={palette}
                onPress={() => actionTarget && beginReply(actionTarget)}
              />
              {actionTarget?.blocked && (
                <ActionButton
                  icon="eye-outline"
                  label={t('Show message temporarily')}
                  palette={palette}
                  onPress={() => {
                    Alert.alert(t('Message from a blocked user'), actionTarget.content)
                    setActionTarget(null)
                  }}
                />
              )}
              {actionTarget?.senderId === me?.id && (
                <ActionButton
                  icon="create-outline"
                  label={t('Edit')}
                  palette={palette}
                  onPress={() => actionTarget && beginEdit(actionTarget)}
                />
              )}
              {actionTarget && !actionTarget.blocked && actionTarget.content.trim().length > 0 && (
                <>
                  <ActionButton
                    icon="copy-outline"
                    label={t('Copy text')}
                    palette={palette}
                    onPress={() => void copyMessageText(actionTarget)}
                  />
                  <ActionButton
                    icon="text-outline"
                    label={t('Select text')}
                    palette={palette}
                    onPress={() => beginSelectText(actionTarget)}
                  />
                </>
              )}
              <ActionButton
                icon="checkbox-outline"
                label={t('Make a task')}
                palette={palette}
                onPress={() => actionTarget && void makeTask(actionTarget)}
              />
              <ActionButton
                icon={actionTarget?.bookmarked ? 'bookmark' : 'bookmark-outline'}
                label={actionTarget?.bookmarked ? t('Clear bookmark') : t('Bookmarks')}
                palette={palette}
                onPress={() => actionTarget && handleBookmark(actionTarget)}
              />
              <ActionButton
                icon="happy-outline"
                label={t('Add reaction')}
                palette={palette}
                onPress={() => {
                  setReactionTarget(actionTarget)
                  setActionTarget(null)
                }}
              />
              <ActionButton
                icon="share-outline"
                label={t('Share')}
                palette={palette}
                onPress={() => actionTarget && void shareMessage(actionTarget)}
              />
              {actionTarget &&
                canMoveMessageToThread({
                  channelType,
                  workspaceChannel,
                  role: me?.wsRole,
                  messageType: actionTarget.messageType,
                }) && (
                  <ActionButton
                    icon="arrow-redo-outline"
                    label={t('Move to thread')}
                    palette={palette}
                    onPress={() => {
                      setMoveError(null)
                      setMoveTarget(actionTarget)
                      setActionTarget(null)
                    }}
                  />
                )}
              {actionTarget?.senderId === me?.id ? (
                <ActionButton
                  icon="trash-outline"
                  label={t('Delete')}
                  palette={palette}
                  destructive
                  onPress={() => actionTarget && confirmDelete(actionTarget)}
                />
              ) : (
                <ActionButton
                  icon="flag-outline"
                  label={t('Report')}
                  palette={palette}
                  destructive
                  onPress={() => actionTarget && reportMenu(actionTarget)}
                />
              )}
            </ScrollView>
          </View>
        </Modal>

        <TextSelectSheet text={selectableText} palette={palette} onClose={() => setSelectableText(null)} />

        {copiedNotice && (
          <View pointerEvents="none" style={styles.copiedNoticeWrap}>
            <View style={[styles.copiedNotice, { backgroundColor: palette.text }]}>
              <Text style={[styles.copiedNoticeLabel, { color: palette.bg }]}>{t('Copied the message')}</Text>
            </View>
          </View>
        )}

        <MoveToThreadSheet
          message={moveTarget}
          threads={(workspaceChannelsQuery.data ?? []).filter(
            (candidate) => candidate.parentChannelId === channelId && !candidate.archived,
          )}
          palette={palette}
          pending={moveToThread.isPending}
          error={moveError}
          onClose={() => setMoveTarget(null)}
          onSubmit={(body) => {
            moveToThread.mutate(body, {
              onSuccess: ({ threadId }) => {
                const existing = workspaceChannelsQuery.data?.find((candidate) => candidate.id === threadId)
                setMoveTarget(null)
                router.push({
                  pathname: '/chats/[channelId]',
                  params: {
                    channelId: threadId,
                    channelName: body.threadName ?? existing?.name ?? t('Channels'),
                    channelType: 'workspace',
                    isPrivate: workspaceChannel?.isPrivate ? '1' : '0',
                  },
                })
              },
              onError: (error) =>
                setMoveError(error instanceof Error ? error.message : t('Could not move the messages to a thread')),
            })
          }}
        />

        <ReactionPicker
          visible={reactionTarget !== null}
          palette={palette}
          recent={reactionHistory.recent}
          historyError={reactionHistory.error}
          onSelect={(emoji) => {
            if (reactionTarget) handleToggleReaction(reactionTarget.id, emoji)
            setReactionTarget(null)
          }}
          onClose={() => setReactionTarget(null)}
        />

        <Modal
          transparent
          visible={reactionPeopleSummary !== null}
          animationType="slide"
          onRequestClose={() => setReactionPeople(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setReactionPeople(null)} />
          <View
            style={[
              styles.reactionSheet,
              {
                backgroundColor: palette.card,
                borderColor: palette.border,
                paddingBottom: insets.bottom + 16,
                maxHeight: '80%',
              },
            ]}
          >
            <Text style={[styles.reactionSheetTitle, { color: palette.text }]}>
              {t('Reactions ({count})', { count: reactionPeopleSummary?.totalCount ?? 0 })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactionPeopleChips} contentContainerStyle={styles.reactionPeopleChipsContent}>
              {reactionPeopleMessage?.reactions.map((reaction) => (
                <Pressable
                  key={reaction.emoji}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reaction.emoji === reactionPeople?.selectedEmoji }}
                  accessibilityLabel={t('{emoji} {count} reactions', { emoji: reaction.emoji, count: reaction.count })}
                  onPress={() => setReactionPeople((current) => current ? { ...current, selectedEmoji: reaction.emoji } : current)}
                  style={[styles.reactionPeopleChip, { backgroundColor: reaction.emoji === reactionPeople?.selectedEmoji ? palette.accentSoft : palette.card2, borderColor: reaction.emoji === reactionPeople?.selectedEmoji ? palette.accent : palette.border }]}
                >
                  <Text style={{ color: palette.text2 }}>{reaction.emoji} {reaction.count}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={styles.reactionPeopleList} contentContainerStyle={styles.reactionPeopleListContent}>
              {reactionPeopleSummary && reactionPeopleSummary.userNames.length > 0 ? reactionPeopleSummary.userNames.map((name, index) => (
                <View key={`${name}-${index}`} style={[styles.reactionPeopleRow, { borderTopColor: palette.divider }]}>
                  <UserAvatar name={name} size={40} />
                  <Text style={[styles.reactionPerson, { color: palette.text }]}>{name}</Text>
                  <Text style={styles.reactionPeopleEmoji}>{reactionPeople?.selectedEmoji}</Text>
                </View>
              )) : <Text style={[styles.reactionPersonEmpty, { color: palette.text3 }]}>{t('Could not show who reacted')}</Text>}
            </ScrollView>
          </View>
        </Modal>
        <MessageTaskPickerModal
          candidates={taskPicker?.candidates ?? null}
          palette={palette}
          onSubmit={(items) => (taskPicker ? createTasks(taskPicker.messageId, items, true) : Promise.resolve(false))}
          error={taskPickerError}
          onClose={() => {
            setTaskPicker(null)
            setTaskPickerError(null)
          }}
        />
        <LinkedTasksModal
          tasks={linkedTasksSheet}
          palette={palette}
          onSelect={(taskId) => {
            setLinkedTasksSheet(null)
            openTask(taskId)
          }}
          onClose={() => setLinkedTasksSheet(null)}
        />
        {attachmentPreview && attachmentAuth && (
          previewViewer === 'pdf' ? (
            <ChatPdfViewer
              fileUrl={attachmentUrl(attachmentPreview.fileId)}
              fileId={attachmentPreview.fileId}
              fileName={attachmentPreview.fileName}
              mimeType={attachmentPreview.mimeType}
              auth={attachmentAuth}
              onClose={() => setAttachmentPreview(null)}
              onPressLink={openDocumentLink}
            />
          ) : previewViewer === 'image' ? (
            <ChatImageViewer
              fileUrl={attachmentUrl(attachmentPreview.fileId)}
              fileId={attachmentPreview.fileId}
              fileName={attachmentPreview.fileName}
              mimeType={attachmentPreview.mimeType}
              auth={attachmentAuth}
              onClose={() => setAttachmentPreview(null)}
            />
          ) : previewViewer === 'markdown' ? (
            <ChatMarkdownViewer
              fileUrl={attachmentUrl(attachmentPreview.fileId)}
              fileId={attachmentPreview.fileId}
              fileName={attachmentPreview.fileName}
              mimeType={attachmentPreview.mimeType}
              auth={attachmentAuth}
              onClose={() => setAttachmentPreview(null)}
              onPressLink={openDocumentLink}
            />
          ) : previewViewer === 'office' ? (
            <ChatOfficeViewer
              fileUrl={attachmentUrl(attachmentPreview.fileId)}
              fileId={attachmentPreview.fileId}
              fileName={attachmentPreview.fileName}
              mimeType={attachmentPreview.mimeType}
              auth={attachmentAuth}
              onClose={() => setAttachmentPreview(null)}
              onPressLink={openDocumentLink}
            />
          ) : null
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  swipeContent: { flex: 1 },
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
  headerTitleArea: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerSubtitle: { marginTop: 1, fontSize: 11.5 },
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
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 3,
  },
  senderName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  projectRole: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  messageTime: { fontSize: 11 },
  edited: { fontSize: 10, fontStyle: 'italic' },
  profileAttributes: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  profileAttribute: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
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
  taskChip: {
    alignSelf: 'flex-start',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    marginTop: 6,
  },
  reactionText: { fontSize: 11, fontWeight: '600' },
  reactionPerson: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  reactionPeopleChips: { flexGrow: 0, maxHeight: 40, marginBottom: 8 },
  reactionPeopleChipsContent: { gap: 8, alignItems: 'center' },
  reactionPeopleChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  reactionPeopleList: { flexGrow: 0, flexShrink: 1, minHeight: 0, maxHeight: 400 },
  reactionPeopleListContent: { paddingBottom: 8 },
  reactionPeopleRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  reactionPeopleEmoji: { fontSize: 20 },
  reactionPersonEmpty: { minHeight: 44, textAlignVertical: 'center' },
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
  // 下端の安全領域（ホームインジケーター・ナビゲーションバー）は下のタブバー（MobileNav）が確保する。
  // ここでも insets.bottom を足すと二重になり、入力欄の下に大きな隙間ができる
  composerArea: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  messageListContainer: { flex: 1 },
  messageList: { flex: 1 },
  olderLoading: { marginVertical: 14 },
  olderError: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  olderErrorText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  // アプリの起動口が並ぶと狭い端末・大きな文字で1行に収まらないため、折り返して右端のスイッチを画面外に出さない
  attachmentActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4, paddingHorizontal: 4, paddingBottom: 7 },
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
  mentionSuggestions: {
    // 件数で切らず、Web と同じ高さまで出して残りはスクロールで選ぶ
    maxHeight: 240,
    flexGrow: 0,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 7,
  },
  mentionSuggestion: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
  },
  mentionName: { flex: 1, fontSize: 13, fontWeight: '600' },
  mentionHint: { fontSize: 11, fontWeight: '500' },
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
    maxHeight: '85%',
  },
  actionList: { flexGrow: 0, flexShrink: 1 },
  copiedNoticeWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' },
  copiedNotice: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  copiedNoticeLabel: { fontSize: 13, fontWeight: '600' },
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

})
