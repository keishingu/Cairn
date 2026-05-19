import { describe, expect, it, vi } from 'vitest'
import { CreateProjectUseCase } from './create-project'
import type { ProjectRepository } from '../ports/index'
import type { Project } from '../domain/index'

const mockProject: Project = {
  id: '00000000-0000-0000-0000-000000000001',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: '北アルプス縦走計画',
  description: null,
  statusId: null,
  startDate: null,
  endDate: null,
  archived: false,
  createdBy: '00000000-0000-0000-0000-000000000003',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockRepo: ProjectRepository = {
  findById: vi.fn(),
  findByWorkspaceId: vi.fn(),
  create: vi.fn().mockResolvedValue(mockProject),
  updateStatus: vi.fn(),
  archive: vi.fn(),
  listStatuses: vi.fn(),
}

describe('CreateProjectUseCase', () => {
  it('プロジェクトを作成してリポジトリに委譲する', async () => {
    const useCase = new CreateProjectUseCase(mockRepo)

    const result = await useCase.execute({
      workspaceId: '00000000-0000-0000-0000-000000000002',
      title: '北アルプス縦走計画',
      createdBy: '00000000-0000-0000-0000-000000000003',
    })

    expect(mockRepo.create).toHaveBeenCalledOnce()
    expect(result.title).toBe('北アルプス縦走計画')
  })
})
