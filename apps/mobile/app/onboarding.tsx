import { AppearanceProvider } from '../components/appearance-provider'
import { NativeWebViewScreen } from '../components/native-webview-screen'

export default function OnboardingScreen() {
  return (
    <AppearanceProvider>
      <NativeWebViewScreen path="/onboarding" title="ワークスペースを作成" requiresWorkspace={false} />
    </AppearanceProvider>
  )
}
