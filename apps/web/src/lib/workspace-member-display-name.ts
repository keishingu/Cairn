import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export function workspaceMemberDisplayName(displayNameOverride: SQLWrapper, profileDisplayName: SQLWrapper) {
  return sql<string>`coalesce(${displayNameOverride}, ${profileDisplayName})`
}
