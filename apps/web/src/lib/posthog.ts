// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import posthog from 'posthog-js'
import { FEATURE_FLAGS } from '@cairn/shared'

const projectToken = process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN']

export const isPostHogConfigured = FEATURE_FLAGS.posthog && Boolean(projectToken)

if (typeof window !== 'undefined' && isPostHogConfigured && projectToken && !posthog.__loaded) {
  posthog.init(projectToken, {
    api_host: process.env['NEXT_PUBLIC_POSTHOG_HOST'] || 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    capture_pageview: 'history_change',
  })
}

export { posthog }
