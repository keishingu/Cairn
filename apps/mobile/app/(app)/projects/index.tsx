import React from 'react'
import type { AppWebViewHandle } from '../../../components/app-webview'
import { NativeWebViewScreen } from '../../../components/native-webview-screen'
import { projectsViewInjection, useProjectsView } from '../../../components/projects-view-context'
import { useT } from '../../../components/locale-provider'

export default function ProjectsScreen() {
  const t = useT()
  const ref = React.useRef<AppWebViewHandle>(null)
  const { view } = useProjectsView()

  const syncView = React.useCallback(() => {
    ref.current?.injectJavaScript(projectsViewInjection(view))
  }, [view])

  React.useEffect(() => {
    syncView()
  }, [syncView])

  return (
    <NativeWebViewScreen ref={ref} path="/projects" title={t('Project list')} onLoadEnd={syncView} />
  )
}
