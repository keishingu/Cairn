import { useLocalSearchParams } from 'expo-router'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'
import { aiScreenPath, firstParam } from '../../../lib/quick-actions'

export default function AiScreen() {
  const t = useT()
  // focus=1 はホーム画面のクイックアクションから来たときで、Web が新しい会話を始めて入力欄へフォーカスする
  const { focus, open } = useLocalSearchParams<{ focus?: string | string[]; open?: string | string[] }>()
  const focusInput = firstParam(focus) === '1'
  return (
    <NativeWebViewScreen
      path={aiScreenPath({ focus: focusInput, open: firstParam(open) })}
      title={t('AI assistant')}
      allowProgrammaticFocus={focusInput}
    />
  )
}
