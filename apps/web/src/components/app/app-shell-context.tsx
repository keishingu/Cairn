// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { createContext, useContext } from 'react'
import type { ProjectDto } from '@/app/api/projects/route'

interface AppShellContextValue {
  openPanel: (project?: ProjectDto) => void
  openMember: (userId: string) => void
  openNotif: () => void
  projectsView: string
  setProjectsView: (view: string) => void
  /** ⌘⇧F（横断検索）の発火シグナル。chats 画面がこの増加を監視して検索を開く */
  crossSearchNonce: number
}

export const AppShellContext = createContext<AppShellContextValue>({
  openPanel: () => {},
  openMember: () => {},
  openNotif: () => {},
  projectsView: 'list',
  setProjectsView: () => {},
  crossSearchNonce: 0,
})

export const useAppShell = () => useContext(AppShellContext)
