import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function FilesScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/files" title={t('Files')} />
}
