// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import {
  deleteStorageObjects,
  indexFileChunks,
  indexProjectChunks,
  indexMemberChunks,
  indexExternalLink,
  onMessageCreated,
  onTaskAssigned,
} from '@/lib/inngest/functions'

// デプロイ環境ごとに URL が変わる場合（Vercel preview など）に対応。
// VERCEL_URL は Vercel が自動セット。それ以外は APP_URL を環境変数で指定する。
function resolveServeHost(): string | undefined {
  if (process.env['VERCEL_URL']) return `https://${process.env['VERCEL_URL']}`
  if (process.env['APP_URL']) return process.env['APP_URL']
  return undefined
}

const fns = [
  deleteStorageObjects,
  indexFileChunks,
  indexProjectChunks,
  indexMemberChunks,
  indexExternalLink,
  onMessageCreated,
  onTaskAssigned,
]
const host = resolveServeHost()

export const { GET, POST, PUT } = host
  ? serve({ client: inngest, functions: fns, serveHost: host })
  : serve({ client: inngest, functions: fns })
