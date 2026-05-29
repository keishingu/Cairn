import { useLocalSearchParams } from 'expo-router'
import { AppWebView } from '../../../components/app-webview'

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AppWebView path={`/projects?open=${id}`} />
}
