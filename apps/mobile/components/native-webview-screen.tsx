import React from 'react'
import { StyleSheet, View } from 'react-native'
import { AppWebView, type AppWebViewHandle, type AppWebViewProps } from './app-webview'
import { NativeAppHeader } from './native-app-header'
import type { NativeHeaderDescriptor } from '../lib/native-header-bridge'
import { useAppAppearance } from './appearance-provider'
import { useWorkspace } from '../hooks/use-account'

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
    const { data: workspace } = useWorkspace()
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
        <AppWebView
          key={workspace?.id ?? 'workspace-loading'}
          ref={innerRef}
          {...webViewProps}
          includeSafeAreaTop={false}
          onNativeHeaderChange={setHeader}
        />
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: { flex: 1 },
})
