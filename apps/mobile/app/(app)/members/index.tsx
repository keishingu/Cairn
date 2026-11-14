import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function MembersScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/members" title={t('Members')} />
}
