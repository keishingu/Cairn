// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, activeWorkspaceMembers } from '@cairn/db'
import { eq } from 'drizzle-orm'
import { getCachedForRequest } from './request-cache'

export interface WorkspaceMembership {
  workspaceId: string
  role: string
}

export async function listWorkspaceMemberships(userId: string): Promise<WorkspaceMembership[]> {
  return getCachedForRequest(`workspace-memberships:${userId}`, async () => {
    return db
      .select({
        workspaceId: activeWorkspaceMembers.workspaceId,
        role: activeWorkspaceMembers.role,
      })
      .from(activeWorkspaceMembers)
      .where(eq(activeWorkspaceMembers.userId, userId))
  })
}

export async function getWorkspaceMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
  const memberships = await listWorkspaceMemberships(userId)
  return memberships.find((membership) => membership.workspaceId === workspaceId) ?? null
}
