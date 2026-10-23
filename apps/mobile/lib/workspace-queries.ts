import { translate } from '@cairn/shared'
import { fetchApiJson } from './fetch-api-json'

type Translate = (message: string, values?: Record<string, string | number>) => string

const translateJa: Translate = (message, values) => translate('ja', message, values)

export const workspaceListQueryKey = ['workspace-list'] as const

export interface WorkspaceMembership {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export function fetchWorkspaceMemberships(t: Translate = translateJa): Promise<WorkspaceMembership[]> {
  return fetchApiJson('/api/workspaces/list', t('Could not load the workspace list ({status})'))
}
