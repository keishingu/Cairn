// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type UserStatus = 'online' | 'away' | 'busy' | 'offline'

export const USER_STATUSES: UserStatus[] = ['online', 'away', 'busy', 'offline']

const USER_STATUS_META: Record<UserStatus, { label: string; color: string }> = {
  online: { label: 'オンライン', color: '#22C55E' },
  away: { label: '退席中', color: '#F59E0B' },
  busy: { label: '取り込み中', color: '#EF4444' },
  offline: { label: 'オフライン', color: '#9CA3AF' },
}

export function getUserStatusLabel(status: UserStatus | null | undefined): string {
  return USER_STATUS_META[status ?? 'online']?.label ?? USER_STATUS_META.online.label
}

export function getUserStatusColor(status: UserStatus | null | undefined): string {
  return USER_STATUS_META[status ?? 'online']?.color ?? USER_STATUS_META.online.color
}
