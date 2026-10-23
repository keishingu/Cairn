// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const PROFILE_ATTRIBUTE_COLOR_IDS = [
  'slate',
  'blue',
  'emerald',
  'amber',
  'violet',
  'rose',
] as const

export type ProfileAttributeColor = (typeof PROFILE_ATTRIBUTE_COLOR_IDS)[number]

export interface ProfileAttributeDto {
  id: string
  name: string
  color: ProfileAttributeColor
}
