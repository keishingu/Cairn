import { useQuery } from '@tanstack/react-query'
import type { ProjectRoleDto } from '@/app/api/projects/roles/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export function useProjectRoles() {
  return useQuery<ProjectRoleDto[]>({
    queryKey: ['project-roles'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/projects/roles')
      if (!res.ok) throw new Error('役割の取得に失敗しました')
      return res.json() as Promise<ProjectRoleDto[]>
    },
  })
}
