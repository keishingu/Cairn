import type { QueryClient } from '@tanstack/react-query'
import { setSelectedWorkspaceId } from './workspace-selection'

export interface ActiveWorkspace {
  id: string
  name: string
  logoUrl: string | null
}

export async function activateWorkspace(
  client: Pick<QueryClient, 'setQueryData' | 'resetQueries'>,
  userId: string,
  workspace: ActiveWorkspace,
  options?: { beforeReset?: () => void },
): Promise<void> {
  await setSelectedWorkspaceId(userId, workspace.id)
  client.setQueryData(['workspace'], workspace)
  options?.beforeReset?.()
  await client.resetQueries({
    predicate: (query) => query.queryKey[0] !== 'workspace',
  })
}
