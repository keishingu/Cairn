// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AttendanceStatus, ProjectMemberRole } from '@cairn/shared'

export type ProjectMember = {
  id: string
  projectId: string
  userId: string
  role: ProjectMemberRole
  attendance: AttendanceStatus
  notes: string | null
  createdAt: Date
}
