// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { embed } from 'ai'
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
