import AsyncStorage from '@react-native-async-storage/async-storage'
import React from 'react'

export type ProjectsView = 'list' | 'calendar' | 'kanban'
export const PROJECTS_VIEW_KEY = 'cairn:projects_view_mobile'

interface ProjectsViewContextValue {
  view: ProjectsView
  setView: (view: ProjectsView) => void
}

const ProjectsViewContext = React.createContext<ProjectsViewContextValue | null>(null)

function isProjectsView(value: string | null): value is ProjectsView {
  return value === 'list' || value === 'calendar' || value === 'kanban'
}

export function ProjectsViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = React.useState<ProjectsView>('list')

  React.useEffect(() => {
    void AsyncStorage.getItem(PROJECTS_VIEW_KEY).then((saved) => {
      if (isProjectsView(saved)) setViewState(saved)
    })
  }, [])

  const setView = React.useCallback((next: ProjectsView) => {
    setViewState(next)
    void AsyncStorage.setItem(PROJECTS_VIEW_KEY, next)
  }, [])

  return (
    <ProjectsViewContext.Provider value={{ view, setView }}>
      {children}
    </ProjectsViewContext.Provider>
  )
}

export function useProjectsView(): ProjectsViewContextValue {
  const context = React.useContext(ProjectsViewContext)
  if (!context) throw new Error('useProjectsView は ProjectsViewProvider の内側で使用してください')
  return context
}

export function projectsViewInjection(view: ProjectsView): string {
  return `localStorage.setItem(${JSON.stringify(PROJECTS_VIEW_KEY)}, ${JSON.stringify(view)}); window.dispatchEvent(new Event('cairn:projects-view-changed')); true;`
}
