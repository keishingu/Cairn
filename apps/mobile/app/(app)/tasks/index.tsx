import { useLocalSearchParams } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function TasksScreen() {
  const t = useT()
  // チャットのタスクチップや「タスク化する」から来たとき、Web の /tasks?taskId= の自動オープンに渡す
  const { taskId } = useLocalSearchParams<{ taskId?: string | string[] }>()
  const id = Array.isArray(taskId) ? taskId[0] : taskId
  const path = id ? `/tasks?taskId=${encodeURIComponent(id)}` : '/tasks'
  return <NativeWebViewScreen path={path} title={t('My tasks')} />
}
