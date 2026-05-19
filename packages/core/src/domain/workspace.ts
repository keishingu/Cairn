// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type Workspace = {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
