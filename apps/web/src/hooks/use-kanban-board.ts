import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import { useProjects, projectQueryKeys } from './use-projects'
import { useProjectStatuses } from './use-project-statuses'

interface UseKanbanBoardOptions {
  statusFilter?: string[] | undefined
  projectFilter?: ((project: ProjectDto) => boolean) | undefined
}

export function useKanbanBoard({ statusFilter, projectFilter }: UseKanbanBoardOptions) {
  const queryClient = useQueryClient()
  const { data: statuses = [], isLoading: statusesLoading } = useProjectStatuses()
  const { data: allProjects = [], isLoading: projectsLoading } = useProjects()

  const activeProjects = allProjects.filter(project => !project.archived)
  const projects = projectFilter ? activeProjects.filter(projectFilter) : activeProjects
  const visibleStatuses = statusFilter?.length
    ? statuses.filter(status => statusFilter.includes(status.name))
    : statuses

  const updateStatus = useMutation({
    mutationFn: async ({ id, statusName }: { id: string; statusName: string }) => {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusName }),
      })
      if (!res.ok) throw new Error('Failed to update status')
    },
    onMutate: async ({ id, statusName }) => {
      await queryClient.cancelQueries({ queryKey: projectQueryKeys.all })
      const prev = queryClient.getQueryData<ProjectDto[]>(projectQueryKeys.all)
      const targetStatus = statuses.find(status => status.name === statusName)
      queryClient.setQueryData<ProjectDto[]>(
        projectQueryKeys.all,
        old => old?.map(project => (
          project.id === id
            ? { ...project, statusName, statusColor: targetStatus?.color ?? project.statusColor }
            : project
        )) ?? [],
      )
      return { prev }
    },
    onError: (_error, _variables, context) => {
      if (context?.prev) {
        queryClient.setQueryData(projectQueryKeys.all, context.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
    },
  })

  return {
    statuses: visibleStatuses,
    projects,
    isLoading: statusesLoading || projectsLoading,
    updateStatus,
  }
}
