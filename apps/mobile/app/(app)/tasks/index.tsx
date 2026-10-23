import { useLocalSearchParams } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function TasksScreen() {
  const t = useT()
  // チャットのタスクチップや「タスク化する」から来たとき、Web の /tasks?taskId= の自動オープンに渡す
  // open は開くたびに変わる値で、同じタスクを再度開いたときも path を変えて Web 側に再オープンさせる
  const { taskId, open } = useLocalSearchParams<{ taskId?: string | string[]; open?: string | string[] }>()
  const id = Array.isArray(taskId) ? taskId[0] : taskId
  const openKey = Array.isArray(open) ? open[0] : open
  const path = id
    ? `/tasks?taskId=${encodeURIComponent(id)}${openKey ? `&open=${encodeURIComponent(openKey)}` : ''}`
    : '/tasks'
  return <NativeWebViewScreen path={path} title={t('My tasks')} />
}
