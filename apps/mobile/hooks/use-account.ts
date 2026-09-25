import { useQuery } from '@tanstack/react-query'
import type { AccentId, AppearanceTheme, CalendarWeekStart, LocalePreference } from '@cairn/shared'
import { fetchApiJson } from '../lib/fetch-api-json'
import { useT } from '../components/locale-provider'
import {
  fetchWorkspaceMemberships,
  workspaceListQueryKey,
  type WorkspaceMembership,
} from '../lib/workspace-queries'

export interface MeDto {
  id: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  theme: AppearanceTheme
  accentId: AccentId
  locale: LocalePreference
  calendarWeekStart: CalendarWeekStart
  wsRole: 'owner' | 'admin' | 'member' | 'guest'
}

export interface WorkspaceDto {
  id: string
  name: string
  logoUrl: string | null
}

export type WorkspaceListItemDto = WorkspaceMembership

export function useMe(enabled = true) {
  const t = useT()
  return useQuery({
    queryKey: ['me'],
    queryFn: () => fetchApiJson<MeDto>('/api/me', t('Could not load account info ({status})')),
    staleTime: 60_000,
    enabled,
  })
}

export function useWorkspace() {
  const t = useT()
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchApiJson<WorkspaceDto>('/api/workspaces', t('Could not load workspace info ({status})')),
    staleTime: 60_000,
  })
}

export function useWorkspaceList(enabled = true) {
  const t = useT()
  return useQuery({
    queryKey: workspaceListQueryKey,
    queryFn: () => fetchWorkspaceMemberships(t),
    staleTime: 60_000,
    enabled,
  })
}
