// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScheduledJobDto } from '@/app/api/scheduled-jobs/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const QUERY_KEY = ['scheduledJobs']

async function fetchScheduledJobs(): Promise<ScheduledJobDto[]> {
  const res = await fetchWithAuth('/api/scheduled-jobs')
  if (!res.ok) throw new Error('Failed to fetch scheduled jobs')
  return res.json()
}

async function createScheduledJob(payload: { rawInstruction: string, enabled?: boolean }) {
  const res = await fetchWithAuth('/api/scheduled-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? 'Failed to create scheduled job')
  }
  return res.json() as Promise<ScheduledJobDto[]>
}

async function updateScheduledJob(payload: { id: string, rawInstruction?: string, enabled?: boolean }) {
  const res = await fetchWithAuth('/api/scheduled-jobs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? 'Failed to update scheduled job')
  }
  return res.json() as Promise<ScheduledJobDto[]>
}

async function deleteScheduledJob(id: string) {
  const res = await fetchWithAuth('/api/scheduled-jobs', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Failed to delete scheduled job')
  return res.json() as Promise<ScheduledJobDto[]>
}

export function useScheduledJobs() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchScheduledJobs,
  })
}

export function useCreateScheduledJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createScheduledJob,
    onSuccess: (jobs) => {
      queryClient.setQueryData(QUERY_KEY, jobs)
    },
  })
}

export function useUpdateScheduledJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateScheduledJob,
    onSuccess: (jobs) => {
      queryClient.setQueryData(QUERY_KEY, jobs)
    },
  })
}

export function useDeleteScheduledJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteScheduledJob,
    onSuccess: (jobs) => {
      queryClient.setQueryData(QUERY_KEY, jobs)
    },
  })
}
