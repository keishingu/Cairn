// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_BOT_NAME_SUFFIX = 'Bot'

export async function ensureWorkspaceBotProfile(workspaceId: string): Promise<{
  id: string
  displayName: string
}> {
  const { db } = await import('@cairn/db')
  const { profiles, workspaceMembers, workspaces } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const { randomUUID } = await import('crypto')

  const existing = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(profiles.kind, 'bot'),
      ),
    )
    .limit(1)

  const bot = existing[0]
  if (bot) return bot

  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  const displayName = workspace ? `${workspace.name} ${DEFAULT_BOT_NAME_SUFFIX}` : 'Cairn Bot'
  const botId = randomUUID()

  await db.insert(profiles).values({
    id: botId,
    kind: 'bot',
    displayName,
  })

  await db.insert(workspaceMembers).values({
    workspaceId,
    userId: botId,
    role: 'member',
  })

  return { id: botId, displayName }
}
