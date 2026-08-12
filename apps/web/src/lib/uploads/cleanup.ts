// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { db, uploadRequests } from '@cairn/db'
import { GALLERY_BUCKET, GALLERY_ORIGINALS_BUCKET } from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'

const CLEANUP_BATCH_SIZE = 100

export interface ExpiredUploadCleanupResult {
  removed: number
  failed: number
}

/**
 * 署名URLだけが発行され、確定されなかったオブジェクトを削除する。
 * ストレージ削除に失敗した行は残して次回に再試行する。
 */
export async function cleanupExpiredUploadRequests(
  now = new Date(),
): Promise<ExpiredUploadCleanupResult> {
  const expired = await db
    .select({
      id: uploadRequests.id,
      derivedStoragePath: uploadRequests.derivedStoragePath,
      storageBucket: sql<string>`coalesce(to_jsonb(${uploadRequests})->>'storage_bucket', 'gallery')`,
      originalStoragePath: uploadRequests.originalStoragePath,
    })
    .from(uploadRequests)
    .where(and(isNull(uploadRequests.finalizedAt), lte(uploadRequests.expiresAt, now)))
    .limit(CLEANUP_BATCH_SIZE)

  const supabase = createServiceRoleClient()
  let removed = 0
  let failed = 0

  for (const request of expired) {
    const [{ error: derivedError }, originalResult] = await Promise.all([
      supabase.storage.from(request.storageBucket).remove([request.derivedStoragePath]),
      request.originalStoragePath
        ? supabase.storage.from(GALLERY_ORIGINALS_BUCKET).remove([request.originalStoragePath])
        : Promise.resolve({ error: null }),
    ])

    if (derivedError || originalResult.error) {
      failed += 1
      console.error('[uploads] Failed to remove expired upload objects:', {
        uploadRequestId: request.id,
        derivedError,
        originalError: originalResult.error,
      })
      continue
    }

    await db
      .delete(uploadRequests)
      .where(and(eq(uploadRequests.id, request.id), isNull(uploadRequests.finalizedAt)))
    removed += 1
  }

  return { removed, failed }
}
