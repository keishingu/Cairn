import React from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Pdf from 'react-native-pdf'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ensureCachedAttachment,
  removeCachedAttachment,
  shareCachedAttachment,
} from '../lib/attachment-cache'
import { ViewerAction } from './chat-image-viewer'
import { useT } from './locale-provider'

type LoadState =
  | { kind: 'downloading' }
  | { kind: 'ready'; localUri: string }
  | { kind: 'failed'; message: string }

// 添付 PDF をアプリ内で表示する。取得は共有シートと同じキャッシュを使い、
// 一度開いた PDF は保存・共有でも再ダウンロードしない
export function ChatPdfViewer({
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
  const [attempt, setAttempt] = React.useState(0)
  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'downloading' })
  const [rendered, setRendered] = React.useState(false)
  const [page, setPage] = React.useState<{ current: number; total: number } | null>(null)
  const [busyAction, setBusyAction] = React.useState<'save' | 'share' | null>(null)

  // トークンはおよそ1時間ごとや前面復帰時に更新される。依存に含めると読んでいる途中の PDF が
  // 1ページ目から読み込み直されるため、取得時点の最新値を参照するだけにする
  const accessTokenRef = React.useRef(accessToken)
  accessTokenRef.current = accessToken

  React.useEffect(() => {
    let cancelled = false
    setLoadState({ kind: 'downloading' })
    setRendered(false)
    setPage(null)
    // 再試行（attempt > 0）は壊れたキャッシュを再利用しないよう必ず取り直す
    ensureCachedAttachment(fileUrl, fileId, fileName, accessTokenRef.current, t, {
      refresh: attempt > 0,
    })
      .then((localUri) => {
        if (!cancelled) setLoadState({ kind: 'ready', localUri })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('[chat] PDF を取得できませんでした:', error)
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

  const handleRenderError = (error: object) => {
    console.error('[chat] PDF を表示できませんでした:', error)
    // 再試行は refresh で必ず取り直すため、ここでの削除は保存・共有など他の経路で
    // 壊れたファイルを使わないための後始末。失敗しても再試行には影響しないが、黙って捨てない
    void removeCachedAttachment(fileId, fileName).catch((cleanupError: unknown) => {
      console.error('[chat] 表示できなかった PDF のキャッシュを削除できませんでした:', cleanupError)
    })
    setLoadState({
      kind: 'failed',
      message: error instanceof Error ? error.message : t('Please try again in a moment.'),
    })
  }

  // 初回ダウンロード中に保存・共有すると、書き込み途中のキャッシュを共有シートへ渡してしまう
  const actionsDisabled = busyAction !== null || loadState.kind === 'downloading'

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
        dialogTitle: action === 'save' ? t('Save PDF') : t('Share PDF'),
        t,
      })
    } catch (error) {
      Alert.alert(
        action === 'save' ? t('Could not save the PDF') : t('Could not share the PDF'),
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
            accessibilityLabel={t('Close PDF')}
            onPress={onClose}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          {page && (
            <Text style={styles.pageLabel}>
              {t('Page {page} of {total}', { page: page.current, total: page.total })}
            </Text>
          )}
        </View>

        <View style={styles.stage}>
          {loadState.kind === 'failed' ? (
            <View style={styles.failure}>
              <Text style={styles.failureText}>{t('Could not display the PDF')}</Text>
              <Text style={styles.failureDetail}>{loadState.message}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Reload PDF')}
                onPress={() => setAttempt((current) => current + 1)}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : loadState.kind === 'ready' ? (
            <Pdf
              key={attempt}
              source={{ uri: loadState.localUri }}
              style={styles.pdf}
              trustAllCerts={false}
              // 読み込み中は下の共通スピナーを出すため、ライブラリ既定の進捗テキストは描画しない
              renderActivityIndicator={() => <View />}
              onLoadComplete={(numberOfPages) => {
                setRendered(true)
                setPage((current) => ({ current: current?.current ?? 1, total: numberOfPages }))
              }}
              onPageChanged={(current, total) => setPage({ current, total })}
              onError={handleRenderError}
              onPressLink={onPressLink}
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
  pageLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdf: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
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
