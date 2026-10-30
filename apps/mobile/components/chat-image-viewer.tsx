import React from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import {
  ensureCachedAttachment,
  removeCachedAttachment,
  shareCachedAttachment,
} from '../lib/attachment-cache'
import { attachmentRequestHeaders, type AttachmentAuth } from '../lib/attachment-auth'
import { buildImageViewerHtml, parseImageViewerMessage } from '../lib/attachment-viewer-html'
import { isHorizontalDrag, resolveSwipe, stepImageIndex } from '../lib/image-viewer-navigation'
import { useT } from './locale-provider'

// 拡大の上限は PDF・Office ビューアの WebView（maximum-scale）と揃える
const MAX_ZOOM_SCALE = 5
const DOUBLE_TAP_ZOOM_SCALE = 2.5
const DOUBLE_TAP_INTERVAL_MS = 280
const STAGE_BACKGROUND = '#000000'

type ImageSource = { uri: string; headers: Record<string, string> }

export type ViewerImageFile = { fileId: string; fileName: string; mimeType: string | null }

// images は同じメッセージの画像だけ。index の画像から開き、スワイプか画面端のボタンで前後へ移動する
export function ChatImageViewer({
  images,
  initialIndex,
  fileUrlFor,
  auth,
  onClose,
}: {
  images: ViewerImageFile[]
  initialIndex: number
  fileUrlFor: (fileId: string) => string
  auth: AttachmentAuth
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [index, setIndex] = React.useState(initialIndex)
  const { fileId, fileName, mimeType } = images[index] ?? images[0]!
  const fileUrl = fileUrlFor(fileId)
  const [attempt, setAttempt] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [zoomed, setZoomed] = React.useState(false)
  const [busyAction, setBusyAction] = React.useState<'save' | 'share' | null>(null)
  const zoomedRef = React.useRef(false)
  zoomedRef.current = zoomed
  const indexRef = React.useRef(index)
  indexRef.current = index
  const countRef = React.useRef(images.length)
  countRef.current = images.length

  const go = React.useCallback((direction: 'prev' | 'next') => {
    const next = stepImageIndex(indexRef.current, countRef.current, direction)
    if (next === indexRef.current) return
    setIndex(next)
    setAttempt(0)
    setLoading(true)
    setFailed(false)
    setZoomed(false)
  }, [])

  // 等倍のときだけ 1 本指の横ドラッグを奪って画像送りにする。拡大中は子（ScrollView / WebView）のパンに任せる
  const swipe = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          !zoomedRef.current &&
          countRef.current > 1 &&
          event.nativeEvent.touches.length === 1 &&
          isHorizontalDrag(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          const direction = resolveSwipe(gesture.dx, gesture.dy)
          if (direction) go(direction)
        },
      }),
    [go],
  )

  const runFileAction = async (action: 'save' | 'share') => {
    if (busyAction) return
    setBusyAction(action)
    try {
      await shareCachedAttachment({
        fileUrl,
        fileId,
        fileName,
        auth,
        mimeType,
        dialogTitle: action === 'save' ? t('Save image') : t('Share image'),
        t,
      })
    } catch (error) {
      Alert.alert(
        action === 'save' ? t('Could not save the image') : t('Could not share the image'),
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
            accessibilityLabel={t('Close image')}
            onPress={onClose}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          {images.length > 1 && (
            <Text style={styles.counter}>{`${index + 1} / ${images.length}`}</Text>
          )}
        </View>

        <View style={styles.stage} {...swipe.panHandlers}>
          {failed ? (
            <View style={styles.failure}>
              <Text style={styles.failureText}>{t('Could not display the image')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Reload image')}
                onPress={() => {
                  setFailed(false)
                  setLoading(true)
                  setAttempt((current) => current + 1)
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <ZoomableImage
              key={`${fileId}:${attempt}`}
              attempt={attempt}
              fileUrl={fileUrl}
              fileId={fileId}
              fileName={fileName}
              auth={auth}
              onZoomChange={setZoomed}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setFailed(true)
              }}
            />
          )}
          {loading && !failed && (
            <ActivityIndicator style={styles.spinner} size="large" color="#FFFFFF" />
          )}
          {images.length > 1 && !zoomed && (
            <>
              {index > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Previous image')}
                  onPress={() => go('prev')}
                  style={[styles.edge, styles.edgeLeft]}
                >
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </Pressable>
              )}
              {index < images.length - 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Next image')}
                  onPress={() => go('next')}
                  style={[styles.edge, styles.edgeRight]}
                >
                  <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                </Pressable>
              )}
            </>
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <ViewerAction
            icon="download-outline"
            label={t('Save entry')}
            busy={busyAction === 'save'}
            disabled={busyAction !== null}
            onPress={() => void runFileAction('save')}
          />
          <ViewerAction
            icon="share-outline"
            label={t('Share')}
            busy={busyAction === 'share'}
            disabled={busyAction !== null}
            onPress={() => void runFileAction('share')}
          />
        </View>
      </View>
    </Modal>
  )
}

type ZoomableImageProps = {
  attempt: number
  fileUrl: string
  fileId: string
  fileName: string
  auth: AttachmentAuth
  onZoomChange: (zoomed: boolean) => void
  onLoadStart: () => void
  onLoadEnd: () => void
  onError: () => void
}

// ピンチで拡大できる画像。iOS は OS 標準の ScrollView の拡大（PDF・Office と同じ UIScrollView）、
// ScrollView が拡大に対応しない Android は WebView の拡大で表示する
function ZoomableImage(props: ZoomableImageProps) {
  return Platform.OS === 'ios' ? <IosZoomableImage {...props} /> : <AndroidZoomableImage {...props} />
}

function IosZoomableImage({ fileUrl, fileName, auth, onZoomChange, onLoadStart, onLoadEnd, onError }: ZoomableImageProps) {
  const scrollRef = React.useRef<ScrollView>(null)
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null)
  const zoomScaleRef = React.useRef(1)
  const lastTapRef = React.useRef(0)
  // トークンの更新で読み込み直さないよう、開いた時点の値で固定する（PDF ビューアと同じ）
  const [source] = React.useState<ImageSource>(() => ({
    uri: fileUrl,
    headers: attachmentRequestHeaders(auth),
  }))

  // PDF ビューアと同じく、ダブルタップで拡大し、拡大中のダブルタップで全体表示に戻す
  const handlePress = (event: GestureResponderEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current > DOUBLE_TAP_INTERVAL_MS) {
      lastTapRef.current = now
      return
    }
    lastTapRef.current = 0
    if (!size) return
    if (zoomScaleRef.current > 1.01) {
      scrollRef.current?.scrollResponderZoomTo({ x: 0, y: 0, ...size, animated: true })
      return
    }
    const width = size.width / DOUBLE_TAP_ZOOM_SCALE
    const height = size.height / DOUBLE_TAP_ZOOM_SCALE
    const { locationX, locationY } = event.nativeEvent
    scrollRef.current?.scrollResponderZoomTo({
      x: locationX - width / 2,
      y: locationY - height / 2,
      width,
      height,
      animated: true,
    })
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        setSize((current) => (current?.width === width && current.height === height ? current : { width, height }))
      }}
    >
      {size && (
        <ScrollView
          ref={scrollRef}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={size}
          minimumZoomScale={1}
          maximumZoomScale={MAX_ZOOM_SCALE}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            zoomScaleRef.current = event.nativeEvent.zoomScale
            onZoomChange(zoomScaleRef.current > 1.01)
          }}
        >
          <Pressable accessible={false} onPress={handlePress} style={size}>
            <Image
              accessibilityLabel={fileName}
              source={source}
              resizeMode="contain"
              style={size}
              onLoadStart={onLoadStart}
              onLoadEnd={onLoadEnd}
              onError={onError}
            />
          </Pressable>
        </ScrollView>
      )}
    </View>
  )
}

function AndroidZoomableImage({
  attempt,
  fileUrl,
  fileId,
  fileName,
  auth,
  onZoomChange,
  onLoadStart,
  onLoadEnd,
  onError,
}: ZoomableImageProps) {
  const t = useT()
  const [localUri, setLocalUri] = React.useState<string | null>(null)
  const authRef = React.useRef(auth)
  authRef.current = auth
  // 親の再描画で渡し直される関数で取得をやり直さないよう、最新の値を参照するだけにする
  const callbacksRef = React.useRef({ onLoadStart, onError })
  callbacksRef.current = { onLoadStart, onError }

  // WebView の画像の読み込みには認証ヘッダーを付けられないため、保存・共有と同じキャッシュへ取得して表示する
  React.useEffect(() => {
    let cancelled = false
    callbacksRef.current.onLoadStart()
    // 再試行（attempt > 0）は壊れたキャッシュを再利用しないよう必ず取り直す
    ensureCachedAttachment(fileUrl, fileId, fileName, authRef.current, t, { refresh: attempt > 0 })
      .then((uri) => {
        if (!cancelled) setLocalUri(uri)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('[chat] 画像を取得できませんでした:', error)
        callbacksRef.current.onError()
      })
    return () => {
      cancelled = true
    }
    // t は言語切替で変わるが、取得し直す必要はないため依存に含めない
  }, [attempt, fileId, fileName, fileUrl])

  const handleRenderError = (description: string) => {
    console.error('[chat] 画像を表示できませんでした:', description)
    void removeCachedAttachment(fileId, fileName).catch((cleanupError: unknown) => {
      console.error('[chat] 表示できなかった画像のキャッシュを削除できませんでした:', cleanupError)
    })
    onError()
  }

  const baseUrl = FileSystem.cacheDirectory ?? undefined
  const html = React.useMemo(
    () => (localUri ? buildImageViewerHtml(localUri, STAGE_BACKGROUND) : null),
    [localUri],
  )
  // 画像以外は読み込ませない。HTML は自前で作った固定の内容で、JavaScript は img の成否の通知だけに使う
  const allowNavigation = (request: WebViewNavigation) =>
    request.url === 'about:blank' || request.url === baseUrl

  if (!html) return null
  return (
    <WebView
      source={baseUrl ? { html, baseUrl } : { html }}
      originWhitelist={['*']}
      javaScriptEnabled
      // キャッシュに取得した画像を file:// で読むため。読むのは自前の HTML の img だけ
      allowFileAccess
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      containerStyle={StyleSheet.absoluteFill}
      style={styles.webview}
      onShouldStartLoadWithRequest={allowNavigation}
      onMessage={(event) => {
        const message = parseImageViewerMessage(event.nativeEvent.data)
        if (message === 'loaded') onLoadEnd()
        else if (message === 'zoomed') onZoomChange(true)
        else if (message === 'fit') onZoomChange(false)
        else if (message === 'error') handleRenderError('img')
      }}
      onError={(event) => handleRenderError(event.nativeEvent.description)}
    />
  )
}

export function ViewerAction({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  busy: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      )}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STAGE_BACKGROUND },
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
  counter: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  webview: { flex: 1, backgroundColor: STAGE_BACKGROUND },
  spinner: { position: 'absolute' },
  edge: {
    position: 'absolute',
    top: '40%',
    width: 40,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  edgeLeft: { left: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  edgeRight: { right: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  failure: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  failureText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
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
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
})
