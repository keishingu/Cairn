import type { SQL, SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export function workspaceMemberDisplayName(displayNameOverride: SQLWrapper, profileDisplayName: SQLWrapper) {
  return sql<string>`coalesce(${displayNameOverride}, ${profileDisplayName})`
}

type DbWithExecute = {
  execute?: (query: SQL) => PromiseLike<ArrayLike<{ exists?: boolean }>>
}

let hasDisplayNameColumnPromise: Promise<boolean> | null = null

export async function hasWorkspaceMemberDisplayNameColumn(db: DbWithExecute) {
  if (typeof db.execute !== 'function') {
    return true
  }

  if (!hasDisplayNameColumnPromise) {
    hasDisplayNameColumnPromise = Promise.resolve(
      db.execute(sql`
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'workspace_members'
            and column_name = 'display_name'
        ) as "exists"
      `),
    )
      .then(rows => rows[0]?.exists === true)
      .catch((error) => {
        hasDisplayNameColumnPromise = null
        throw error
      })
  }

  return hasDisplayNameColumnPromise
}
