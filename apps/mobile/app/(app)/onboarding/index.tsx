import { NativeWebViewScreen } from '../../../components/native-webview-screen'

export default function OnboardingScreen() {
  return <NativeWebViewScreen path="/onboarding" title="ワークスペースを作成" requiresWorkspace={false} />
}
