// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** メニューを開いたときの世代を送る。最新値で取り直すと操作対象が変わってしまう。 */
export async function patchMilestoneCompletion(
  input: { projectId: string; milestoneId: string; completed: boolean; expectedUpdatedAt: string },
  fetcher: (path: string, init: RequestInit) => Promise<Response>,
  fallback: string,
): Promise<void> {
  if (!input.expectedUpdatedAt) throw new Error('milestone_conflict')
  const response = await fetcher(`/api/projects/${input.projectId}/milestones/${input.milestoneId}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed: input.completed, expectedUpdatedAt: input.expectedUpdatedAt }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : fallback)
  }
}
