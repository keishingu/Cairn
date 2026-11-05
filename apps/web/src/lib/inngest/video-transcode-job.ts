// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { CHAT_VIDEOS_BUCKET } from '@/lib/attachments'
import { createServiceRoleClient } from '@/lib/supabase/service'
import {
  checkVideoTranscode,
  startVideoTranscode,
  stopVideoTranscode,
  VIDEO_TRANSCODE_TIMEOUT_MS,
  type TranscodeProgress,
} from '@/lib/video/sandbox-runner'
import {
  derivedVideoStoragePath,
  readVideoTranscodeStatus,
  VIDEO_TRANSCODE_STATUS_KEY,
  type VideoTranscodeStatus,
} from '@/lib/video/transcode'

export const VIDEO_TRANSCODE_REQUESTED_EVENT = 'file/video-transcode-requested'

const CHECK_INTERVAL = '30s'
const CHECK_INTERVAL_MS = 30_000
const MAX_CHECKS = Math.ceil(VIDEO_TRANSCODE_TIMEOUT_MS / CHECK_INTERVAL_MS)
/** Sandbox が原本を読む署名 URL の期限。変換の上限より長くする */
const SOURCE_URL_TTL_SECONDS = 2 * 60 * 60

type TranscodeEventData = { fileId: string; workspaceId: string }

async function setTranscodeStatus(fileId: string, status: VideoTranscodeStatus) {
  const { db, files } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  await db
    .update(files)
    .set({
      metadata: sql`jsonb_set(coalesce(${files.metadata}, '{}'::jsonb), ${`{${VIDEO_TRANSCODE_STATUS_KEY}}`}::text[], to_jsonb(${status}::text), true)`,
    })
    .where(eq(files.id, fileId))
}

async function readObjectSize(storagePath: string): Promise<number> {
  const slash = storagePath.lastIndexOf('/')
  const { data, error } = await createServiceRoleClient()
    .storage.from(CHAT_VIDEOS_BUCKET)
    .list(storagePath.slice(0, slash), { search: storagePath.slice(slash + 1) })
  if (error) throw new Error(`Storage list failed: ${error.message}`)
  const size = data?.find((item) => item.name === storagePath.slice(slash + 1))?.metadata?.['size']
  if (typeof size !== 'number') throw new Error('Transcoded video was not uploaded')
  return size
}

// 動画添付の再生用の圧縮版（長辺 1280px・H.264 MP4）を Vercel Sandbox の ffmpeg で作る。
// 変換中・失敗の間は配信ルートが原本を返すため、ここが失敗しても動画は見られる。
export const transcodeUploadedVideo = inngest.createFunction(
  {
    id: 'transcode-uploaded-video',
    concurrency: { limit: 1, key: 'event.data.fileId' },
    retries: 1,
    onFailure: async ({ event, error }) => {
      const { fileId } = (event.data.event.data ?? {}) as Partial<TranscodeEventData>
      console.error('[transcode-uploaded-video] failed:', fileId, error)
      if (!fileId) return
      const { db, files } = await import('@cairn/db')
      const { eq } = await import('drizzle-orm')
      const [file] = await db
        .select({ id: files.id, metadata: files.metadata })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1)
      // 圧縮版を保存し終えた後の失敗（Sandbox の停止など）では ready を上書きしない
      if (file && readVideoTranscodeStatus(file.metadata) !== 'ready') {
        await setTranscodeStatus(fileId, 'failed')
      }
    },
  },
  { event: VIDEO_TRANSCODE_REQUESTED_EVENT },
  async ({ event, step }) => {
    const { fileId, workspaceId } = event.data as TranscodeEventData

    const started = await step.run('start-transcode', async () => {
      const { db, files } = await import('@cairn/db')
      const { and, eq } = await import('drizzle-orm')
      const [file] = await db
        .select({ storagePath: files.storagePath, metadata: files.metadata })
        .from(files)
        .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId), eq(files.fileType, 'video')))
        .limit(1)
      if (!file?.storagePath) return null
      if (readVideoTranscodeStatus(file.metadata) === 'ready') return null

      const derivedPath = derivedVideoStoragePath(file.storagePath, fileId)
      const supabase = createServiceRoleClient()
      const [source, upload] = await Promise.all([
        supabase.storage.from(CHAT_VIDEOS_BUCKET).createSignedUrl(file.storagePath, SOURCE_URL_TTL_SECONDS),
        supabase.storage.from(CHAT_VIDEOS_BUCKET).createSignedUploadUrl(derivedPath, { upsert: true }),
      ])
      if (source.error || !source.data) throw new Error(`Source signed URL failed: ${source.error?.message}`)
      if (upload.error || !upload.data) throw new Error(`Upload signed URL failed: ${upload.error?.message}`)

      await setTranscodeStatus(fileId, 'processing')
      const transcode = await startVideoTranscode({
        sandboxName: `video-${fileId}-${Date.now()}`,
        sourceUrl: source.data.signedUrl,
        uploadUrl: upload.data.signedUrl,
      })
      return { ...transcode, derivedPath }
    })
    if (!started) return { skipped: true }

    let progress: TranscodeProgress = { done: false }
    for (let i = 0; i < MAX_CHECKS && !progress.done; i++) {
      await step.sleep(`wait-${i}`, CHECK_INTERVAL)
      progress = await step.run(`check-${i}`, () => checkVideoTranscode(started))
    }

    await step.run('stop-sandbox', async () => {
      // 使い捨てのため止められなくても期限で消える。止める失敗で変換結果を捨てない
      await stopVideoTranscode(started.sandboxName).catch((error: unknown) => {
        console.warn('[transcode-uploaded-video] sandbox stop failed:', error)
      })
    })

    if (!progress.done) throw new NonRetriableError('Video transcode timed out')
    if (progress.exitCode !== 0) {
      throw new NonRetriableError(`Video transcode exited with ${progress.exitCode}: ${progress.stderrTail}`)
    }

    return step.run('save-derived', async () => {
      const size = await readObjectSize(started.derivedPath)
      const { db, files } = await import('@cairn/db')
      const { eq } = await import('drizzle-orm')
      const saved = await db.transaction(async (tx) => {
        const [latest] = await tx
          .select({ derivedFileSize: files.derivedFileSize, metadata: files.metadata })
          .from(files)
          .where(eq(files.id, fileId))
          .for('update')
          .limit(1)
        if (!latest) return false
        const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
        // 圧縮版は家賃の対象外（derived）。再変換では差分だけ加える
        await recordStorageUsageDelta(
          workspaceId,
          { originalBytes: 0, derivedBytes: size - (latest.derivedFileSize ?? 0) },
          tx,
        )
        await tx
          .update(files)
          .set({
            derivedStoragePath: started.derivedPath,
            derivedFileSize: size,
            derivedMimeType: 'video/mp4',
            metadata: {
              ...((latest.metadata ?? {}) as Record<string, unknown>),
              [VIDEO_TRANSCODE_STATUS_KEY]: 'ready',
            },
          })
          .where(eq(files.id, fileId))
        return true
      })
      if (!saved) {
        // 変換中にファイルが消された。圧縮版だけが残らないよう消す
        const { error } = await createServiceRoleClient()
          .storage.from(CHAT_VIDEOS_BUCKET)
          .remove([started.derivedPath])
        if (error) throw new Error(`Failed to remove orphaned derived video: ${error.message}`)
        return { skipped: true, reason: 'file deleted during transcode' }
      }
      return { transcoded: true, derivedSize: size }
    })
  },
)
