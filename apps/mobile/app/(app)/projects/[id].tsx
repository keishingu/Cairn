import { useLocalSearchParams, useRouter } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function ProjectDetailScreen() {
  const t = useT()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  return (
    <NativeWebViewScreen
      path={`/projects?open=${id}`}
      title={t('Projects')}
      onBack={() => router.replace('/(app)/projects')}
    />
  )
}
