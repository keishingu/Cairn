import { useRouter } from 'expo-router'
import { AppearanceProvider } from '../components/appearance-provider'
import { NativeWebViewScreen } from '../components/native-webview-screen'
import { useT } from '../components/locale-provider'

export default function OnboardingScreen() {
  const t = useT()
  const router = useRouter()

  return (
    <AppearanceProvider>
      <NativeWebViewScreen
        path="/onboarding"
        title={t('Create workspace')}
        requiresWorkspace={false}
        showNotifications={false}
        onWebPathChange={(path) => {
          if (path === '/chats') router.replace('/(app)/chats')
        }}
      />
    </AppearanceProvider>
  )
}
