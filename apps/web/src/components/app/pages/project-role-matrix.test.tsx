import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectRoleDto } from '@/app/api/projects/roles/route'
import { ProjectRoleMatrix } from './project-role-matrix'

const role: ProjectRoleDto = { id: 'guide', name: 'ガイド', color: '#2563eb', sortOrder: 1, isDefault: false }
function project(id: string, title: string, startDate: string | null, endDate: string | null, roleAssignments: NonNullable<ProjectDto['roleAssignments']>): ProjectDto {
  return {
    id, title, description: null, statusName: null, statusColor: null, startDate, endDate,
    memberCount: 0, memberNames: [], memberAvatarUrls: [], taskCount: 0, completedTaskCount: 0,
    isHosting: false, isJoined: false, archived: false, coverPhotoIdx: 0, coverPhotoUrl: null,
    location: null, placeId: null, roleAssignments,
  }
}
const assignedProject = project('p1', '北アルプス山行', '2026-10-20', '2026-10-22', [
  { roleId: role.id, roleName: role.name, roleColor: role.color, roleSortOrder: 1, memberNames: ['佐藤', '鈴木'], memberAvatarUrls: [null, null] },
])
const unassignedProject = project('p2', '八ヶ岳山行', null, null, [])

describe('プロジェクト担当表', () => {
  it.each([false, true])('日程・複数担当者・未割り当てを表示し、メンバー編集へ進める（モバイル: %s）', isMobile => {
    const onOpenMembers = vi.fn()
    render(<ProjectRoleMatrix projects={[assignedProject, unassignedProject]} roles={[role]} isMobile={isMobile} onOpenMembers={onOpenMembers}/>)

    expect(screen.getByText('2026/10/20–2026/10/22')).toBeVisible()
    expect(screen.getByText('佐藤, 鈴木')).toBeVisible()
    expect(screen.getAllByText('未割り当て').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /八ヶ岳山行.*未割り当て/ }))
    expect(onOpenMembers).toHaveBeenCalledWith(unassignedProject)
  })

  it('役割を選ぶとその役割が未設定のプロジェクトだけに絞る', () => {
    render(<ProjectRoleMatrix projects={[assignedProject, unassignedProject]} roles={[role]} onOpenMembers={vi.fn()}/>)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: role.id } })
    expect(screen.getByText('八ヶ岳山行')).toBeVisible()
    expect(screen.queryByText('北アルプス山行')).toBeNull()
  })

  it('担当者データの欠損を未割り当てとして表示しない', () => {
    const incompleteProject = { ...unassignedProject, roleAssignments: undefined } as unknown as ProjectDto
    render(<ProjectRoleMatrix projects={[incompleteProject]} roles={[role]} onOpenMembers={vi.fn()}/>)

    expect(screen.getByRole('alert')).toHaveTextContent('プロジェクトの担当者を取得できませんでした')
    expect(screen.queryByText('未割り当て')).toBeNull()
  })
})
