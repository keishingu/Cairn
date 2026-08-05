// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { embed } from 'ai'
import { FEATURE_FLAGS } from '@cairn/shared'
import type { WorkspaceRole } from '@/lib/access/membership'
import { openai, EMBEDDING_MODEL } from './client'

export interface ChunkMatch {
  sourceType: string
  sourceId: string
  content: string
  similarity: number
}

export async function searchChunks(
  query: string,
  workspaceId: string,
  opts: {
    userId: string
    role: WorkspaceRole
    limit?: number
    minSimilarity?: number
    allowedProjectIds?: string[] | null
  },
): Promise<ChunkMatch[]> {
  const { limit = 5, minSimilarity = 0.5, allowedProjectIds = null } = opts

  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: query,
  })

  const { db } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')

  const vectorStr = `[${embedding.join(',')}]`

  const projectScope = allowedProjectIds != null
    ? allowedProjectIds.length > 0
      ? (() => {
        const idList = sql.join(allowedProjectIds.map(id => sql`${id}::uuid`), sql`, `)
        return sql`AND (
          (source_type = 'project' AND source_id IN (${idList}))
          OR source_type = 'file'
        )`
      })()
      : sql`AND source_type = 'file'`
    : sql``

  // file chunks must obey the same visibility as the normal file UI. Project files are visible
  // through project access; unscoped files require uploader ownership or an accessible channel.
  // This condition runs before vector LIMIT so inaccessible hits cannot crowd out visible results.
  const channelAccess = opts.role === 'guest'
    ? sql`(
        (source_channel.type = 'project'
          AND EXISTS (
            SELECT 1 FROM project_members source_pm
            WHERE source_pm.project_id = source_channel.project_id
              AND source_pm.user_id = ${opts.userId}::uuid
          )
          AND (
            source_channel.is_private = false
            OR EXISTS (
              SELECT 1 FROM channel_members source_cm
              WHERE source_cm.channel_id = source_channel.id
                AND source_cm.user_id = ${opts.userId}::uuid
            )
          )
        )
        OR (source_channel.type = 'workspace'
          AND EXISTS (
            SELECT 1 FROM channel_members source_cm
            WHERE source_cm.channel_id = source_channel.id
              AND source_cm.user_id = ${opts.userId}::uuid
          )
        )
        OR (source_channel.type = 'dm'
          AND EXISTS (
            SELECT 1 FROM channel_members source_cm
            WHERE source_cm.channel_id = source_channel.id
              AND source_cm.user_id = ${opts.userId}::uuid
          )
        )
      )`
    : sql`(
        (source_channel.type <> 'dm' AND source_channel.is_private = false)
        OR EXISTS (
          SELECT 1 FROM channel_members source_cm
          WHERE source_cm.channel_id = source_channel.id
            AND source_cm.user_id = ${opts.userId}::uuid
        )
      )`

  const fileAccessScope = sql`AND (
    source_type <> 'file'
    OR EXISTS (
      SELECT 1
      FROM files source_file
      WHERE source_file.id = document_chunks.source_id
        AND source_file.workspace_id = ${workspaceId}::uuid
        AND (
          source_file.uploaded_by = ${opts.userId}::uuid
          OR (
            source_file.project_id IS NOT NULL
            ${opts.role === 'guest'
              ? sql`AND source_file.project_id IN (
                  SELECT source_pm.project_id FROM project_members source_pm
                  WHERE source_pm.user_id = ${opts.userId}::uuid
                )`
              : sql``}
          )
          OR EXISTS (
            SELECT 1
            FROM message_attachments source_attachment
            INNER JOIN messages source_message ON source_message.id = source_attachment.message_id
            INNER JOIN channels source_channel ON source_channel.id = source_message.channel_id
            LEFT JOIN projects source_project ON source_project.id = source_channel.project_id
            WHERE source_attachment.file_id = source_file.id
              AND coalesce(source_channel.workspace_id, source_project.workspace_id) = ${workspaceId}::uuid
              AND ${channelAccess}
          )
          OR EXISTS (
            SELECT 1
            FROM channels source_channel
            LEFT JOIN projects source_project ON source_project.id = source_channel.project_id
            WHERE coalesce(source_channel.workspace_id, source_project.workspace_id) = ${workspaceId}::uuid
              AND (
                source_channel.id::text = source_file.metadata->>'channelId'
                OR source_file.metadata->'channelIds' @> jsonb_build_array(source_channel.id::text)
              )
              AND ${channelAccess}
          )
        )
    )
  )`

  // DM 停止中は、既存のDM専用ファイルから生成済みのチャンクも検索対象から外す。
  // プロジェクトまたは非DMチャンネルでも共有されたファイルは通常の情報として保持する。
  const dmFileScope = FEATURE_FLAGS.dm
    ? sql``
    : sql`AND (
        source_type <> 'file'
        OR NOT EXISTS (
          SELECT 1
          FROM files dm_file
          WHERE dm_file.id = document_chunks.source_id
            AND (
              EXISTS (
                SELECT 1
                FROM message_attachments dm_attachment
                INNER JOIN messages dm_message ON dm_message.id = dm_attachment.message_id
                INNER JOIN channels dm_channel ON dm_channel.id = dm_message.channel_id
                WHERE dm_attachment.file_id = dm_file.id
                  AND dm_channel.type = 'dm'
              )
              OR EXISTS (
                SELECT 1
                FROM channels dm_channel
                WHERE dm_channel.type = 'dm'
                  AND (
                    dm_channel.id::text = dm_file.metadata->>'channelId'
                    OR dm_file.metadata->'channelIds' @> jsonb_build_array(dm_channel.id::text)
                  )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM files non_dm_file
          WHERE non_dm_file.id = document_chunks.source_id
            AND (
              non_dm_file.project_id IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM message_attachments non_dm_attachment
                INNER JOIN messages non_dm_message ON non_dm_message.id = non_dm_attachment.message_id
                INNER JOIN channels non_dm_channel ON non_dm_channel.id = non_dm_message.channel_id
                WHERE non_dm_attachment.file_id = non_dm_file.id
                  AND non_dm_channel.type <> 'dm'
              )
              OR EXISTS (
                SELECT 1
                FROM channels non_dm_channel
                WHERE non_dm_channel.type <> 'dm'
                  AND (
                    non_dm_channel.id::text = non_dm_file.metadata->>'channelId'
                    OR non_dm_file.metadata->'channelIds' @> jsonb_build_array(non_dm_channel.id::text)
                  )
              )
            )
        )
      )`

  const rows = await db.execute<{
    source_type: string
    source_id: string
    content: string
    similarity: number
  }>(sql`
    SELECT source_type, source_id, content,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM document_chunks
    WHERE workspace_id = ${workspaceId}::uuid
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
      ${projectScope}
      ${fileAccessScope}
      ${dmFileScope}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `)

  return rows.map(r => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    content: r.content,
    similarity: Number(r.similarity),
  }))
}
