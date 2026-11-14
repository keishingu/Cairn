import { AppWebView } from '../../../components/app-webview'
import { WEBVIEW_DEVICE_SIGN_OUT_PATH } from '../../../lib/webview-sign-out'

export default function SignOutScreen() {
  return <AppWebView path={WEBVIEW_DEVICE_SIGN_OUT_PATH} />
}
