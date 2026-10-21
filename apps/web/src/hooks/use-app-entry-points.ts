// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppEntryPointDto } from '@/app/api/channels/[channelId]/app-entry-points/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

/** 起動の失敗。文言は表示側が表示言語で出す（追加は状態コード、起動はエラーコードから） */
export type AppEntryFailure = { step: 'add'; status: number } | { step: 'command'; code: string | null }

async function readError(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : null
}

/** チャンネルで起動できるアプリと、その起動（Bot が未参加なら先に追加する）。docs/app-platform-design.md §6.1 */
export function useAppEntryPoints(channelId: string) {
  const queryClient = useQueryClient()
  const queryKey = React.useMemo(() => ['app-entry-points', channelId] as const, [channelId])
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<AppEntryPointDto[]> => {
      const res = await fetchWithAuth(`/api/channels/${channelId}/app-entry-points`)
      if (!res.ok) throw new Error(`app-entry-points ${res.status}`)
      return res.json()
    },
  })
  const [busy, setBusy] = React.useState(false)

  const invoke = React.useCallback(
    async (app: AppEntryPointDto, command: string): Promise<AppEntryFailure | null> => {
      setBusy(true)
      try {
        if (!app.inChannel) {
          const added = await fetchWithAuth(`/api/channels/${channelId}/apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installationId: app.installationId }),
          })
          if (!added.ok) return { step: 'add', status: added.status }
          await queryClient.invalidateQueries({ queryKey })
        }
        const res = await fetchWithAuth('/api/app-commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId: app.installationId, channelId, command }),
        })
        return res.ok ? null : { step: 'command', code: await readError(res) }
      } catch {
        return { step: 'command', code: null }
      } finally {
        setBusy(false)
      }
    },
    [channelId, queryClient, queryKey],
  )

  return { query, invoke, busy }
}
