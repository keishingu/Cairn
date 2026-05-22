// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from './client'
import { createServiceRoleClient } from '@/lib/supabase/service'

const BATCH_SIZE = 100

export const deleteStorageObjects = inngest.createFunction(
  { id: 'delete-storage-objects' },
  { event: 'storage/objects.delete' },
  async ({ event, step }) => {
    const { bucket, paths } = event.data as { bucket: string; paths: string[] }

    if (paths.length === 0) return { deleted: 0 }

    let deleted = 0
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE)
      await step.run(`delete-batch-${i}`, async () => {
        const supabase = createServiceRoleClient()
        const { data, error } = await supabase.storage.from(bucket).remove(batch)
        if (error) throw error
        deleted += data?.length ?? 0
      })
    }

    return { deleted }
  },
)
