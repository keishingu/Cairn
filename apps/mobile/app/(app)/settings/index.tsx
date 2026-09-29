import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function SettingsScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/settings" title={t('Settings')} requiresWorkspace={false} />
}
