// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

export function filterActiveWorkspaceMembers<T extends WorkspaceMemberDto>(members: T[]): T[] {
  return members.filter((member) => member.membershipStatus === 'active')
}
