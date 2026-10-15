'use client'

import React from 'react'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { loadStored, storeValue } from '@/lib/stored-value'
import type { ProjectDto } from '@/app/api/projects/route'

export type ProjectsScope = 'mine' | 'all'
const SCOPES: readonly ProjectsScope[] = ['mine', 'all']

/**
 * 旧一覧の「参加中」タブ（projects_filter が 'joined' / 旧 'mine'）は、タブ「すべて」+ 範囲「参加中」へ移行する。
 * 範囲が既に保存済みなら範囲は変えず、タブだけ「すべて」に戻す。
 */
export function migrateLegacyJoinedTab() {
  if (typeof window === 'undefined') return
  try {
    const legacy = localStorage.getItem(STORAGE_KEYS.projects_filter)
    if (legacy !== 'joined' && legacy !== 'mine') return
    if (localStorage.getItem(STORAGE_KEYS.projects_scope) === null) storeValue(STORAGE_KEYS.projects_scope, 'mine')
    storeValue(STORAGE_KEYS.projects_filter, 'all')
  } catch { /* 保存領域が使えない環境では移行しない */ }
}

/** 一覧・カレンダー・カンバンで共有するプロジェクト範囲（参加中 / 全体）。既定は全体。 */
export function useProjectsScope(): [ProjectsScope, (next: ProjectsScope) => void] {
  const [scope, setScopeState] = React.useState<ProjectsScope>(() => {
    migrateLegacyJoinedTab()
    return loadStored(STORAGE_KEYS.projects_scope, SCOPES, 'all')
  })
  const setScope = React.useCallback((next: ProjectsScope) => {
    setScopeState(next)
    storeValue(STORAGE_KEYS.projects_scope, next)
  }, [])
  return [scope, setScope]
}

/** 「参加中」は自分がプロジェクトメンバーのもの。全体は絞り込まない。 */
export function filterProjectsByScope<T extends Pick<ProjectDto, 'isJoined'>>(projects: T[], scope: ProjectsScope): T[] {
  return scope === 'mine' ? projects.filter(p => p.isJoined) : projects
}
