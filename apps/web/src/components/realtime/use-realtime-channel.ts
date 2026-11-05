// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import type { ActiveChannelRegistry } from '@cairn/shared'

export const ActiveChannelContext = React.createContext<ActiveChannelRegistry | null>(null)

/**
 * チャンネルのメッセージを表示している間だけ channel:{id} を購読する（RealtimeProvider が join する）。
 * 常時購読は user:{me} だけで、画面外のチャンネルの新着・削除・移動・タスクは user トピックで届く（#173）。
 * RealtimeProvider の外では何もしない
 */
export function useRealtimeChannel(channelId: string | null) {
  const registry = React.useContext(ActiveChannelContext)
  React.useEffect(() => {
    if (!registry || !channelId) return
    return registry.acquire(channelId)
  }, [registry, channelId])
}
