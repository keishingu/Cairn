import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ProjectsView = 'list' | 'calendar' | 'kanban'

// Web 側 STORAGE_KEYS.projects_view_mob と同じキー。ネイティブの永続化と、
// WebView へ inject する localStorage 書き込みで同一キーを使うことで両者を揃える。
export const PROJECTS_VIEW_KEY = 'cairn:projects_view_mobile'

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

interface ProjectsViewContextValue {
  view: ProjectsView
  setView: (view: ProjectsView) => void
}

const ProjectsViewContext = React.createContext<ProjectsViewContextValue | null>(null)

export function ProjectsViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = React.useState<ProjectsView>('list')

  // 永続化された選択を起動時に読み込む（タブアイコンの出し分けに使う）
  React.useEffect(() => {
    AsyncStorage.getItem(PROJECTS_VIEW_KEY).then((saved) => {
      if (isValidView(saved)) setViewState(saved)
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
  const ctx = React.useContext(ProjectsViewContext)
  if (!ctx) throw new Error('useProjectsView は ProjectsViewProvider の内側で使用してください')
  return ctx
}

// ネイティブの選択を WebView の localStorage に反映し、リロードなしで切り替えさせる JS。
// mobile-shell.tsx の 'cairn:projects-view-changed' リスナーが受け取る。
export function projectsViewInjection(view: ProjectsView): string {
  return `
    localStorage.setItem(${JSON.stringify(PROJECTS_VIEW_KEY)}, ${JSON.stringify(view)});
    window.dispatchEvent(new Event('cairn:projects-view-changed'));
    true;
  `
}
