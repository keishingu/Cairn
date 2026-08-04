// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { embed } from 'ai'
import { FEATURE_FLAGS } from '@cairn/shared'
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
  opts: { limit?: number; minSimilarity?: number; allowedProjectIds?: string[] | null } = {},
): Promise<ChunkMatch[]> {
  const { limit = 5, minSimilarity = 0.5, allowedProjectIds = null } = opts

  // ゲストはアクセス可能なプロジェクトのチャンクのみ参照させる。プロジェクトが無ければ何も返さない。
  // （source_type='member' のチャンクはプロジェクトに紐づかないためゲストには返さない）
  if (allowedProjectIds != null && allowedProjectIds.length === 0) return []

  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: query,
  })

  const { db } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')

  const vectorStr = `[${embedding.join(',')}]`

  const projectScope = allowedProjectIds != null
    ? (() => {
        const idList = sql.join(allowedProjectIds.map(id => sql`${id}::uuid`), sql`, `)
        return sql`AND (
          (source_type = 'project' AND source_id IN (${idList}))
          OR (source_type = 'file' AND source_id IN (
            SELECT id FROM files WHERE project_id IN (${idList})
          ))
        )`
      })()
    : sql``

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
