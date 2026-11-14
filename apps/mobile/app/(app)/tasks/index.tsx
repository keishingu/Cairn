import { useLocalSearchParams } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'
import { firstParam, tasksScreenPath } from '../../../lib/quick-actions'

export default function TasksScreen() {
  const t = useT()
  // チャットのタスクチップや「タスク化する」から来たとき、Web の /tasks?taskId= の自動オープンに渡す
  // open は開くたびに変わる値で、同じタスクを再度開いたときも path を変えて Web 側に再オープンさせる
  // new=1 はホーム画面のクイックアクションから来たときで、Web の作成モーダルを開く
  const { taskId, new: isNew, open } = useLocalSearchParams<{
    taskId?: string | string[]
    new?: string | string[]
    open?: string | string[]
  }>()
  const path = tasksScreenPath({ taskId: firstParam(taskId), isNew: firstParam(isNew) === '1', open: firstParam(open) })
  return <NativeWebViewScreen path={path} title={t('My tasks')} />
}
