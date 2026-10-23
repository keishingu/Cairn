import React from 'react'
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewProps } from 'react-native-webview'
import {
  ensureCachedAttachment,
  removeCachedAttachment,
  shareCachedAttachment,
} from '../lib/attachment-cache'
import { buildMarkdownDocumentHtml } from '../lib/attachment-viewer-html'
import { useAppAppearance } from './appearance-provider'
import { ViewerAction } from './chat-image-viewer'
import { useT } from './locale-provider'

type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0]

type LoadState =
  | { kind: 'downloading' }
  | { kind: 'ready'; markdown: string }
  | { kind: 'failed'; message: string }

// 添付の Markdown を Web のプレビューと同じく描画して表示する。
// 取得は PDF・Office と同じ共有シートのキャッシュを使い、拡大は WebView のピンチに任せる
export function ChatMarkdownViewer({
  fileUrl,
  fileId,
  fileName,
  mimeType,
  accessToken,
  onClose,
  onPressLink,
}: {
  fileUrl: string
  fileId: string
  fileName: string
  mimeType: string | null
  accessToken: string
  onClose: () => void
  onPressLink: (url: string) => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const { palette, resolvedTheme } = useAppAppearance()
  const [attempt, setAttempt] = React.useState(0)
  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'downloading' })
  const [rendered, setRendered] = React.useState(false)
  const [busyAction, setBusyAction] = React.useState<'save' | 'share' | null>(null)

  // トークンの更新で読み込み直さないよう、取得時点の最新値を参照するだけにする（PDF ビューアと同じ）
  const accessTokenRef = React.useRef(accessToken)
  accessTokenRef.current = accessToken

  React.useEffect(() => {
    let cancelled = false
    setLoadState({ kind: 'downloading' })
    setRendered(false)
    // 再試行（attempt > 0）は壊れたキャッシュを再利用しないよう必ず取り直す
    ensureCachedAttachment(fileUrl, fileId, fileName, accessTokenRef.current, t, {
      refresh: attempt > 0,
    })
      .then((localUri) => FileSystem.readAsStringAsync(localUri))
      .then((markdown) => {
        if (!cancelled) setLoadState({ kind: 'ready', markdown })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('[chat] Markdown ファイルを取得できませんでした:', error)
        // 読めなかったキャッシュを保存・共有で使わないための後始末。失敗しても黙って捨てない
        void removeCachedAttachment(fileId, fileName).catch((cleanupError: unknown) => {
          console.error('[chat] 表示できなかった Markdown ファイルのキャッシュを削除できませんでした:', cleanupError)
        })
        setLoadState({
          kind: 'failed',
          message: error instanceof Error ? error.message : t('Please try again in a moment.'),
        })
      })
    return () => {
      cancelled = true
    }
    // t は言語切替で変わるが、取得し直す必要はないため依存に含めない
  }, [attempt, fileId, fileName, fileUrl])

  const html = React.useMemo(
    () =>
      loadState.kind === 'ready'
        ? buildMarkdownDocumentHtml(
            loadState.markdown,
            {
              dark: resolvedTheme === 'dark',
              background: palette.bg,
              surface: palette.card2,
              text: palette.text,
              text2: palette.text2,
              text3: palette.text3,
              border: palette.border,
              link: palette.accentText,
            },
            { imageLabel: t('Image') },
          )
        : null,
    [loadState, palette, resolvedTheme, t],
  )

  // 自前の HTML 以外は読み込ませない。文書の中のリンクはユーザーがタップしたときだけ、
  // チャット本文と同じ判定で外部ブラウザや画面遷移に渡す。Android は HTML の初回読み込みでは
  // この判定を呼ばず、JavaScript も無効のため、ここへ来るのはリンクのタップだけ
  const handleNavigation = (request: ShouldStartLoadRequest) => {
    if (request.url === 'about:blank') return true
    // 目次や脚注など文書内の見出しへのリンクは、その場でスクロールさせる
    if (request.url.startsWith('about:blank#')) return true
    const tapped = Platform.OS === 'android' || request.navigationType === 'click'
    if (tapped && request.isTopFrame !== false) onPressLink(request.url)
    return false
  }

  const handleRenderError = (description: string) => {
    console.error('[chat] Markdown ファイルを表示できませんでした:', description)
    setLoadState({ kind: 'failed', message: description || t('Please try again in a moment.') })
  }

  // 描画が完了して表示できたときだけ保存・共有を許す（PDF ビューアと同じ）
  const actionsDisabled = busyAction !== null || loadState.kind !== 'ready' || !rendered

  const runFileAction = async (action: 'save' | 'share') => {
    if (busyAction) return
    setBusyAction(action)
    try {
      await shareCachedAttachment({
        fileUrl,
        fileId,
        fileName,
        accessToken,
        mimeType,
        dialogTitle: action === 'save' ? t('Save file') : t('Share file'),
        t,
      })
    } catch (error) {
      Alert.alert(
        action === 'save' ? t('Could not save the file') : t('Could not share the file'),
        error instanceof Error ? error.message : t('Please try again in a moment.'),
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close file')}
            onPress={onClose}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>

        <View style={styles.stage}>
          {loadState.kind === 'failed' ? (
            <View style={styles.failure}>
              <Text style={styles.failureText}>{t('Could not display the file')}</Text>
              <Text style={styles.failureDetail}>{loadState.message}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Reload file')}
                onPress={() => setAttempt((current) => current + 1)}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : html ? (
            <WebView
              key={attempt}
              source={{ html }}
              // 既定の許可リストに合わない URL は react-native-webview が判定前に外部で開いてしまうため、
              // すべての遷移を handleNavigation に通す
              originWhitelist={['*']}
              // 送信者が書いた文書のため、スクリプトは動かさない（生の HTML も文字として出している）
              javaScriptEnabled={false}
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              // 中央寄せの親の中で WebView の container の幅が 0 にならないよう、container 側を全面に広げる
              containerStyle={StyleSheet.absoluteFill}
              style={[styles.document, { backgroundColor: palette.bg }]}
              onShouldStartLoadWithRequest={handleNavigation}
              onLoadEnd={() => setRendered(true)}
              onError={(event) => handleRenderError(event.nativeEvent.description)}
            />
          ) : null}
          {loadState.kind !== 'failed' && !rendered && (
            <ActivityIndicator style={styles.spinner} size="large" color="#FFFFFF" />
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <ViewerAction
            icon="download-outline"
            label={t('Save entry')}
            busy={busyAction === 'save'}
            disabled={actionsDisabled}
            onPress={() => void runFileAction('save')}
          />
          <ViewerAction
            icon="share-outline"
            label={t('Share')}
            busy={busyAction === 'share'}
            disabled={actionsDisabled}
            onPress={() => void runFileAction('share')}
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  fileName: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  document: { flex: 1 },
  spinner: { position: 'absolute' },
  failure: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  failureText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  failureDetail: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' },
  retry: {
    minHeight: 36,
    borderRadius: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
})
