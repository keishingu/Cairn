import { fetchApiJson } from './fetch-api-json'

export const workspaceListQueryKey = ['workspace-list'] as const

export interface WorkspaceMembership {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export function fetchWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
  return fetchApiJson('/api/workspaces/list', 'ワークスペース一覧')
}
