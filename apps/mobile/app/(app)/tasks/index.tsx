import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function TasksScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/tasks" title={t('My tasks')} />
}
