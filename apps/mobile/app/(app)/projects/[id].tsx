import { useLocalSearchParams, useRouter } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function ProjectDetailScreen() {
  const t = useT()
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>()
  const router = useRouter()
  // チャットから「ギャラリーに追加」した後など、開くタブを指定できる（Web の ?tab= に渡す）
  const tabQuery = tab === 'gallery' ? '&tab=gallery' : ''

  return (
    <NativeWebViewScreen
      path={`/projects?open=project-${id}${tabQuery}`}
      title={t('Projects')}
      onBack={() => router.replace('/(app)/projects')}
    />
  )
}
