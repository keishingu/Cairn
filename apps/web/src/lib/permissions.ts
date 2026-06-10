// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { db, workspaceMembers, projectMembers } from '@cairn/db'
import { eq, and } from 'drizzle-orm'

async function getWorkspaceRole(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return member?.role ?? null
}

export function isWorkspaceAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export async function getWorkspaceMemberRole(workspaceId: string, userId: string) {
  return getWorkspaceRole(workspaceId, userId)
}

// workspace の admin または owner のみ許可。それ以外は 403 を返す
export async function requireWorkspaceAdmin(
  workspaceId: string,
  userId: string,
): Promise<NextResponse | null> {
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!isWorkspaceAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

async function getProjectRole(projectId: string, userId: string) {
  const [member] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1)
  return member?.role ?? null
}

// project の leader/subleader または workspace admin+ のみ許可
export async function requireProjectManager(
  projectId: string,
  userId: string,
  workspaceId: string,
): Promise<NextResponse | null> {
  const [wsRole, projRole] = await Promise.all([
    getWorkspaceRole(workspaceId, userId),
    getProjectRole(projectId, userId),
  ])
  if (isWorkspaceAdmin(wsRole)) return null
  if (projRole === 'leader' || projRole === 'subleader') return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// project の leader または workspace admin+ のみ削除を許可
export async function requireProjectLeader(
  projectId: string,
  userId: string,
  workspaceId: string,
): Promise<NextResponse | null> {
  const [wsRole, projRole] = await Promise.all([
    getWorkspaceRole(workspaceId, userId),
    getProjectRole(projectId, userId),
  ])
  if (isWorkspaceAdmin(wsRole)) return null
  if (projRole === 'leader') return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
