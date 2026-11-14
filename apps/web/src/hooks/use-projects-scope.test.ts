import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectsScope, filterProjectsByScope, migrateLegacyJoinedTab } from './use-projects-scope'

describe('useProjectsScope', () => {
  beforeEach(() => localStorage.clear())

  it('保存値が無ければ全体で開く', () => {
    const { result } = renderHook(() => useProjectsScope())
    expect(result.current[0]).toBe('all')
  })

  it('切り替えを保存し、次に開いたときに復元する', () => {
    const first = renderHook(() => useProjectsScope())
    act(() => first.result.current[1]('mine'))
    expect(localStorage.getItem('cairn:projects_scope')).toBe('mine')
    const second = renderHook(() => useProjectsScope())
    expect(second.result.current[0]).toBe('mine')
  })

  it('保存値が不正なら全体で開く', () => {
    localStorage.setItem('cairn:projects_scope', 'bogus')
    const { result } = renderHook(() => useProjectsScope())
    expect(result.current[0]).toBe('all')
  })

  it.each(['joined', 'mine'])('旧「%s」タブの保存値はすべて+参加中へ移行する', legacy => {
    localStorage.setItem('cairn:projects_filter', legacy)
    const { result } = renderHook(() => useProjectsScope())
    expect(result.current[0]).toBe('mine')
    expect(localStorage.getItem('cairn:projects_filter')).toBe('all')
  })

  it('範囲が保存済みなら旧タブの移行で範囲を上書きしない', () => {
    localStorage.setItem('cairn:projects_filter', 'joined')
    localStorage.setItem('cairn:projects_scope', 'all')
    migrateLegacyJoinedTab()
    expect(localStorage.getItem('cairn:projects_scope')).toBe('all')
    expect(localStorage.getItem('cairn:projects_filter')).toBe('all')
  })

  it('他のタブの保存値は移行しない', () => {
    localStorage.setItem('cairn:projects_filter', 'hosting')
    migrateLegacyJoinedTab()
    expect(localStorage.getItem('cairn:projects_filter')).toBe('hosting')
    expect(localStorage.getItem('cairn:projects_scope')).toBeNull()
  })
})

describe('filterProjectsByScope', () => {
  const projects = [{ id: 'a', isJoined: true }, { id: 'b', isJoined: false }]

  it('参加中は自分がメンバーのプロジェクトだけに絞る', () => {
    expect(filterProjectsByScope(projects, 'mine').map(p => p.id)).toEqual(['a'])
  })

  it('全体は絞り込まない', () => {
    expect(filterProjectsByScope(projects, 'all')).toHaveLength(2)
  })
})
