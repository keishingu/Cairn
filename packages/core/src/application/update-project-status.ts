// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project } from '../domain/index.js'
import type { ProjectRepository } from '../ports/index.js'

export class UpdateProjectStatusUseCase {
  constructor(private readonly projectRepo: ProjectRepository) {}

  async execute(params: { projectId: string; statusId: string }): Promise<Project> {
    return this.projectRepo.updateStatus(params.projectId, params.statusId)
  }
}
