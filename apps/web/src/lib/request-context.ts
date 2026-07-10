// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'

type CachedWorkspaceRole = 'owner' | 'admin' | 'member' | 'guest' | null

const workspaceRoleCache = new WeakMap<object, Map<string, CachedWorkspaceRole>>()

function workspaceRoleKey(workspaceId: string, userId: string) {
  return `${workspaceId}:${userId}`
}

async function getRequestWorkspaceRoleCache(): Promise<Map<string, CachedWorkspaceRole> | null> {
  try {
    const requestHeaders = await headers()
    let cache = workspaceRoleCache.get(requestHeaders)
    if (!cache) {
      cache = new Map()
      workspaceRoleCache.set(requestHeaders, cache)
    }
    return cache
  } catch {
    return null
  }
}

export async function getCachedWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<CachedWorkspaceRole | undefined> {
  const cache = await getRequestWorkspaceRoleCache()
  return cache?.get(workspaceRoleKey(workspaceId, userId))
}

export async function setCachedWorkspaceRole(
  workspaceId: string,
  userId: string,
  role: CachedWorkspaceRole,
): Promise<void> {
  const cache = await getRequestWorkspaceRoleCache()
  cache?.set(workspaceRoleKey(workspaceId, userId), role)
}
