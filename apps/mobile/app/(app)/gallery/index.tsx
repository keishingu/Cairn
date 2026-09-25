import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { useT } from '../../../components/locale-provider'

export default function GalleryScreen() {
  const t = useT()
  return <NativeWebViewScreen path="/gallery" title={t('Gallery')} />
}
