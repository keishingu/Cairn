// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { AiScope } from '@cairn/shared'

export type AiAgent = {
  id: string
  workspaceId: string | null
  projectId: string | null
  scope: AiScope
  name: string
  description: string | null
  model: string
  systemPrompt: string | null
  agentsMd: string | null
  htmlTemplate: string | null
  isActive: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
