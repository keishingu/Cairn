import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function AiScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/ai" title={t('AI assistant')} />
}
