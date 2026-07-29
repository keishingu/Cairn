import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppWebView, type AppWebViewHandle, type AppWebViewProps } from './app-webview'
import { NativeAppHeader } from './native-app-header'
import type { NativeHeaderDescriptor } from '../lib/native-header-bridge'
import { useAppAppearance } from './appearance-provider'
import { useWorkspace } from '../hooks/use-account'
import { resolveNativeWebViewWorkspaceState } from '../lib/native-webview-workspace-state'

interface NativeWebViewScreenProps extends Omit<
  AppWebViewProps,
  'includeSafeAreaTop' | 'onNativeHeaderChange'
> {
  title: string
  subtitle?: string | undefined
  onBack?: (() => void) | undefined
}

export const NativeWebViewScreen = React.forwardRef<AppWebViewHandle, NativeWebViewScreenProps>(
  function NativeWebViewScreen({ title, subtitle, onBack, ...webViewProps }, forwardedRef) {
    const innerRef = React.useRef<AppWebViewHandle>(null)
    const { palette } = useAppAppearance()
    const workspaceQuery = useWorkspace()
    const workspaceState = resolveNativeWebViewWorkspaceState({
      workspaceId: workspaceQuery.data?.id,
      isPending: workspaceQuery.isPending,
      error: workspaceQuery.error,
    })
    const [header, setHeader] = React.useState<NativeHeaderDescriptor>({
      title,
      canGoBack: false,
      ...(subtitle ? { subtitle } : {}),
    })

    React.useImperativeHandle(
      forwardedRef,
      () => ({
        injectJavaScript: (script) => innerRef.current?.injectJavaScript(script),
        triggerNativeHeaderBack: () => innerRef.current?.triggerNativeHeaderBack(),
      }),
      [],
    )

    React.useEffect(() => {
      setHeader({ title, canGoBack: false, ...(subtitle ? { subtitle } : {}) })
    }, [subtitle, title, webViewProps.path])

    const handleBack =
      onBack ?? (header.canGoBack ? () => innerRef.current?.triggerNativeHeaderBack() : undefined)

    return (
      <View style={[styles.container, { backgroundColor: palette.bg }]}>
        <NativeAppHeader
          title={header.title || title}
          subtitle={header.subtitle ?? subtitle}
          {...(handleBack ? { onBack: handleBack } : {})}
        />
        {workspaceState.status === 'loading' ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator
              accessibilityLabel="ワークスペース情報を読み込み中"
              size="small"
              color={palette.accent}
            />
          </View>
        ) : workspaceState.status === 'error' ? (
          <View style={styles.stateContainer}>
            <Text accessibilityRole="alert" style={[styles.errorTitle, { color: palette.text }]}>
              ワークスペースを読み込めませんでした
            </Text>
            <Text style={[styles.errorBody, { color: palette.text3 }]}>
              {workspaceState.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ワークスペース情報を再読み込み"
              onPress={() => void workspaceQuery.refetch()}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: palette.accent },
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={[styles.retryLabel, { color: palette.onAccent }]}>再読み込み</Text>
            </Pressable>
          </View>
        ) : (
          <AppWebView
            key={workspaceState.workspaceId}
            ref={innerRef}
            {...webViewProps}
            includeSafeAreaTop={false}
            onNativeHeaderChange={setHeader}
          />
        )}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: { flex: 1 },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  retryButtonPressed: { opacity: 0.9 },
  retryLabel: { fontSize: 14, fontWeight: '700' },
})
