import React from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, useColorScheme,
  Modal, Pressable, Linking, Alert,
} from 'react-native'
// legacy の downloadAsync を使う（型は build の .d.ts から取り、実体は require で解決。
// 'expo-file-system/legacy' を直接 import すると exactOptionalPropertyTypes で
// ライブラリ内部の型エラーになるため。use-attachment-upload.ts と同じ回避策）
import type * as FileSystemTypes from 'expo-file-system/build/legacy/index'
import * as Sharing from 'expo-sharing'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as typeof FileSystemTypes
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../../../lib/session-context'
import { API_BASE_URL } from '../../../lib/env'
import { useMessages, useMarkChannelRead, useToggleReaction } from '../../../hooks/use-messages'
import type { MessageDto } from '../../../hooks/use-messages'
import { useMessageQueue } from '../../../hooks/use-message-queue'
import type { QueuedMessage } from '../../../hooks/use-message-queue'
import { useAttachmentUpload } from '../../../hooks/use-attachment-upload'
import { useMe } from '../../../hooks/use-account'
import { THEME } from '../../../lib/theme'
import type { Theme } from '../../../lib/theme'
import EmojiPicker, { ja as emojiJa, type EmojiType } from 'rn-emoji-keyboard'

// Web 側 formatChatMessageTime と同じ「M/D HH:mm」表記
function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Web 側 markdown-content.tsx と揃える（構造化メンションと URL を検出）
const STRUCTURED_MENTION_RE = /<@[^|>\s]+\|[^>\n]+>/g
const URL_RE = /https?:\/\/[^\s<>"']+/g

// 構造化メンション <@id|名前> はチップ表示、URL はタップで外部ブラウザを開くリンクにする
function renderContent(content: string, c: Theme): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(`${STRUCTURED_MENTION_RE.source}|${URL_RE.source}`, 'g')
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) nodes.push(content.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('<@')) {
      const displayName = token.slice(token.indexOf('|') + 1, -1)
      nodes.push(
        <Text key={match.index} style={{ backgroundColor: c.accentSoft, color: c.accentText, fontWeight: '600' }}>
          {` @${displayName} `}
        </Text>,
      )
    } else {
      // 末尾の句読点・閉じ括弧はリンクに含めない（Web 版と同じ処理）
      const url = token.replace(/[.,;:!?)>\]]+$/, '')
      nodes.push(
        <Text
          key={match.index}
          style={{ color: c.accentText, textDecorationLine: 'underline' }}
          onPress={() => { void Linking.openURL(url) }}
        >
          {url}
        </Text>,
      )
    }
    last = match.index + token.length
  }
  if (last < content.length) nodes.push(content.slice(last))
  return nodes
}

function isImageMime(mimeType: string | null): boolean {
  return !!mimeType?.startsWith('image/')
}

function attachmentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/attachments/${fileId}`
}

// 添付ファイルを開く。/api/attachments は Bearer 認証が必要なため、
// 認証ヘッダー付きでローカルにダウンロードしてから OS の共有/プレビューシートで開く。
// （外部ブラウザに直接 URL を渡すと認証が効かず開けない）
async function openAttachmentFile(fileId: string, fileName: string, accessToken: string) {
  try {
    const safeName = fileName.replace(/[^\w.\-]/g, '_')
    const target = `${FileSystem.cacheDirectory}${fileId}_${safeName}`
    const { uri, status } = await FileSystem.downloadAsync(attachmentUrl(fileId), target, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (status !== 200) throw new Error(`ダウンロードに失敗しました (${status})`)
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('この端末ではファイルを開けません')
      return
    }
    await Sharing.shareAsync(uri)
  } catch (err) {
    console.error('[chat] 添付ファイルを開けませんでした:', err)
    Alert.alert('ファイルを開けませんでした', err instanceof Error ? err.message : String(err))
  }
}

function SenderAvatar({ name, url, c }: { name: string; url: string | null; c: Theme }) {
  if (url) return <Image source={{ uri: url }} style={styles.avatar} />
  return (
    <View style={[styles.avatar, { backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: c.onAccent, fontSize: 14, fontWeight: '700' }}>{name.slice(0, 1)}</Text>
    </View>
  )
}

function MessageRow({ message, accessToken, c, onToggleReaction, onOpenPicker, onShowReactors, onOpenImage }: {
  message: MessageDto
  accessToken?: string
  c: Theme
  onToggleReaction: (messageId: string, emoji: string) => void
  onOpenPicker: (messageId: string) => void
  onShowReactors: (emoji: string, userNames: string[]) => void
  onOpenImage: (fileId: string) => void
}) {
  return (
    <View style={styles.row}>
      <SenderAvatar name={message.senderName} url={message.senderAvatarUrl} c={c} />
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={[styles.senderName, { color: c.text }]}>{message.senderName}</Text>
          <Text style={[styles.time, { color: c.text4 }]}>{formatTime(message.createdAt)}</Text>
        </View>
        {message.content.length > 0 && (
          <Text style={[styles.messageText, { color: c.text2 }]}>{renderContent(message.content, c)}</Text>
        )}
        {message.attachments.length > 0 && (
          <View style={styles.attachments}>
            {message.attachments.map(att =>
              isImageMime(att.mimeType) && accessToken ? (
                <TouchableOpacity key={att.id} onPress={() => onOpenImage(att.fileId)} activeOpacity={0.85}>
                  <Image
                    source={{
                      uri: attachmentUrl(att.fileId),
                      headers: { Authorization: `Bearer ${accessToken}` },
                    }}
                    style={[styles.attachmentImage, { backgroundColor: c.card2 }]}
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={att.id}
                  style={[styles.attachmentCard, { backgroundColor: c.card2, borderColor: c.border }]}
                  onPress={() => { if (accessToken) void openAttachmentFile(att.fileId, att.fileName, accessToken) }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.fileIcon, { backgroundColor: c.accentSoft }]}>
                    <Ionicons name="document-text-outline" size={16} color={c.accentText} />
                  </View>
                  <Text style={[styles.attachmentName, { color: c.text2 }]} numberOfLines={1}>{att.fileName}</Text>
                  <Ionicons name="download-outline" size={15} color={c.text4} />
                </TouchableOpacity>
              ),
            )}
          </View>
        )}
        <View style={styles.reactions}>
          {message.reactions.map(r => (
            <TouchableOpacity
              key={r.emoji}
              onPress={() => onToggleReaction(message.id, r.emoji)}
              onLongPress={() => onShowReactors(r.emoji, r.userNames)}
              delayLongPress={300}
              style={[
                styles.reaction,
                { backgroundColor: r.mine ? c.accentSoft : c.card2, borderColor: r.mine ? c.accent : c.border },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.reactionText, { color: r.mine ? c.accentText : c.text2 }]}>{r.emoji} {r.count}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => onOpenPicker(message.id)}
            style={[styles.reactionAdd, { backgroundColor: c.card2, borderColor: c.border }]}
            activeOpacity={0.7}
            hitSlop={6}
          >
            <Ionicons name="happy-outline" size={14} color={c.text3} />
            <Ionicons name="add" size={11} color={c.text3} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// リアクションした人の一覧（絵文字長押しで表示）
function ReactorsSheet({ target, onClose, c }: {
  target: { emoji: string; userNames: string[] } | null
  onClose: () => void
  c: Theme
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={target !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.reactorsBackdrop} onPress={onClose} />
      <View style={[styles.reactorsSheet, { backgroundColor: c.card, borderColor: c.border, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grip, { backgroundColor: c.border2 }]} />
        <View style={styles.reactorsHeader}>
          <Text style={styles.reactorsEmoji}>{target?.emoji}</Text>
          <Text style={[styles.reactorsCount, { color: c.text3 }]}>{target?.userNames.length ?? 0} 人がリアクション</Text>
        </View>
        {(target?.userNames ?? []).map((nm, i) => (
          <View key={`${nm}-${i}`} style={[styles.reactorRow, { borderTopColor: c.divider }]}>
            <View style={[styles.reactorAvatar, { backgroundColor: c.accent }]}>
              <Text style={{ color: c.onAccent, fontSize: 13, fontWeight: '700' }}>{nm.slice(0, 1)}</Text>
            </View>
            <Text style={[styles.reactorName, { color: c.text }]}>{nm}</Text>
          </View>
        ))}
      </View>
    </Modal>
  )
}

// 画像添付のタップで開く全画面ビューア
function ImageViewer({ fileId, accessToken, onClose }: {
  fileId: string | null
  accessToken?: string
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={fileId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBackdrop} onPress={onClose}>
        {fileId && accessToken && (
          <Image
            source={{ uri: attachmentUrl(fileId), headers: { Authorization: `Bearer ${accessToken}` } }}
            style={styles.viewerImage}
            resizeMode="contain"
          />
        )}
        <TouchableOpacity style={[styles.viewerClose, { top: insets.top + 8 }]} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  )
}

function QueuedRow({ message, me, onRetry, c }: {
  message: QueuedMessage
  me: { displayName: string; avatarUrl: string | null } | undefined
  onRetry: (tempId: string) => void
  c: Theme
}) {
  const failed = message.status === 'failed'
  return (
    <TouchableOpacity style={styles.row} disabled={!failed} onPress={() => onRetry(message.tempId)} activeOpacity={0.7}>
      <SenderAvatar name={me?.displayName ?? '…'} url={me?.avatarUrl ?? null} c={c} />
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={[styles.senderName, { color: c.text }]}>{me?.displayName ?? '…'}</Text>
          <Text style={[styles.time, { color: c.text4 }]}>{formatTime(message.createdAt)}</Text>
        </View>
        <Text style={[styles.messageText, { color: c.text4 }]}>{renderContent(message.content, c)}</Text>
        <View style={styles.queueStatus}>
          {failed ? (
            <>
              <Ionicons name="alert-circle" size={13} color={c.redText} />
              <Text style={[styles.queueStatusText, { color: c.redText, fontWeight: '600' }]}>送信失敗・タップして再送</Text>
            </>
          ) : (
            <>
              <Ionicons name="time-outline" size={13} color={c.text4} />
              <Text style={[styles.queueStatusText, { color: c.text4 }]}>送信中…</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function ChatChannelScreen() {
  const { channelId, name, project, dm } = useLocalSearchParams<{
    channelId: string; name?: string; project?: string; dm?: string
  }>()
  const isDm = dm === '1'
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? THEME.dark : THEME.light
  const session = useSession()

  const { data: messages, isLoading, error } = useMessages(channelId)
  const { queued, send, retry } = useMessageQueue(channelId)
  const { mutate: markRead } = useMarkChannelRead(channelId)
  const { mutate: toggleReaction } = useToggleReaction(channelId)
  const upload = useAttachmentUpload(channelId)
  const { data: me } = useMe()

  const [draft, setDraft] = React.useState('')
  // リアクション絵文字ピッカーの対象メッセージ。null のとき非表示
  const [pickerTarget, setPickerTarget] = React.useState<string | null>(null)
  // リアクションした人一覧シートの対象（絵文字長押し）。null のとき非表示
  const [reactorsTarget, setReactorsTarget] = React.useState<{ emoji: string; userNames: string[] } | null>(null)
  // 全画面画像ビューアの対象 fileId。null のとき非表示
  const [viewerFileId, setViewerFileId] = React.useState<string | null>(null)

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
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
            {isDm ? (name ?? 'ダイレクトメッセージ') : `#${name ?? 'チャンネル'}`}
          </Text>
          {project && <Text style={[styles.headerSub, { color: c.text4 }]} numberOfLines={1}>{project}</Text>}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>
        ) : error ? (
          <View style={styles.center}><Text style={[styles.errorText, { color: c.redText }]}>{error.message}</Text></View>
        ) : items.length === 0 ? (
          // 空状態は inverted FlatList の外に出す（中に置くと上下反転して表示される）
          <View style={styles.center}>
            <Text style={[styles.empty, { color: c.text4 }]}>まだメッセージがありません</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={items}
            keyExtractor={item => (item.kind === 'message' ? item.message.id : item.queued.tempId)}
            renderItem={({ item }) =>
              item.kind === 'message'
                ? <MessageRow
                    message={item.message}
                    c={c}
                    onToggleReaction={(messageId, emoji) => toggleReaction({ messageId, emoji })}
                    onOpenPicker={setPickerTarget}
                    onShowReactors={(emoji, userNames) => setReactorsTarget({ emoji, userNames })}
                    onOpenImage={setViewerFileId}
                    {...(session?.access_token ? { accessToken: session.access_token } : {})}
                  />
                : <QueuedRow
                    message={item.queued}
                    me={me ? { displayName: me.displayName, avatarUrl: me.avatarUrl } : undefined}
                    onRetry={retry}
                    c={c}
                  />
            }
            contentContainerStyle={styles.list}
          />
        )}

        {/* 入力欄。Web 版モバイルと同じ「カード + 上段アクションチップ + 入力行」構成 */}
        <View style={[styles.composerWrap, { paddingBottom: 8 }]}>
          <View style={[styles.composer, { backgroundColor: c.card, borderColor: c.border2 }]}>
            <View style={[styles.composerActions, { borderBottomColor: c.divider }]}>
              <TouchableOpacity onPress={() => void upload.pickImage()} style={styles.actionChip} hitSlop={4}>
                <Ionicons name="image-outline" size={13} color={c.text3} />
                <Text style={[styles.actionChipLabel, { color: c.text3 }]}>画像</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void upload.pickDocument()} style={styles.actionChip} hitSlop={4}>
                <Ionicons name="attach-outline" size={13} color={c.text3} />
                <Text style={[styles.actionChipLabel, { color: c.text3 }]}>ファイル</Text>
              </TouchableOpacity>
            </View>

            {upload.uploads.length > 0 && (
              <View style={[styles.uploadList, { borderBottomColor: c.divider }]}>
                {upload.uploads.map(u => (
                  <View key={u.id} style={styles.uploadRow}>
                    {u.status === 'uploading' && <ActivityIndicator size="small" color={c.accent} />}
                    {u.status === 'done' && <Ionicons name="checkmark-circle" size={16} color={c.accent} />}
                    {u.status === 'error' && <Ionicons name="alert-circle" size={16} color={c.redText} />}
                    <Text style={[styles.uploadName, { color: c.text2 }]} numberOfLines={1}>{u.fileName}</Text>
                    {u.status === 'uploading' && (
                      <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                        <View style={[styles.progressBar, { backgroundColor: c.accent, width: `${Math.round(u.progress * 100)}%` }]} />
                      </View>
                    )}
                    <TouchableOpacity onPress={() => upload.removeUpload(u.id)} hitSlop={8}>
                      <Ionicons name="close" size={16} color={c.text4} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder={isDm ? `${name ?? ''} にメッセージ送信` : `# ${name ?? 'チャンネル'} にメッセージ送信`}
                placeholderTextColor={c.text4}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
              <TouchableOpacity
                onPress={() => void handleSend()}
                disabled={!canSend}
                style={[styles.sendButton, { backgroundColor: canSend ? c.accent : c.border2 }]}
              >
                <Ionicons name="send" size={13} color={canSend ? c.onAccent : c.text4} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <EmojiPicker
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onEmojiSelected={(e: EmojiType) => {
          if (pickerTarget) toggleReaction({ messageId: pickerTarget, emoji: e.emoji })
          setPickerTarget(null)
        }}
        enableSearchBar
        translation={emojiJa}
        theme={{
          backdrop: '#00000066',
          knob: c.border2,
          container: c.card,
          header: c.text,
          category: { icon: c.text3, iconActive: c.onAccent, container: c.card2, containerActive: c.accent },
          search: { text: c.text, placeholder: c.text4, icon: c.text3, background: c.card2 },
        }}
      />

      <ReactorsSheet target={reactorsTarget} onClose={() => setReactorsTarget(null)} c={c} />

      <ImageViewer
        fileId={viewerFileId}
        onClose={() => setViewerFileId(null)}
        {...(session?.access_token ? { accessToken: session.access_token } : {})}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  backButton: { padding: 2 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 11.5 },
  list: { paddingHorizontal: 12, paddingVertical: 10, gap: 16 },
  empty: { textAlign: 'center', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowBody: { flex: 1, minWidth: 0 },
  rowHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  senderName: { fontSize: 14, fontWeight: '700' },
  time: { fontSize: 11 },
  messageText: { fontSize: 13.5, lineHeight: 21 },
  queueStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  queueStatusText: { fontSize: 11 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  attachmentImage: { width: 200, height: 150, borderRadius: 8 },
  attachmentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, maxWidth: 260,
  },
  fileIcon: { width: 28, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  attachmentName: { fontSize: 12.5, flexShrink: 1 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' },
  reaction: { height: 24, paddingHorizontal: 7, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  reactionText: { fontSize: 11, fontWeight: '600' },
  reactionAdd: {
    height: 24, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  reactorsBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  reactorsSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1,
    paddingHorizontal: 20, paddingTop: 10,
  },
  grip: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  reactorsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8 },
  reactorsEmoji: { fontSize: 28 },
  reactorsCount: { fontSize: 13, fontWeight: '600' },
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1 },
  reactorAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reactorName: { fontSize: 15 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', right: 16 },
  composerWrap: { paddingHorizontal: 8, paddingTop: 4 },
  composer: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  composerActions: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1,
  },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5,
  },
  actionChipLabel: { fontSize: 11.5, fontWeight: '500' },
  uploadList: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, borderBottomWidth: 1 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadName: { flexShrink: 1, fontSize: 12.5 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  input: { flex: 1, fontSize: 14, maxHeight: 120, paddingTop: 4, paddingBottom: 4 },
  sendButton: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
