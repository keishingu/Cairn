// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { createContext, useContext } from 'react'
import type { ProjectDto } from '@/app/api/projects/route'

interface AppShellContextValue {
  openPanel: (project?: ProjectDto) => void
  openNotif: () => void
  projectsView: string
  setProjectsView: (view: string) => void
}

export const AppShellContext = createContext<AppShellContextValue>({
  openPanel: () => {},
  openNotif: () => {},
  projectsView: 'list',
  setProjectsView: () => {},
})

export const useAppShell = () => useContext(AppShellContext)
