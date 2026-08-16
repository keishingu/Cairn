import { useRouter } from 'expo-router'
import { AppearanceProvider } from '../components/appearance-provider'
import { NativeWebViewScreen } from '../components/native-webview-screen'

export default function OnboardingScreen() {
  const router = useRouter()

  return (
    <AppearanceProvider>
      <NativeWebViewScreen
        path="/onboarding"
        title="ワークスペースを作成"
        requiresWorkspace={false}
        onWebPathChange={(path) => {
          if (path === '/projects') router.replace('/(app)/projects')
        }}
      />
    </AppearanceProvider>
  )
}
