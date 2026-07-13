// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_BOT_NAME_SUFFIX = 'Bot'

export async function ensureWorkspaceBotProfile(workspaceId: string): Promise<{
  id: string
  displayName: string
}> {
  const { db } = await import('@cairn/db')
  const { profiles, workspaceMembers, workspaces } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')
  const { randomUUID } = await import('crypto')

  const selectExisting = (executor: Pick<typeof db, 'select'>) =>
    executor
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

  const existing = await selectExisting(db)

  const bot = existing[0]
  if (bot) return bot

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select 1
      from workspaces
      where id = ${workspaceId}
      for update
    `)

    const lockedExisting = await selectExisting(tx)
    const lockedBot = lockedExisting[0]
    if (lockedBot) return lockedBot

    const [workspace] = await tx
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    const displayName = workspace ? `${workspace.name} ${DEFAULT_BOT_NAME_SUFFIX}` : 'Cairn Bot'
    const botId = randomUUID()

    await tx.insert(profiles).values({
      id: botId,
      kind: 'bot',
      displayName,
    })

    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId: botId,
      role: 'member',
      membershipStatus: 'inactive',
      status: 'offline',
    })

    return { id: botId, displayName }
  })
}
