// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project, ProjectStatus } from '../domain/index.js'
import type { CreateProjectInput } from '@cairn/shared'

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>
  findByWorkspaceId(workspaceId: string): Promise<Project[]>
  create(input: CreateProjectInput & { createdBy: string }): Promise<Project>
  updateStatus(projectId: string, statusId: string): Promise<Project>
  archive(projectId: string): Promise<void>
  listStatuses(workspaceId: string): Promise<ProjectStatus[]>
}
