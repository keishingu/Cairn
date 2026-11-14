// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect } from 'react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isPostHogConfigured, posthog } from '@/lib/posthog'

export function PostHogUserIdentity() {
  const { data: user } = useCurrentUser()

  useEffect(() => {
    if (!isPostHogConfigured || !user) return

    posthog.identify(user.id, {
      email: user.email,
      name: user.displayName,
      workspace_role: user.wsRole,
    })
  }, [user])

  return null
}
