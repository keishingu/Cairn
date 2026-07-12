import React from 'react'
import { AppWebView, type AppWebViewHandle } from '../../../components/app-webview'
import { projectsViewInjection, useProjectsView } from '../../../components/projects-view-context'

export default function ProjectsScreen() {
  const ref = React.useRef<AppWebViewHandle>(null)
  const { view } = useProjectsView()

  const syncView = React.useCallback(() => {
    ref.current?.injectJavaScript(projectsViewInjection(view))
  }, [view])

  React.useEffect(() => {
    syncView()
  }, [syncView])

  return <AppWebView ref={ref} path="/projects" onLoadEnd={syncView} />
}
