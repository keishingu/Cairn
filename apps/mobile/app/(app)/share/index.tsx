import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAppAppearance } from '../../../components/appearance-provider'
import { useT } from '../../../components/locale-provider'
import { useOfflineMessageQueue } from '../../../components/offline-message-queue-provider'
import { useAttachmentUpload } from '../../../hooks/use-attachment-upload'
import { useHoldOtaReload } from '../../../hooks/use-ota-foreground-update'
import { useWorkspaceChannels, useWorkspaceDms } from '../../../hooks/use-chat-channels'
import { useProjectChannels } from '../../../hooks/use-projects'
import {
  discardReceivedShare,
  loadRecentShareTargets,
  rememberShareTarget,
  useShareInbox,
} from '../../../hooks/use-share-receive'
import { isImageMime } from '../../../lib/attachment-file'
import {
  projectChannelsQueryKey,
  workspaceChannelsQueryKey,
  workspaceDmsQueryKey,
} from '../../../lib/channel-list-queries'
import {
  resolveChannelOpenParams,
  type ChannelListItem,
  type DmListItem,
  type WorkspaceChannelListItem,
} from '../../../lib/channel-open-params'
import { createClientMessageId } from '../../../lib/offline-message-queue'
import { useSession } from '../../../lib/session-context'
import {
  buildShareTargets,
  filterShareTargets,
  MAX_SHARE_FILE_SIZE,
  sortShareTargets,
  type ReceivedShare,
  type ShareFailure,
  type ShareRejectedFile,
  type ShareTarget,
} from '../../../lib/share-receive'
import type { ThemePalette } from '../../../lib/theme'

type Translate = ReturnType<typeof useT>

function rejectionMessage(file: ShareRejectedFile, t: Translate): string {
  const name = file.fileName || t('Unnamed file')
  switch (file.reason) {
    case 'unsupported-type':
      return t('{name}: this file type cannot be attached', { name })
    case 'too-large':
      return t('{name}: larger than {size} MB', { name, size: MAX_SHARE_FILE_SIZE / (1024 * 1024) })
    case 'too-many':
      return t('{name}: over the limit of files per message', { name })
    case 'unreadable':
      return t('{name}: could not be read', { name })
  }
}

function failureMessage(failure: ShareFailure, t: Translate): string {
  return failure === 'empty'
    ? t('There was nothing to receive from the share')
    : t('Could not receive the shared content')
}

function Header({ palette, onClose }: { palette: ThemePalette; onClose: () => void }) {
  const t = useT()
  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      <Text style={[styles.headerTitle, { color: palette.text }]}>{t('Share to Cairn')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel')} hitSlop={8} onPress={onClose}>
        <Ionicons name="close" size={24} color={palette.text2} />
      </Pressable>
    </View>
  )
}

function Rejections({ files, palette }: { files: ShareRejectedFile[]; palette: ThemePalette }) {
  const t = useT()
  if (files.length === 0) return null
  return (
    <View style={styles.rejections}>
      <Text style={[styles.errorTitle, { color: palette.redText }]}>{t('These files will not be sent')}</Text>
      {files.map((file, index) => (
        <Text key={`${file.fileName}-${index}`} style={[styles.error, { color: palette.redText }]}>
          {rejectionMessage(file, t)}
        </Text>
      ))}
    </View>
  )
}

function TargetPicker({
  palette,
  onSelect,
  listHeader,
}: {
  palette: ThemePalette
  onSelect: (target: ShareTarget) => void
  listHeader: React.ReactElement
}) {
  const t = useT()
  const userId = useSession()?.user.id
  const projects = useProjectChannels()
  const workspace = useWorkspaceChannels()
  const dms = useWorkspaceDms()
  const [query, setQuery] = React.useState('')
  const [recentIds, setRecentIds] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!userId) return
    let cancelled = false
    void loadRecentShareTargets(userId)
      .then((ids) => {
        if (!cancelled) setRecentIds(ids)
      })
      .catch((error) => console.warn('[share-receive] 直近の宛先を読めませんでした', error))
    return () => {
      cancelled = true
    }
  }, [userId])

  const targets = React.useMemo(
    () =>
      filterShareTargets(
        sortShareTargets(
          buildShareTargets(
            { projects: projects.data, workspace: workspace.data, dms: dms.data },
            t('Channels'),
          ),
          recentIds,
        ),
        query,
      ),
    [dms.data, projects.data, query, recentIds, t, workspace.data],
  )
  const loading = projects.isLoading || workspace.isLoading || dms.isLoading
  const hasError = projects.isError || workspace.isError || dms.isError

  return (
    <FlatList
      data={targets}
      keyExtractor={(target) => target.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {listHeader}
          <Text style={[styles.sectionLabel, { color: palette.text3 }]}>{t('Choose where to send')}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search')}
            placeholderTextColor={palette.text4}
            accessibilityLabel={t('Search')}
            style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card2 }]}
          />
          {hasError && (
            <Pressable
              accessibilityRole="button"
              style={styles.retry}
              onPress={() => {
                if (projects.isError) void projects.refetch()
                if (workspace.isError) void workspace.refetch()
                if (dms.isError) void dms.refetch()
              }}
            >
              <Text style={[styles.error, { color: palette.redText }]}>
                {t('Could not load channels')} {t('Tap to retry')}
              </Text>
            </Pressable>
          )}
          {loading && <ActivityIndicator style={styles.loading} color={palette.accent} />}
        </>
      }
      ListEmptyComponent={
        loading || hasError ? null : (
          <Text style={[styles.empty, { color: palette.text3 }]}>{t('No matching chats')}</Text>
        )
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(item)}
          style={[styles.targetRow, { borderBottomColor: palette.divider }]}
        >
          <Ionicons
            name={item.kind === 'dm' ? 'person-outline' : 'chatbubbles-outline'}
            size={18}
            color={palette.text3}
          />
          <View style={styles.targetText}>
            <Text numberOfLines={1} style={[styles.targetTitle, { color: palette.text }]}>
              {item.title}
            </Text>
            {item.subtitle && (
              <Text numberOfLines={1} style={[styles.targetSubtitle, { color: palette.text3 }]}>
                {item.subtitle}
              </Text>
            )}
          </View>
        </Pressable>
      )}
    />
  )
}

function Composer({
  share,
  target,
  palette,
  onBack,
  onSent,
}: {
  share: ReceivedShare
  target: ShareTarget
  palette: ThemePalette
  onBack: () => void
  onSent: () => void
}) {
  const t = useT()
  const userId = useSession()?.user.id
  const offlineQueue = useOfflineMessageQueue()
  const upload = useAttachmentUpload(target.id)
  const [content, setContent] = React.useState(share.text)
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)
  // 再送で成功済みのファイルを二重にアップロードしないよう、ファイルごとの結果を残す
  const uploadedRef = React.useRef(new Map<string, string>())
  // 編集したコメント・アップロード中や成功済みの結果はメモリにしか無い（受け取り箱に残るのは共有元の内容だけ）。
  // その間は前面復帰時の更新の適用（再読み込み）を止める
  useHoldOtaReload(content !== share.text || sending || upload.uploads.length > 0 || uploadedRef.current.size > 0)

  const canSend =
    !sending && offlineQueue.ready && (content.trim().length > 0 || share.files.length > 0)

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    upload.clearUploads()
    try {
      for (const file of share.files) {
        if (uploadedRef.current.has(file.id)) continue
        const [fileId] = await upload.uploadFiles([file])
        if (fileId) uploadedRef.current.set(file.id, fileId)
      }
      const attachmentFileIds = share.files.flatMap((file) => {
        const fileId = uploadedRef.current.get(file.id)
        return fileId ? [fileId] : []
      })
      // 添付の後送は未対応なので、そろうまでキューへ入れない。ファイルは受信箱に残るので再送できる
      if (attachmentFileIds.length < share.files.length) {
        setSendError(t('Some files could not be uploaded. Send again.'))
        return
      }
      await offlineQueue.enqueue({
        id: createClientMessageId(),
        channelId: target.id,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        ...(attachmentFileIds.length > 0 ? { attachmentFileIds } : {}),
      })
      if (userId) {
        await rememberShareTarget(userId, target.id).catch((error) =>
          console.warn('[share-receive] 直近の宛先を保存できませんでした', error),
        )
      }
      onSent()
    } catch {
      setSendError(t('Could not save unsent messages on this device. Send again.'))
    } finally {
      setSending(false)
    }
  }

  const uploadErrors = upload.uploads.filter((item) => item.status === 'error')

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        <Pressable accessibilityRole="button" onPress={onBack} disabled={sending} style={styles.destination}>
          <Ionicons name="chevron-back" size={18} color={palette.text3} />
          <Text numberOfLines={1} style={[styles.destinationLabel, { color: palette.text }]}>
            {target.title}
          </Text>
        </Pressable>
        <Rejections files={share.rejected} palette={palette} />
        {share.files.map((file) => (
          <View key={file.id} style={[styles.fileRow, { borderColor: palette.border }]}>
            {isImageMime(file.mimeType) ? (
              <Image source={{ uri: file.uri }} style={styles.thumbnail} />
            ) : (
              <Ionicons name="document-outline" size={22} color={palette.text3} />
            )}
            <Text numberOfLines={1} style={[styles.fileName, { color: palette.text }]}>
              {file.fileName}
            </Text>
          </View>
        ))}
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          placeholder={t('Add a comment')}
          placeholderTextColor={palette.text4}
          accessibilityLabel={t('Add a comment')}
          style={[styles.input, styles.comment, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card2 }]}
        />
        {uploadErrors.map((item) => (
          <Text key={item.id} style={[styles.error, { color: palette.redText }]}>
            {item.fileName}: {item.error}
          </Text>
        ))}
        {sendError && <Text style={[styles.error, { color: palette.redText }]}>{sendError}</Text>}
        {offlineQueue.restoreError && (
          <Pressable accessibilityRole="button" onPress={offlineQueue.retryRestore}>
            <Text accessibilityRole="alert" style={[styles.error, { color: palette.redText }]}>
              {offlineQueue.restoreError} {t('Retry')}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => void send()}
          disabled={!canSend}
          style={[styles.sendButton, { backgroundColor: palette.accent, opacity: canSend ? 1 : 0.6 }]}
        >
          <Text style={[styles.sendLabel, { color: palette.onAccent }]}>
            {sending ? t('Sending...') : t('Send')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function ShareFlow({ share, palette }: { share: ReceivedShare; palette: ThemePalette }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [target, setTarget] = React.useState<ShareTarget | null>(null)

  const sendable = share.text.length > 0 || share.files.length > 0

  if (!sendable) {
    return (
      <ScrollView contentContainerStyle={styles.list}>
        <Rejections files={share.rejected} palette={palette} />
        <Text style={[styles.empty, { color: palette.text3 }]}>{t('There is nothing that can be sent')}</Text>
      </ScrollView>
    )
  }

  if (!target) {
    return (
      <TargetPicker
        palette={palette}
        onSelect={setTarget}
        listHeader={
          <>
            <Rejections files={share.rejected} palette={palette} />
            {share.files.length > 0 && (
              <Text style={[styles.summary, { color: palette.text2 }]}>
                {t('{count} files', { count: share.files.length })}
              </Text>
            )}
            {share.text.length > 0 && (
              <Text numberOfLines={3} style={[styles.summary, { color: palette.text2 }]}>
                {share.text}
              </Text>
            )}
          </>
        }
      />
    )
  }

  return (
    <Composer
      share={share}
      target={target}
      palette={palette}
      onBack={() => setTarget(null)}
      onSent={() => {
        const projects = queryClient.getQueryData<ChannelListItem[]>(projectChannelsQueryKey)
        const workspace = queryClient.getQueryData<WorkspaceChannelListItem[]>(workspaceChannelsQueryKey)
        const dms = queryClient.getQueryData<DmListItem[]>(workspaceDmsQueryKey)
        const params = resolveChannelOpenParams(
          target.id,
          { ...(projects ? { projects } : {}), ...(workspace ? { workspace } : {}), ...(dms ? { dms } : {}) },
          t,
        )
        router.navigate({ pathname: '/chats/[channelId]', params: { ...params } })
        void discardReceivedShare()
      }}
    />
  )
}

/** 他アプリから共有された本文・ファイルの送信先を選んで送る（Android のみ）。 */
export default function ShareScreen() {
  const t = useT()
  const router = useRouter()
  const { palette } = useAppAppearance()
  const state = useShareInbox()

  const close = () => {
    router.navigate('/(app)/chats')
    void discardReceivedShare()
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: palette.bg }]}>
      <Header palette={palette} onClose={close} />
      {state.status === 'ready' ? (
        <ShareFlow key={state.share.id} share={state.share} palette={palette} />
      ) : state.status === 'loading' || state.status === 'receiving' ? (
        <ActivityIndicator style={styles.loading} color={palette.accent} />
      ) : (
        <Text style={[styles.error, styles.failure, { color: palette.redText }]}>
          {failureMessage(state.status === 'failed' ? state.failure : 'empty', t)}
        </Text>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  list: { padding: 16, gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  summary: { fontSize: 14, marginBottom: 4 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  comment: { minHeight: 96, paddingVertical: 10, textAlignVertical: 'top' },
  rejections: { gap: 4, marginBottom: 8 },
  errorTitle: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13 },
  failure: { padding: 16 },
  retry: { paddingVertical: 10 },
  loading: { marginTop: 24 },
  empty: { fontSize: 13, paddingVertical: 12 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  targetText: { flex: 1 },
  targetTitle: { fontSize: 15 },
  targetSubtitle: { fontSize: 12, marginTop: 1 },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  destinationLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  thumbnail: { width: 36, height: 36, borderRadius: 6 },
  fileName: { flex: 1, fontSize: 14 },
  sendButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginTop: 8 },
  sendLabel: { fontSize: 14, fontWeight: '600' },
})
