// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { TaskPriority, TaskStatus } from '@cairn/shared'

export type Task = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  dueDate: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
