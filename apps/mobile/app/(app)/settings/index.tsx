import { NativeWebViewScreen } from '../../../components/native-webview-screen'

export default function SettingsScreen() {
  return <NativeWebViewScreen path="/settings" title="設定" requiresWorkspace={false} />
}
