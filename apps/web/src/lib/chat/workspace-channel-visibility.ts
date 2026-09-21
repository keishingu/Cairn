// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceRole } from '@cairn/shared'

export function visibleWorkspaceChannels<T extends { id: string; isPrivate: boolean }>(
  channels: T[],
  joinedIds: Set<string>,
  role: WorkspaceRole,
): T[] {
  if (role === 'guest') {
    return channels.filter(channel => joinedIds.has(channel.id))
  }
  return channels.filter(channel => !channel.isPrivate || joinedIds.has(channel.id))
}
