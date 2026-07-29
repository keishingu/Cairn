import { useLocalSearchParams, useRouter } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  return (
    <NativeWebViewScreen
      path={`/projects?open=${id}`}
      title="プロジェクト"
      onBack={() => router.replace('/(app)/projects')}
    />
  )
}
