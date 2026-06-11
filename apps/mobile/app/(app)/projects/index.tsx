import React from 'react'
import { AppWebView, type AppWebViewHandle } from '../../../components/app-webview'
import { useProjectsView, projectsViewInjection } from '../../../components/projects-view-context'

export default function ProjectsScreen() {
  const ref = React.useRef<AppWebViewHandle>(null)
  const { view } = useProjectsView()

  // ネイティブのビュー選択を WebView の localStorage へ反映する。
  // 選択変更時と、WebView の読み込み完了時（起動直後の同期）の両方で inject する。
  const sync = React.useCallback(() => {
    ref.current?.injectJavaScript(projectsViewInjection(view))
  }, [view])

  React.useEffect(() => { sync() }, [sync])

  return <AppWebView ref={ref} path="/projects" onLoadEnd={sync} />
}
