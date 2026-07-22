// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactionDto } from '@/app/api/channels/[channelId]/messages/route'

export function getReactionTooltip(reaction: Pick<ReactionDto, 'userNames'>): string | undefined {
  const users = reaction.userNames.filter(Boolean)
  return users.length > 0 ? users.join(', ') : undefined
}
