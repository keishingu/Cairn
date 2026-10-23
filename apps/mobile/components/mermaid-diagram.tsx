import React from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import { buildMermaidHtml, parseMermaidMessage } from '../lib/mermaid-html'
import type { ThemePalette } from '../lib/theme'
import { useAppAppearance } from './appearance-provider'
import { useT } from './locale-provider'

const PREVIEW_LINES = 3

// メッセージ内の Mermaid 図。本文の中では定義の冒頭だけを見せ、タップで全画面の図を開く
export function MermaidDiagramCard({
  definition,
  palette,
  onLongPress,
}: {
  definition: string
  palette: ThemePalette
  onLongPress?: () => void
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const preview = definition.split('\n').slice(0, PREVIEW_LINES).join('\n')

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Open Mermaid diagram')}
        onPress={() => setOpen(true)}
        {...(onLongPress ? { onLongPress, delayLongPress: 350 } : {})}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: palette.card2, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="git-network-outline" size={15} color={palette.accentText} />
          <Text style={[styles.cardTitle, { color: palette.text }]}>{t('Mermaid diagram')}</Text>
          <Text style={[styles.cardHint, { color: palette.accentText }]}>{t('Tap to view')}</Text>
        </View>
        <Text style={[styles.cardCode, { color: palette.text3 }]} numberOfLines={PREVIEW_LINES}>
          {preview}
        </Text>
      </Pressable>
      {open && <MermaidDiagramViewer definition={definition} onClose={() => setOpen(false)} />}
    </>
  )
}

type ViewerState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string }

function MermaidDiagramViewer({ definition, onClose }: { definition: string; onClose: () => void }) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const { palette, resolvedTheme } = useAppAppearance()
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<ViewerState>({ kind: 'loading' })

  const html = React.useMemo(
    () =>
      buildMermaidHtml(definition, {
        dark: resolvedTheme === 'dark',
        background: palette.bg,
        surface: palette.card2,
        accent: palette.accent,
        accentSoft: palette.accentSoft,
        text: palette.text,
        text2: palette.text2,
        text3: palette.text3,
        border: palette.border,
      }),
    [definition, palette, resolvedTheme],
  )

  // 図の中のリンクや外部ページへは移動させない（strict でもクリックは無効だが念のため）
  const allowNavigation = (request: WebViewNavigation) =>
    request.url === 'about:blank' || request.url.startsWith('data:')

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: palette.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close Mermaid diagram')}
            onPress={onClose}
            hitSlop={8}
            style={[styles.iconButton, { backgroundColor: palette.card2 }]}
          >
            <Ionicons name="close" size={22} color={palette.text} />
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t('Mermaid diagram')}
          </Text>
        </View>

        <View style={styles.stage}>
          {state.kind === 'failed' ? (
            <View style={styles.failure}>
              <Text style={[styles.failureText, { color: palette.text }]}>
                {t('Could not display the Mermaid diagram')}
              </Text>
              <Text style={[styles.failureDetail, { color: palette.text3 }]}>{state.message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setState({ kind: 'loading' })
                  setAttempt((current) => current + 1)
                }}
                style={[styles.retry, { backgroundColor: palette.card2, borderColor: palette.border }]}
              >
                <Text style={[styles.retryText, { color: palette.text }]}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              key={attempt}
              originWhitelist={['*']}
              source={{ html }}
              // 中央寄せの親の中で WebView の container の幅が 0 にならないよう、container 側を全面に広げる
              containerStyle={StyleSheet.absoluteFill}
              style={[styles.webview, { backgroundColor: palette.bg }]}
              javaScriptEnabled
              scalesPageToFit
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              onShouldStartLoadWithRequest={allowNavigation}
              onMessage={(event) => {
                const message = parseMermaidMessage(event.nativeEvent.data)
                if (message?.type === 'rendered') {
                  setState({ kind: 'ready' })
                  return
                }
                setState({
                  kind: 'failed',
                  message:
                    message?.type === 'error' && message.message !== 'script'
                      ? message.message
                      : t('Could not load the diagram renderer. Check your connection and try again.'),
                })
              }}
              onError={() =>
                setState({
                  kind: 'failed',
                  message: t('Could not load the diagram renderer. Check your connection and try again.'),
                })
              }
            />
          )}
          {state.kind === 'loading' && (
            <ActivityIndicator style={styles.spinner} size="large" color={palette.text3} />
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 4,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  cardHint: { fontSize: 12, fontWeight: '600' },
  cardCode: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: { opacity: 0.75 },
  root: { flex: 1 },
  header: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '600' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  webview: { flex: 1 },
  spinner: { position: 'absolute' },
  failure: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  failureText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  failureDetail: { fontSize: 12, textAlign: 'center' },
  retry: {
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 13, fontWeight: '700' },
})
