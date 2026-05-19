// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { createContext, useContext } from 'react'

interface AppShellContextValue {
  openPanel: () => void
  openNotif: () => void
}

export const AppShellContext = createContext<AppShellContextValue>({
  openPanel: () => {},
  openNotif: () => {},
})

export const useAppShell = () => useContext(AppShellContext)
