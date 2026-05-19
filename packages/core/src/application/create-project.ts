// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { CreateProjectInput } from '@cairn/shared'
import type { Project } from '../domain/index.js'
import type { ProjectRepository } from '../ports/index.js'

export class CreateProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepository) {}

  async execute(input: CreateProjectInput & { createdBy: string }): Promise<Project> {
    return this.projectRepo.create(input)
  }
}
