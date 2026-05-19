// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type ProjectStatus = {
  id: string
  workspaceId: string
  name: string
  color: string
  sortOrder: number
  isFinal: boolean
}

export type Project = {
  id: string
  workspaceId: string
  title: string
  description: string | null
  statusId: string | null
  startDate: string | null
  endDate: string | null
  archived: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
